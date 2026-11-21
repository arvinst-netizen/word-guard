import { unitLevels } from './content/levels';
import type { LearningEngine, Mastery } from './learning/engine';

export const OUTFITS = [
  '小红帽',
  '蝴蝶结',
  '小花',
  '墨镜',
  '魔法帽',
  '耳机',
  '皇冠',
  '围巾',
  '小犄角',
  '宇航头盔',
] as const;

export function knownWordCount(engine: LearningEngine): number {
  return engine.seenWordIds().filter((id) => {
    const m = engine.mastery(id, 'recognize');
    return m === 'familiar' || m === 'mastered';
  }).length;
}

export function unlockedOutfitCount(known: number): number {
  return Math.min(OUTFITS.length, Math.floor(known / 50));
}

export function wordsToNextOutfit(known: number): number {
  const n = unlockedOutfitCount(known);
  return n >= OUTFITS.length ? 0 : (n + 1) * 50 - known;
}

const DAY_MS = 86_400_000;
const dayKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

function activeDaySet(engine: LearningEngine): Set<string> {
  const days = new Set<string>();
  for (const s of engine.data.sessions ?? []) {
    if (s.answers >= 3) days.add(dayKey(s.at));
  }
  return days;
}

export function streakInfo(engine: LearningEngine, now: number): { days: number; today: boolean } {
  const days = activeDaySet(engine);
  const today = days.has(dayKey(now));
  let count = 0;
  for (let ts = today ? now : now - DAY_MS; days.has(dayKey(ts)); ts -= DAY_MS) {
    count++;
  }
  return { days: count, today };
}

export function isUnitCompleted(engine: LearningEngine, courseId: string, unit: number): boolean {
  const lvls = unitLevels(courseId, unit);
  return lvls.length > 0 && lvls.every((l) => engine.levelStars(l.id) > 0);
}

const isKnown = (m: Mastery): boolean => m === 'familiar' || m === 'mastered';

export type CardState = 'none' | 'lit' | 'gold';

export function wordCardState(engine: LearningEngine, wordId: string): CardState {
  if (isKnown(engine.mastery(wordId, 'spell'))) return 'gold';
  if (isKnown(engine.mastery(wordId, 'recognize'))) return 'lit';
  return 'none';
}

export function collectionCounts(engine: LearningEngine): { lit: number; gold: number } {
  let lit = 0;
  let gold = 0;
  for (const id of engine.seenWordIds()) {
    const st = wordCardState(engine, id);
    if (st !== 'none') lit++;
    if (st === 'gold') gold++;
  }
  return { lit, gold };
}

export const RANKS = [
  { xp: 0, title: '见习守卫' },
  { xp: 1500, title: '小卫兵' },
  { xp: 4000, title: '卫兵' },
  { xp: 9000, title: '骑士' },
  { xp: 18000, title: '大骑士' },
  { xp: 32000, title: '队长' },
  { xp: 55000, title: '将军' },
  { xp: 90000, title: '英雄' },
  { xp: 140000, title: '传奇守卫' },
  { xp: 220000, title: '守卫之王' },
] as const;

export interface RankInfo {
  index: number;
  title: string;
  have: number;
  need: number;
  progress: number;
  nextTitle?: string;
}

export function rankForXp(xp: number): RankInfo {
  let idx = 0;
  while (idx + 1 < RANKS.length && xp >= RANKS[idx + 1].xp) idx++;
  const next = RANKS[idx + 1];
  const have = xp - RANKS[idx].xp;
  const need = next ? next.xp - RANKS[idx].xp : 0;
  return {
    index: idx,
    title: RANKS[idx].title,
    have,
    need,
    progress: need ? Math.min(1, have / need) : 1,
    nextTitle: next?.title,
  };
}

export const CASTLE_NAMES = ['小木屋', '带旗子的木屋', '石头塔楼', '城堡', '金顶大城堡'] as const;

export function castleTier(rankIndex: number): number {
  return Math.min(CASTLE_NAMES.length - 1, Math.floor(rankIndex / 2));
}

