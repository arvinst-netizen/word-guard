import { pickWeighted, type Rng } from '../rng';

export type Skill = 'recognize' | 'spell';
export type Outcome = 'perfect' | 'recovered' | 'missed';
export type Mastery = 'new' | 'learning' | 'familiar' | 'mastered';

export interface WordSkillStat {
  box: number;
  seen: number;
  perfect: number;
  missed: number;
  lastSeen: number;
  due: number;
  first?: number;
}

export type WordRecord = Partial<Record<Skill, WordSkillStat>>;

export interface LevelProgress {
  stars: number;
  plays: number;
  best?: number;
}

export interface PlacementRecord {
  band: number;
  course: string;
  unit: number;
  at: number;
}

export interface SessionLog {
  level: string;
  at: number;
  result: 'win' | 'lose' | 'quit';
  stars: number;
  secs: number;
  answers: number;
  perfect: number;
  missed: number;
  wrong: number;
  reactMs: number;
  combo?: number;
  score?: number;
}

export interface DailyClaim {
  day: string;
  claimed: boolean;
}

export interface TimeLimitSetting {
  minutes: number;
  bonus?: { day: string; minutes: number };
}

export interface SchoolProgress {
  course: string;
  unit: number;
}

export interface PetRecord {
  kind: number;
  name?: string;
  at: number;
}

export interface LearnerData {
  version: 1;
  createdAt: number;
  words: Record<string, WordRecord>;
  levels: Record<string, LevelProgress>;
  placement?: PlacementRecord;
  sessions?: SessionLog[];
  xp?: number;
  daily?: DailyClaim;
  limit?: TimeLimitSetting;
  school?: SchoolProgress;
  pet?: PetRecord;
}

const MINUTE = 60_000;
const DAY = 1440 * MINUTE;
const BOX_DELAYS = [0, 10 * MINUTE, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY];

export function emptyLearnerData(now: number): LearnerData {
  return {
    version: 1,
    createdAt: now,
    words: {},
    levels: {},
  };
}

