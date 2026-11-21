import { Battle } from './battle/battle';
import type { LevelDef } from './content/levels';
import { pictureGroup, wordById } from './content/words';
import type { LearningEngine } from './learning/engine';
import { petPerk, petState } from './rewards';
import { shuffle, type Rng } from './rng';

const MAX_REVIEW_EXTRAS = 4;

export function reviewExtras(level: LevelDef, engine: LearningEngine, now: number): string[] {
  if (level.theme !== 'unit' || level.stage < 2 || level.mode === 'spell') return [];
  const inUnit = new Set(level.wordIds);
  return engine
    .dueWordIds('recognize', now)
    .filter((id) => !inUnit.has(id))
    .map((id) => ({ id, box: engine.stat(id, 'recognize')?.box ?? 0 }))
    .sort((a, b) => a.box - b.box)
    .slice(0, MAX_REVIEW_EXTRAS)
    .map((x) => x.id);
}

export function createBattleSession(
  level: LevelDef,
  engine: LearningEngine,
  rng: Rng,
  now: () => number,
  opts: { shield?: number } = {},
): Battle {
  const perk = petPerk(petState(engine)?.stage ?? 0);
  const onceQueue = level.eachOnce ? shuffle([...level.wordIds], rng) : null;
  const skill = level.mode === 'spell' ? 'spell' : 'recognize';

  let pool = level.wordIds;
  if (level.theme === 'mixed') {
    const seen = engine.seenWordIds().filter((id) => level.wordIds.includes(id));
    pool = seen.length >= level.maxOnScreen + 3 ? seen : level.wordIds;
  }

  const extras = reviewExtras(level, engine, now());

  const makeConflictFilter = (onScreen: Set<string>) => {
    const used = new Set<string>();
    for (const id of onScreen) {
      const w = wordById(id);
      for (const m of w.meanings) used.add('zh:' + m);
      if (w.picture) used.add('pic:' + pictureGroup(w.picture));
    }
    return (id: string) => {
      const w = wordById(id);
      return (
        !onScreen.has(id) &&
        !w.meanings.some((m) => used.has('zh:' + m)) &&
        !(w.picture && used.has('pic:' + pictureGroup(w.picture)))
      );
    };
  };

  return new Battle(level, {
    rng,
    pickWord: (onScreen, recent) => {
      const ok = makeConflictFilter(onScreen);
      if (onceQueue) {
        const idx = onceQueue.findIndex(ok);
        return idx >= 0 ? onceQueue.splice(idx, 1)[0] : null;
      }
      const due = extras.filter(ok);
      if (due.length && rng() < 0.2) {
        const picked = engine.pick(due, skill, now(), rng, onScreen, recent);
        if (picked) return picked;
      }
      return engine.pick(pool.filter(ok), skill, now(), rng, onScreen, recent);
    },
    canSpawn: (wordId, onScreen) => makeConflictFilter(onScreen)(wordId),
    onAnswer: (wordId, sk, outcome) => engine.record(wordId, sk, outcome, now()),
    shield: opts.shield,
    startEnergy: perk.energy,
    freezeBonus: perk.freeze,
  });
}
