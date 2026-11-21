import {
  cambridgeUnitIndex,
  chaptersForRoute,
  getCourse,
  getLevel,
  registerTempLevel,
  unitLevelId,
  unitLevels,
  type LevelDef,
  type RouteId,
} from './content/levels';
import { WORDS } from './content/words';
import type { LearningEngine, PlacementRecord } from './learning/engine';
import { schoolNextLevel } from './parent';

export const REVIEW_LEVEL_ID = 'daily-review';
const MIN_REVIEW_WORDS = 8;

export function placementGlobalUnit(pl?: PlacementRecord): number {
  if (!pl) return -1;
  const course = pl.course ?? 'ket';
  return pl.unit < 0 ? 0 : cambridgeUnitIndex(course, pl.unit);
}

export function isLevelUnlocked(level: LevelDef, engine: LearningEngine): boolean {
  if (level.unit === undefined || engine.levelStars(level.id) > 0) return true;
  const unit = level.unit;
  const course = getCourse(level.course);
  const plIdx = placementGlobalUnit(engine.data.placement);
  if (course.route === 'cambridge' && plIdx >= 0 && cambridgeUnitIndex(level.course, unit) < plIdx) {
    return true;
  }
  if (level.stage > 1) {
    const prev = unitLevels(level.course, unit).filter((l) => l.stage < level.stage);
    return prev.length === 0 || engine.levelStars(prev[prev.length - 1].id) > 0;
  }
  return (
    course.route === 'shanghai' ||
    unit === 0 ||
    (plIdx >= 0 && cambridgeUnitIndex(level.course, unit) === plIdx) ||
    engine.levelStars(unitLevelId(level.course, unit - 1, 2)) > 0
  );
}

export function isUnitUnlocked(courseId: string, unit: number, engine: LearningEngine): boolean {
  const first = unitLevels(courseId, unit)[0];
  return !!first && isLevelUnlocked(first, engine);
}

export function nextPlayableLevel(engine: LearningEngine, route: RouteId = 'cambridge'): LevelDef {
  const all = chaptersForRoute(route).flatMap((c) => c.levels);
  if (route === 'shanghai') {
    const played = all.filter((l) => engine.levelStars(l.id) > 0);
    const last = played[played.length - 1];
    const pool = last ? all.filter((l) => l.course === last.course) : all;
    return pool.find((l) => engine.levelStars(l.id) === 0) ?? pool[pool.length - 1];
  }
  const plIdx = placementGlobalUnit(engine.data.placement);
  return (
    all.find(
      (l) =>
        cambridgeUnitIndex(l.course, l.unit ?? 0) >= plIdx &&
        isLevelUnlocked(l, engine) &&
        engine.levelStars(l.id) === 0,
    ) ?? all[all.length - 1]
  );
}

export function activeChapterIndex(engine: LearningEngine, route: RouteId = 'cambridge'): number {
  const ch = nextPlayableLevel(engine, route).chapter;
  return Math.max(
    0,
    chaptersForRoute(route).findIndex((c) => c.id === ch),
  );
}

export function buildReviewLevel(engine: LearningEngine, now: number): LevelDef | null {
  const seen = new Set(engine.seenWordIds());
  const due = WORDS.filter((w) => seen.has(w.id))
    .map((w) => ({ id: w.id, s: engine.stat(w.id, 'recognize') }))
    .filter((x): x is { id: string; s: NonNullable<typeof x.s> } => !!x.s && now >= x.s.due)
    .sort((a, b) => a.s.box - b.s.box || a.s.due - b.s.due)
    .map((x) => x.id);

  if (due.length < MIN_REVIEW_WORDS) return null;

  const lvl: LevelDef = {
    id: REVIEW_LEVEL_ID,
    course: 'review',
    chapter: 'review',
    stage: 1,
    theme: 'mixed',
    title: '今日复习',
    tip: '这些词该复习了，最容易忘的先来！',
    mode: 'listen',
    showText: false,
    monsters: Math.min(14, Math.max(10, due.length)),
    maxOnScreen: 4,
    crossSeconds: 22,
    spawnGap: [2.6, 3.8],
    wordIds: due.slice(0, 30),
  };
  registerTempLevel(lvl);
  return lvl;
}

export function reviewCandidateCount(engine: LearningEngine, now: number): number {
  return engine.dueWordIds('recognize', now).length;
}

export function continueTarget(
  engine: LearningEngine,
  now: number,
): { level: LevelDef; review: boolean } | null {
  const sessions = engine.data.sessions ?? [];
  if (sessions.length === 0 && !engine.data.placement) return null;

  const today = new Date(now).toDateString();
  if (
    !sessions.some(
      (s) => s.level === REVIEW_LEVEL_ID && new Date(s.at).toDateString() === today,
    )
  ) {
    const rev = buildReviewLevel(engine, now);
    if (rev) return { level: rev, review: true };
  }

  const school = schoolNextLevel(engine);
  if (school) return { level: school, review: false };

  let route: RouteId = 'cambridge';
  let lastUnitLevel: LevelDef | undefined;
  for (let i = sessions.length - 1; i >= 0; i--) {
    try {
      const lvl = getLevel(sessions[i].level);
      if (lvl.unit === undefined) continue;
      route = getCourse(lvl.course).route;
      lastUnitLevel = lvl;
      break;
    } catch {
      // ignore obsolete level id
    }
  }

  if (lastUnitLevel && (route === 'shanghai' || !engine.data.placement)) {
    const all = chaptersForRoute(route).flatMap((c) => c.levels);
    const pool = route === 'shanghai' ? all.filter((l) => l.course === lastUnitLevel!.course) : all;
    const idx = pool.findIndex(
      (l) => l.course === lastUnitLevel!.course && l.unit === lastUnitLevel!.unit,
    );
    const next = pool
      .slice(Math.max(0, idx))
      .find((l) => engine.levelStars(l.id) === 0 && isLevelUnlocked(l, engine));
    if (next) return { level: next, review: false };
  }

  return { level: nextPlayableLevel(engine, route), review: false };
}
