import { getCourse, unitLevels, type LevelDef } from './content/levels';
import type { LearningEngine } from './learning/engine';
import type { Rng } from './rng';

export const LIMIT_PRESETS = [0, 10, 15, 20, 30, 45] as const;

const dayKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export function todayMinutes(engine: LearningEngine, now: number): number {
  const today = new Date(now).toDateString();
  return (
    (engine.data.sessions ?? [])
      .filter((s) => new Date(s.at).toDateString() === today)
      .reduce((sum, s) => sum + s.secs, 0) / 60
  );
}

export interface LimitStatus {
  limit: number;
  used: number;
  left: number;
  over: boolean;
}

export function limitStatus(engine: LearningEngine, now: number): LimitStatus {
  const lim = engine.data.limit;
  const used = todayMinutes(engine, now);
  if (!lim || lim.minutes <= 0) {
    return { limit: 0, used, left: Infinity, over: false };
  }
  const total = lim.minutes + (lim.bonus?.day === dayKey(now) ? lim.bonus.minutes : 0);
  return {
    limit: total,
    used,
    left: Math.max(0, total - used),
    over: used >= total,
  };
}

export function setDailyLimit(engine: LearningEngine, minutes: number): void {
  if (minutes <= 0) {
    delete engine.data.limit;
  } else {
    engine.data.limit = { minutes, bonus: engine.data.limit?.bonus };
  }
}

export function addDailyBonus(engine: LearningEngine, now: number, extra = 10): void {
  const lim = engine.data.limit;
  if (!lim) return;
  const day = dayKey(now);
  lim.bonus = {
    day,
    minutes: (lim.bonus?.day === day ? lim.bonus.minutes : 0) + extra,
  };
}

export function makeParentQuiz(rng: Rng): { question: string; answer: number } {
  const a = 6 + Math.floor(rng() * 4);
  const b = 6 + Math.floor(rng() * 4);
  return { question: `${a} × ${b} = ?`, answer: a * b };
}

export function setSchoolUnit(engine: LearningEngine, course?: string, unit = 0): void {
  if (course) {
    engine.data.school = { course, unit };
  } else {
    delete engine.data.school;
  }
}

export function isSchoolUnit(engine: LearningEngine, course: string, unit: number): boolean {
  const sc = engine.data.school;
  return !!sc && sc.course === course && sc.unit === unit;
}

export function schoolNextLevel(engine: LearningEngine): LevelDef | null {
  const sc = engine.data.school;
  if (!sc) return null;
  try {
    if (!getCourse(sc.course).units[sc.unit]) return null;
  } catch {
    return null;
  }
  return unitLevels(sc.course, sc.unit).find((l) => engine.levelStars(l.id) === 0) ?? null;
}