export function sanitizePetName(raw: string): string {
  return [...raw.replace(/[\s<>&"'\\/]/g, '')].slice(0, 8).join('');
}

function clampInt(val: unknown, min: number, max: number): number {
  return Math.min(max, Math.max(min, typeof val === 'number' && Number.isFinite(val) ? Math.round(val) : min));
}

function finiteNum(val: unknown): number {
  return typeof val === 'number' && Number.isFinite(val) ? val : 0;
}

export function parseLearnerData(raw: string | null): LearnerData | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const d = parsed as Record<string, unknown>;
  if (
    d.version !== 1 ||
    typeof d.words !== 'object' ||
    typeof d.levels !== 'object' ||
    !d.words ||
    !d.levels
  ) {
    return null;
  }

  const words: Record<string, WordRecord> = {};
  for (const [id, rec] of Object.entries(d.words as Record<string, unknown>)) {
    if (!rec || typeof rec !== 'object') continue;
    const clean: WordRecord = {};
    for (const sk of ['recognize', 'spell'] as const) {
      const s = (rec as Record<string, unknown>)[sk] as Record<string, unknown> | undefined;
      if (s && typeof s === 'object') {
        const entry: WordSkillStat = {
          box: clampInt(s.box, 0, 5),
          seen: clampInt(s.seen, 0, 1e9),
          perfect: clampInt(s.perfect, 0, 1e9),
          missed: clampInt(s.missed, 0, 1e9),
          lastSeen: finiteNum(s.lastSeen),
          due: finiteNum(s.due),
        };
        if (typeof s.first === 'number' && s.first > 0) entry.first = s.first;
        clean[sk] = entry;
      }
    }
    words[id] = clean;
  }

  const levels: Record<string, LevelProgress> = {};
  for (const [id, rec] of Object.entries(d.levels as Record<string, unknown>)) {
    if (!rec || typeof rec !== 'object') continue;
    const r = rec as Record<string, unknown>;
    const entry: LevelProgress = {
      stars: clampInt(r.stars, 0, 3),
      plays: clampInt(r.plays, 0, 1e9),
    };
    const best = clampInt(r.best, 0, 1e7);
    if (best > 0) entry.best = best;
    levels[id] = entry;
  }

  const out: LearnerData = {
    version: 1,
    createdAt: finiteNum(d.createdAt),
    words,
    levels,
  };

  const pl = d.placement as Record<string, unknown> | undefined;
  if (pl && typeof pl === 'object') {
    if (typeof pl.course === 'string' && /^[a-z0-9-]{1,30}$/.test(pl.course)) {
      out.placement = {
        band: clampInt(pl.band, 0, 9),
        course: pl.course,
        unit: clampInt(pl.unit, 0, 9999),
        at: finiteNum(pl.at),
      };
    } else {
      const band = clampInt(pl.band, 0, 5);
      const unit = clampInt(pl.unit, -1, 9999);
      out.placement =
        unit < 0 || band === 0
          ? { band: 0, course: 'yle-starters', unit: 0, at: finiteNum(pl.at) }
          : { band: band + 1, course: 'ket', unit, at: finiteNum(pl.at) };
    }
  }

  if (Array.isArray(d.sessions)) {
    out.sessions = d.sessions
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof (s as Record<string, unknown>).level === 'string')
      .slice(-600)
      .map((s) => ({
        level: String(s.level).slice(0, 60),
        at: finiteNum(s.at),
        result: s.result === 'win' || s.result === 'lose' ? s.result : 'quit',
        stars: clampInt(s.stars, 0, 3),
        secs: clampInt(s.secs, 0, 36_000),
        answers: clampInt(s.answers, 0, 1000),
        perfect: clampInt(s.perfect, 0, 1000),
        missed: clampInt(s.missed, 0, 1000),
        wrong: clampInt(s.wrong, 0, 10_000),
        reactMs: clampInt(s.reactMs, 0, 600_000),
        ...(s.combo ? { combo: clampInt(s.combo, 0, 1000) } : {}),
        ...(s.score ? { score: clampInt(s.score, 0, 1e7) } : {}),
      }));
  }

  const xp = clampInt(d.xp, 0, 1e9);
  if (xp > 0) out.xp = xp;

  const daily = d.daily as Record<string, unknown> | undefined;
  if (daily && typeof daily === 'object' && typeof daily.day === 'string') {
    out.daily = { day: daily.day.slice(0, 12), claimed: daily.claimed === true };
  }

  const limit = d.limit as Record<string, unknown> | undefined;
  if (limit && typeof limit === 'object' && finiteNum(limit.minutes) > 0) {
    out.limit = { minutes: clampInt(limit.minutes, 1, 240) };
    const bonus = limit.bonus as Record<string, unknown> | undefined;
    if (bonus && typeof bonus.day === 'string' && finiteNum(bonus.minutes) > 0) {
      out.limit.bonus = { day: bonus.day, minutes: clampInt(bonus.minutes, 1, 240) };
    }
  }

  const school = d.school as Record<string, unknown> | undefined;
  if (school && typeof school === 'object' && typeof school.course === 'string') {
    out.school = { course: school.course, unit: clampInt(school.unit, 0, 999) };
  }

  const pet = d.pet as Record<string, unknown> | undefined;
  if (pet && typeof pet === 'object') {
    out.pet = { kind: clampInt(pet.kind, 0, 2), at: finiteNum(pet.at) };
    if (typeof pet.name === 'string' && pet.name.trim()) {
      out.pet.name = sanitizePetName(pet.name);
    }
  }

  return out;
}

export class LearningEngine {
  data: LearnerData;

  constructor(data: LearnerData) {
    this.data = data;
  }

  stat(wordId: string, skill: Skill): WordSkillStat | undefined {
    return this.data.words[wordId]?.[skill];
  }

  record(wordId: string, skill: Skill, outcome: Outcome, now: number): WordSkillStat {
    const rec = (this.data.words[wordId] ??= {});
    const st: WordSkillStat = rec[skill] ?? {
      box: 0,
      seen: 0,
      perfect: 0,
      missed: 0,
      lastSeen: 0,
      due: 0,
      first: now,
    };
    st.seen += 1;
    st.lastSeen = now;
    if (outcome === 'perfect') {
      st.perfect += 1;
      st.box = Math.min(5, st.box + 1);
    } else if (outcome === 'recovered') {
      st.box = Math.max(0, st.box - 1);
    } else {
      st.missed += 1;
      st.box = 0;
    }
    st.due = now + BOX_DELAYS[st.box];
    rec[skill] = st;
    return st;
  }

  weight(wordId: string, skill: Skill, now: number): number {
    const st = this.stat(wordId, skill);
    if (!st) return 3;
    const inv = 5 - st.box;
    return now >= st.due ? 4 + inv * 1.5 : 0.5 + inv * 0.4;
  }

  pick(
    candidates: string[],
    skill: Skill,
    now: number,
    rng: Rng,
    exclude: Set<string>,
    recent: string[] = [],
  ): string | null {
    let pool = candidates.filter((id) => !exclude.has(id) && !recent.includes(id));
    if (pool.length === 0) pool = candidates.filter((id) => !exclude.has(id));
    if (pool.length === 0) return null;
    const idx = pickWeighted(
      pool.map((id) => this.weight(id, skill, now)),
      rng,
    );
    return pool[idx];
  }

  mastery(wordId: string, skill: Skill): Mastery {
    const st = this.stat(wordId, skill);
    if (!st) return 'new';
    if (st.box >= 4) return 'mastered';
    if (st.box >= 2) return 'familiar';
    return 'learning';
  }

  progress(wordId: string): number {
    const r = this.stat(wordId, 'recognize')?.box ?? 0;
    const s = this.stat(wordId, 'spell')?.box ?? 0;
    return (r * 0.6 + s * 0.4) / 5;
  }

  seenWordIds(): string[] {
    return Object.keys(this.data.words).filter(
      (id) => Object.keys(this.data.words[id] ?? {}).length > 0,
    );
  }

  dueWordIds(skill: Skill, now: number): string[] {
    return this.seenWordIds().filter((id) => {
      const st = this.stat(id, skill);
      return st !== undefined && now >= st.due;
    });
  }

  saveLevel(
    levelId: string,
    stars: number,
    score = 0,
  ): { improved: boolean; record: boolean; prevBest: number } {
    const prev = this.data.levels[levelId];
    const bestStars = Math.max(prev?.stars ?? 0, stars);
    const prevBest = prev?.best ?? 0;
    const entry: LevelProgress = {
      stars: bestStars,
      plays: (prev?.plays ?? 0) + 1,
    };
    if (Math.max(prevBest, score) > 0) entry.best = Math.max(prevBest, score);
    this.data.levels[levelId] = entry;
    return {
      improved: bestStars > (prev?.stars ?? 0),
      record: prevBest > 0 && score > prevBest,
      prevBest,
    };
  }

  get xp(): number {
    return this.data.xp ?? 0;
  }

  addXp(delta: number): number {
    this.data.xp = Math.max(0, Math.round((this.data.xp ?? 0) + delta));
    return this.data.xp;
  }

  levelBest(levelId: string): number {
    return this.data.levels[levelId]?.best ?? 0;
  }

  logSession(entry: SessionLog): void {
    const list = (this.data.sessions ??= []);
    list.push(entry);
    if (list.length > 600) list.splice(0, list.length - 600);
  }

  levelStars(levelId: string): number {
    return this.data.levels[levelId]?.stars ?? 0;
  }

  serialize(): string {
    return JSON.stringify(this.data);
  }
}