export interface DailyTask {
  id: 'win' | 'perfect' | 'combo';
  label: string;
  have: number;
  goal: number;
  done: boolean;
}

export interface DailyStatus {
  tasks: DailyTask[];
  allDone: boolean;
  claimed: boolean;
}

export function dailyStatus(engine: LearningEngine, now: number): DailyStatus {
  const today = dayKey(now);
  const sessions = (engine.data.sessions ?? []).filter((s) => dayKey(s.at) === today);
  const wins = sessions.filter((s) => s.result === 'win').length;
  const perfects = sessions.reduce((sum, s) => sum + s.perfect, 0);
  const maxCombo = sessions.reduce((best, s) => Math.max(best, s.combo ?? 0), 0);
  const mk = (id: DailyTask['id'], label: string, val: number, goal: number): DailyTask => ({
    id,
    label,
    have: Math.min(val, goal),
    goal,
    done: val >= goal,
  });
  const tasks = [
    mk('win', '守住一关', wins, 1),
    mk('perfect', '一次答对 20 题', perfects, 20),
    mk('combo', '打出一次 5 连击', maxCombo, 5),
  ];
  return {
    tasks,
    allDone: tasks.every((t) => t.done),
    claimed: engine.data.daily?.day === today && engine.data.daily.claimed,
  };
}

export function claimDailyChest(engine: LearningEngine, now: number): number {
  const st = dailyStatus(engine, now);
  if (!st.allDone || st.claimed) return 0;
  engine.data.daily = { day: dayKey(now), claimed: true };
  engine.addXp(300);
  return 300;
}

export const PET_KINDS = [
  { id: 'dragon', name: '小龙', egg: '绿色的蛋' },
  { id: 'fox', name: '小狐', egg: '橙色的蛋' },
  { id: 'owl', name: '小猫头鹰', egg: '蓝色的蛋' },
] as const;

export const PET_STAGES = [
  { points: 0, title: '蛋' },
  { points: 3, title: '宝宝' },
  { points: 30, title: '小不点' },
  { points: 100, title: '少年' },
  { points: 250, title: '大伙伴' },
  { points: 600, title: '传说伙伴' },
] as const;

export interface PetState {
  kind: number;
  name: string;
  named: boolean;
  stage: number;
  title: string;
  points: number;
  toNext: number;
  progress: number;
  nextTitle: string | null;
}

export function petPoints(engine: LearningEngine): number {
  const c = collectionCounts(engine);
  return c.lit + c.gold;
}

export function petStageForPoints(points: number): number {
  let st = 0;
  for (let i = 0; i < PET_STAGES.length; i++) {
    if (points >= PET_STAGES[i].points) st = i;
  }
  return st;
}

export function petState(engine: LearningEngine): PetState | null {
  const pet = engine.data.pet;
  if (!pet) return null;
  const pts = petPoints(engine);
  const stage = petStageForPoints(pts);
  const cur = PET_STAGES[stage];
  const next = PET_STAGES[stage + 1];
  return {
    kind: pet.kind,
    name: pet.name || PET_KINDS[pet.kind].name,
    named: !!pet.name,
    stage,
    title: cur.title,
    points: pts,
    toNext: next ? next.points - pts : 0,
    progress: next ? (pts - cur.points) / (next.points - cur.points) : 1,
    nextTitle: next ? next.title : null,
  };
}

export interface PetPerk {
  energy: number;
  freeze: number;
  text: string;
}

export function petPerk(stage: number): PetPerk {
  if (stage >= 5) return { energy: 3, freeze: 2, text: '开局带 3 点能量，冰冻多 2 秒' };
  if (stage >= 4) return { energy: 2, freeze: 2, text: '开局带 2 点能量，冰冻多 2 秒' };
  if (stage >= 3) return { energy: 2, freeze: 0, text: '开局带 2 点能量' };
  if (stage >= 2) return { energy: 1, freeze: 0, text: '开局带 1 点能量' };
  return { energy: 0, freeze: 0, text: '' };
}
