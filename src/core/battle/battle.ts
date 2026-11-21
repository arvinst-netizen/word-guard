import {
  maxSpellWrongs,
  nextBlankIndex,
  type LevelDef,
  type LevelMode,
} from '../content/levels';
import type { Outcome, Skill } from '../learning/engine';
import { pickWeighted, shuffle, type Rng } from '../rng';

export type MonsterVariant = 'normal' | 'fast' | 'big' | 'gold';
export type StartSkill = 'freeze' | 'reveal' | 'heart';

export interface MonsterState {
  id: number;
  lane: number;
  x: number;
  speed: number;
  wordId: string;
  kind: number;
  variant?: MonsterVariant;
  retry?: boolean;
  decoy?: boolean;
}

export interface SpellTile {
  ch: string;
  used: boolean;
}

export interface ActiveCall {
  monsterId: number;
  wordId: string;
  wrongs: number;
  hinted: boolean;
  revealed?: boolean;
  tiles: SpellTile[];
  progress: number;
  blank: boolean[];
  maxWrongs: number;
  startedAt: number;
  retry: boolean;
}

export interface BattleAnswer {
  wordId: string;
  outcome: Outcome;
  retry?: boolean;
}

export interface DefeatGain {
  points: number;
  combo: number;
  fast: boolean;
  bonus?: number;
}

export type BattleEvent =
  | { type: 'spawn'; monster: MonsterState }
  | { type: 'call'; monsterId: number; wordId: string }
  | { type: 'defeat'; monsterId: number; wordId: string; outcome: Outcome; gain: DefeatGain }
  | {
      type: 'wrongTap';
      monsterId: number;
      tappedWordId: string;
      targetId: number;
      wordId: string;
      hearts: number;
      shielded?: boolean;
    }
  | { type: 'spellLetter'; tileIndex: number; progress: number }
  | { type: 'spellWrong'; tileIndex: number; left: number }
  | {
      type: 'spellFail';
      monsterId: number;
      wordId: string;
      hearts: number;
      shielded?: boolean;
    }
  | { type: 'hint'; monsterId: number; tileIndex?: number }
  | {
      type: 'leak';
      monsterId: number;
      wordId: string;
      wasTarget: boolean;
      hearts: number;
      shielded?: boolean;
    }
  | { type: 'flee'; monsterId: number }
  | { type: 'freeze'; seconds: number }
  | { type: 'reveal'; monsterId: number; tileIndex?: number }
  | { type: 'enrage' }
  | { type: 'end'; result: 'win' | 'lose' };

export interface BattleDeps {
  rng: Rng;
  pickWord: (onScreen: Set<string>, recent: string[]) => string | null;
  canSpawn?: (wordId: string, onScreen: Set<string>) => boolean;
  onAnswer: (wordId: string, skill: Skill, outcome: Outcome) => void;
  shield?: number;
  startEnergy?: number;
  freezeBonus?: number;
}

export interface BattleSummary {
  battle: number;
  hearts: number;
  flawless: number;
  total: number;
  bestCombo: number;
  defeated: number;
}

interface RetryEntry {
  wordId: string;
  kind: number;
  at: number;
  minAt: number;
}

export const WRONG_COST = 0.5;
export const RULES = { retryWrongCost: 0.5, minChoices: 3 };
export const TAP_STUN = 1.6;
export const SPELL_STUN = 2.4;

export const SCORING = {
  perfect: 100,
  recovered: 50,
  fast: 50,
  comboStep: 10,
  comboCap: 10,
  heart: 100,
  flawless: 300,
};

export const BOSS_ENRAGE_SPEED = 1.3;

export const PACE = {
  min: 0.78,
  max: 1.24,
  up: 0.06,
  down: 0.1,
  window: 4,
};

export const VARIANTS: Record<MonsterVariant, { speed: number; bonus: number }> = {
  normal: { speed: 1, bonus: 0 },
  fast: { speed: 1.32, bonus: 40 },
  big: { speed: 0.8, bonus: 0 },
  gold: { speed: 1.1, bonus: 200 },
};

const CALL_DELAY = 0.5;
const DANGER_X = 0.3;
const DECOY_FLEE_X = 0.14;

export class Battle {
  level: LevelDef;
  deps: BattleDeps;
  mode: LevelMode;
  time = 0;
  hearts = 3;
  monsters: MonsterState[] = [];
  call: ActiveCall | null = null;
  spawned = 0;
  result: 'win' | 'lose' | null = null;
  answers: BattleAnswer[] = [];
  stunUntil = 0;
  reactions: number[] = [];
  wrongTaps = 0;
  score = 0;
  combo = 0;
  bestCombo = 0;
  energy = 0;
  startSkill: StartSkill = 'freeze';
  private bonusHearts = 0;
  freezeUntil = 0;
  shield = 0;
  enraged = false;
  pace = 1;
  private form: number[] = [];
  private nextId = 1;
  private nextSpawnAt = 1;
  private nextCallAt = 0;
  private recent: string[] = [];
  private events: BattleEvent[] = [];
  private retries: RetryEntry[] = [];
  private decoyDry = false;

  constructor(level: LevelDef, deps: BattleDeps) {
    this.level = level;
    this.deps = deps;
    this.mode = level.mode;
    this.hearts = level.hearts ?? 3;
    this.shield = deps.shield ?? 0;
    this.energy = Math.min(5, deps.startEnergy ?? 0);
  }

  get frozen(): boolean {
    return this.time < this.freezeUntil;
  }

  selectSkill(skill: StartSkill): void {
    if (this.time > 0 || this.answers.length > 0) return;
    this.startSkill = skill;
    this.bonusHearts = skill === 'heart' ? 1 : 0;
    this.hearts = this.maxHearts;
  }

  get skillReady(): boolean {
    if (this.result || this.startSkill === 'heart' || this.energy < 5) return false;
    if (this.startSkill === 'reveal') return this.call !== null;
    return true;
  }

  useSkill(): void {
    if (!this.skillReady) return;
    this.energy = 0;
    if (this.startSkill === 'reveal') {
      const c = this.call!;
      c.revealed = true;
      const tileIndex = this.mode === 'spell' ? this.nextTileIndex() : undefined;
      this.events.push({
        type: 'reveal',
        monsterId: c.monsterId,
        tileIndex: tileIndex !== undefined && tileIndex >= 0 ? tileIndex : undefined,
      });
      return;
    }
    const seconds = 6 + (this.deps.freezeBonus ?? 0);
    this.freezeUntil = this.time + seconds;
    this.events.push({ type: 'freeze', seconds });
  }

  get bossHp(): number {
    return this.level.boss
      ? Math.max(0, this.level.monsters - this.answers.filter((a) => a.outcome !== 'missed').length)
      : 0;
  }

  private loseHearts(amount: number): boolean {
    if (this.shield > 0) {
      --this.shield;
      return true;
    }
    this.hearts = Math.max(0, this.hearts - amount);
    return false;
  }

  get maxHearts(): number {
    return (this.level.hearts ?? 3) + this.bonusHearts;
  }

  get skill(): Skill {
    return this.mode === 'spell' ? 'spell' : 'recognize';
  }

  get stunned(): boolean {
    return this.time < this.stunUntil;
  }

  get minChoices(): number {
    return Math.max(2, Math.min(RULES.minChoices, this.level.maxOnScreen));
  }

  get pendingRetries(): number {
    return this.retries.length;
  }

  get accuracy(): number {
    const firstTries = this.answers.filter((a) => !a.retry);
    if (firstTries.length === 0) return 0;
    return firstTries.filter((a) => a.outcome === 'perfect').length / firstTries.length;
  }

  get stars(): number {
    if (this.result !== 'win') return 0;
    const acc = this.accuracy;
    const [t1, t2] = this.mode === 'spell' ? [0.3, 0.6] : [0.6, 0.85];
    return 1 + +(acc >= t1) + +(acc >= t2 && this.hearts >= 2);
  }

  get summary(): BattleSummary {
    const won = this.result === 'win';
    const firstTries = this.answers.filter((a) => !a.retry);
    const hearts = won ? Math.round(this.hearts * 2) * (SCORING.heart / 2) : 0;
    const flawless =
      won && firstTries.length > 0 && firstTries.every((a) => a.outcome === 'perfect')
        ? SCORING.flawless
        : 0;
    return {
      battle: this.score,
      hearts,
      flawless,
      total: this.score + hearts + flawless,
      bestCombo: this.bestCombo,
      defeated: this.answers.filter((a) => a.outcome !== 'missed').length,
    };
  }

  drainEvents(): BattleEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  update(dt: number): void {
    if (this.result) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;

    if (!this.frozen) {
      for (const m of this.monsters) m.x -= m.speed * dt;
    }

    for (const m of this.monsters.filter((m) => m.decoy && m.x <= DECOY_FLEE_X)) {
      this.flee(m);
    }

    for (const m of this.monsters.filter((m) => m.x <= 0)) {
      this.leak(m);
      if (this.result) return;
    }

    this.trySpawn();
    this.tryCall();

    if (
      this.spawned >= this.level.monsters &&
      this.retries.length === 0 &&
      this.monsters.every((m) => m.decoy)
    ) {
      for (const m of [...this.monsters]) this.flee(m);
      this.finish('win');
    }
  }

  private flee(m: MonsterState): void {
    this.removeMonster(m.id);
    this.events.push({ type: 'flee', monsterId: m.id });
  }

  tapMonster(monsterId: number): void {
    if (this.result || this.mode === 'spell' || !this.call || this.stunned) return;
    const m = this.monsters.find((x) => x.id === monsterId);
    if (!m) return;
    if (m.wordId === this.call.wordId) {
      this.resolveHit(m);
      return;
    }
    const call = this.call;
    this.wrongTaps += 1;
    const shielded = this.failCall(TAP_STUN);
    this.events.push({
      type: 'wrongTap',
      monsterId,
      tappedWordId: m.wordId,
      targetId: call.monsterId,
      wordId: call.wordId,
      hearts: this.hearts,
      ...(shielded ? { shielded } : {}),
    });
    if (this.hearts <= 0) this.finish('lose');
  }

  tapTile(tileIndex: number): void {
    if (this.result || this.mode !== 'spell' || !this.call || this.stunned) return;
    const call = this.call;
    const tile = call.tiles[tileIndex];
    if (!tile || tile.used) return;
    const expected = call.wordId[call.progress];
    if (tile.ch === expected) {
      tile.used = true;
      call.progress = nextBlankIndex(call.blank, call.progress + 1);
      this.events.push({ type: 'spellLetter', tileIndex, progress: call.progress });
      if (call.progress >= call.wordId.length) {
        const m = this.monsters.find((x) => x.id === call.monsterId);
        if (m) this.resolveHit(m);
      }
    } else {
      call.wrongs += 1;
      this.wrongTaps += 1;
      this.combo = 0;
      this.events.push({
        type: 'spellWrong',
        tileIndex,
        left: Math.max(0, call.maxWrongs - call.wrongs),
      });
      if (call.wrongs >= call.maxWrongs) {
        const shielded = this.failCall(SPELL_STUN);
        this.events.push({
          type: 'spellFail',
          monsterId: call.monsterId,
          wordId: call.wordId,
          hearts: this.hearts,
          ...(shielded ? { shielded } : {}),
        });
        if (this.hearts <= 0) this.finish('lose');
      }
    }
  }

  get canHint(): boolean {
    const c = this.call;
    return !!c && !this.result && this.mode === 'spell' && !this.stunned && c.wrongs < c.maxWrongs - 1;
  }

  hint(): void {
    const c = this.call;
    if (!c || !this.canHint) return;
    c.hinted = true;
    c.wrongs += 1;
    this.combo = 0;
    const idx = this.nextTileIndex();
    this.events.push({
      type: 'hint',
      monsterId: c.monsterId,
      tileIndex: idx >= 0 ? idx : undefined,
    });
  }

  nextTileIndex(): number {
    const c = this.call;
    if (!c) return -1;
    const ch = c.wordId[c.progress];
    return c.tiles.findIndex((t) => !t.used && t.ch === ch);
  }

  private failCall(stunSeconds: number): boolean {
    const c = this.call!;
    const m = this.monsters.find((x) => x.id === c.monsterId);
    this.combo = 0;
    const shielded = this.loseHearts(c.retry ? RULES.retryWrongCost : WRONG_COST);
    this.answers.push({ wordId: c.wordId, outcome: 'missed', retry: c.retry || undefined });
    this.deps.onAnswer(c.wordId, this.skill, 'missed');
    if (m) {
      this.removeMonster(m.id);
      this.retries.push({
        wordId: c.wordId,
        kind: m.kind,
        at: this.time + Math.max(6, stunSeconds + 1),
        minAt: this.time + stunSeconds + 1,
      });
    }
    this.call = null;
    this.adapt(-1);
    this.stunUntil = this.time + stunSeconds;
    this.nextCallAt = this.time + stunSeconds + 0.3;
    return shielded;
  }

  private resolveHit(m: MonsterState): void {
    const c = this.call!;
    const clean = c.wrongs === 0 && !c.hinted;
    const outcome: Outcome = clean && !c.retry ? 'perfect' : 'recovered';
    const elapsed = this.time - c.startedAt;
    this.reactions.push(elapsed);
    this.removeMonster(m.id);
    this.call = null;
    this.nextCallAt = this.time + CALL_DELAY;
    this.answers.push({ wordId: m.wordId, outcome, retry: c.retry || undefined });
    this.deps.onAnswer(m.wordId, this.skill, outcome);

    this.combo = clean ? this.combo + 1 : 0;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    if (clean) this.energy = Math.min(5, this.energy + 1);

    const fast = clean && this.mode !== 'spell' && elapsed <= 3;
    const base = outcome === 'perfect' ? SCORING.perfect : SCORING.recovered;
    const comboPts = clean
      ? Math.min(Math.max(0, this.combo - 1), SCORING.comboCap) * SCORING.comboStep
      : 0;
    const bonus = outcome === 'perfect' ? VARIANTS[m.variant ?? 'normal'].bonus : 0;
    const points = base + comboPts + (fast ? SCORING.fast : 0) + bonus;
    this.score += points;

    this.adapt(+(outcome === 'perfect' && (this.mode === 'spell' ? elapsed <= 12 : elapsed <= 3)));

    this.events.push({
      type: 'defeat',
      monsterId: m.id,
      wordId: m.wordId,
      outcome,
      gain: {
        points,
        combo: this.combo,
        fast,
        ...(bonus ? { bonus } : {}),
      },
    });

    if (this.level.boss && !this.enraged && this.bossHp > 0 && this.bossHp <= this.level.monsters / 2) {
      this.enraged = true;
      this.events.push({ type: 'enrage' });
    }
  }

  private leak(m: MonsterState): void {
    const wasTarget = this.call?.monsterId === m.id;
    this.removeMonster(m.id);
    const shielded = this.loseHearts(1);
    this.combo = 0;
    this.adapt(-1);
    if (wasTarget && this.call) {
      const retry = this.call.retry;
      this.call = null;
      this.nextCallAt = this.time + CALL_DELAY;
      this.answers.push({ wordId: m.wordId, outcome: 'missed', retry: retry || undefined });
      this.deps.onAnswer(m.wordId, this.skill, 'missed');
    }
    this.events.push({
      type: 'leak',
      monsterId: m.id,
      wordId: m.wordId,
      wasTarget,
      hearts: this.hearts,
      ...(shielded ? { shielded } : {}),
    });
    if (this.hearts <= 0) this.finish('lose');
  }

  private adapt(delta: number): void {
    this.form = [...this.form, delta].slice(-PACE.window);
    if (delta < 0) {
      this.pace = Math.max(PACE.min, this.pace - PACE.down);
      this.rescale();
    } else if (this.form.length >= PACE.window && this.form.every((v) => v > 0)) {
      this.pace = Math.min(PACE.max, this.pace + PACE.up);
      this.form = this.form.slice(1);
    }
  }

  private rescale(): void {
    for (const m of this.monsters) {
      m.speed = Math.min(m.speed, this.baseSpeed(m.variant) * 1.1);
    }
  }

  private baseSpeed(variant: MonsterVariant = 'normal'): number {
    return (1 / this.level.crossSeconds) * this.pace * VARIANTS[variant].speed * (this.enraged ? BOSS_ENRAGE_SPEED : 1);
  }

  private pickVariant(): MonsterVariant {
    const lvl = this.level;
    if (lvl.theme === 'unit' && lvl.stage === 1) return 'normal';
    const r = this.deps.rng();
    if (this.mode === 'spell') return r < 0.08 ? 'gold' : 'normal';
    if (r < 0.06) return 'gold';
    if (r < 0.22) return 'fast';
    if (r < 0.36) return 'big';
    return 'normal';
  }

  private removeMonster(id: number): void {
    this.monsters = this.monsters.filter((m) => m.id !== id);
  }

  private finish(result: 'win' | 'lose'): void {
    if (this.result) return;
    this.result = result;
    this.call = null;
    this.events.push({ type: 'end', result });
  }

  private trySpawn(): void {
    const lvl = this.level;
    const moreReal = this.spawned < lvl.monsters;
    const realOnScreen = this.monsters.filter((m) => !m.decoy).length;
    const needDecoy =
      this.mode !== 'spell' &&
      !moreReal &&
      !this.decoyDry &&
      this.monsters.length < this.minChoices &&
      (realOnScreen > 0 || this.retries.length > 0);

    if (!moreReal && this.retries.length === 0 && !needDecoy) return;

    const minNeeded = this.mode === 'spell' ? 1 : this.minChoices;
    if (this.monsters.length < minNeeded) {
      this.nextSpawnAt = Math.min(this.nextSpawnAt, this.time + 0.6);
      if (!moreReal) {
        for (const r of this.retries) {
          r.at = Math.max(r.minAt, Math.min(r.at, this.time + 0.6));
        }
      }
    }

    if (this.time < this.nextSpawnAt || this.monsters.length >= lvl.maxOnScreen) return;

    const onScreen = new Set(this.monsters.map((m) => m.wordId));
    const rng = this.deps.rng;
    const excludeSet = () => new Set([...onScreen, ...this.retries.map((r) => r.wordId)]);

    const retryIdx = this.retries.findIndex(
      (r) => this.time >= r.at && !onScreen.has(r.wordId) && (this.deps.canSpawn?.(r.wordId, onScreen) ?? true),
    );

    let wordId: string;
    let kind: number;
    let extra: Partial<MonsterState> = {};
    let variant: MonsterVariant = 'normal';

    if (retryIdx >= 0) {
      const entry = this.retries.splice(retryIdx, 1)[0];
      wordId = entry.wordId;
      kind = entry.kind;
      extra = { retry: true };
    } else if (moreReal) {
      const picked = this.deps.pickWord(excludeSet(), this.recent);
      if (!picked) {
        this.nextSpawnAt = this.time + 0.5;
        return;
      }
      wordId = picked;
      kind = Math.floor(rng() * 4);
      variant = this.pickVariant();
      this.spawned += 1;
    } else if (needDecoy) {
      const picked = this.deps.pickWord(excludeSet(), this.recent);
      if (!picked) {
        this.decoyDry = true;
        return;
      }
      wordId = picked;
      kind = Math.floor(rng() * 4);
      extra = { decoy: true };
    } else {
      return;
    }

    const lane = this.pickLane();
    const monster: MonsterState = {
      id: this.nextId++,
      lane,
      x: 1,
      speed: this.baseSpeed(variant) * (0.9 + rng() * 0.2),
      wordId,
      kind,
      ...(variant === 'normal' ? {} : { variant }),
      ...extra,
    };
    this.monsters.push(monster);
    this.recent = [wordId, ...this.recent].slice(0, 2);
    const [gMin, gMax] = lvl.spawnGap;
    this.nextSpawnAt = this.time + (gMin + rng() * (gMax - gMin)) / this.pace;
    this.events.push({ type: 'spawn', monster: { ...monster } });
  }

  private pickLane(): number {
    const rng = this.deps.rng;
    const weights: number[] = [];
    for (let lane = 0; lane < 4; lane++) {
      const inLane = this.monsters.filter((m) => m.lane === lane);
      const crowded = inLane.some((m) => m.x > 0.8);
      weights.push(crowded ? 0.05 : 1 / (1 + inLane.length));
    }
    const idx = pickWeighted(weights, rng);
    return idx < 0 ? Math.floor(rng() * 4) : idx;
  }

  private tryCall(): void {
    if (this.call || this.time < this.nextCallAt) return;
    const real = this.monsters.filter((m) => !m.decoy);
    if (
      real.length === 0 ||
      (this.mode !== 'spell' &&
        this.monsters.length < this.minChoices &&
        (this.spawned < this.level.monsters || this.retries.length > 0 || !this.decoyDry) &&
        real.every((m) => m.x > DANGER_X))
    ) {
      return;
    }
    const target = this.mode === 'spell' ? this.nearest() : this.pickListenTarget(real);
    if (!target) return;
    const blank = this.mode === 'spell' ? this.pickBlanks(target.wordId) : [];
    const blankCount = blank.filter(Boolean).length;
    this.call = {
      monsterId: target.id,
      wordId: target.wordId,
      wrongs: 0,
      hinted: false,
      tiles: this.mode === 'spell' ? this.makeTiles(target.wordId, blank) : [],
      progress: this.mode === 'spell' ? nextBlankIndex(blank, 0) : 0,
      blank,
      maxWrongs: this.mode === 'spell' ? maxSpellWrongs(blankCount) : 1,
      startedAt: this.time,
      retry: !!target.retry,
    };
    this.events.push({ type: 'call', monsterId: target.id, wordId: target.wordId });
  }

  private nearest(): MonsterState | undefined {
    return this.monsters.reduce<MonsterState | undefined>(
      (best, m) => (!best || m.x < best.x ? m : best),
      undefined,
    );
  }

  private pickListenTarget(real: MonsterState[]): MonsterState | undefined {
    const idx = pickWeighted(
      real.map((m) => (m.x < DANGER_X ? 6 : 1 + (1 - m.x) * 2)),
      this.deps.rng,
    );
    return idx >= 0 ? real[idx] : undefined;
  }

  private pickBlanks(word: string): boolean[] {
    const len = word.length;
    const ratio = this.level.blanks;
    if (ratio === undefined || ratio >= 1) return Array<boolean>(len).fill(true);
    const count = Math.min(len, Math.max(1, Math.round(len * ratio)));
    const indices = shuffle(
      Array.from({ length: len }, (_, i) => i).filter((i) => i > 0 || count >= len),
      this.deps.rng,
    ).slice(0, count);
    const out = Array<boolean>(len).fill(false);
    for (const i of indices) out[i] = true;
    return out;
  }

  private makeTiles(word: string, blank: boolean[]): SpellTile[] {
    const rng = this.deps.rng;
    const needed = word.split('').filter((_, i) => blank[i]);
    const extraTarget = Math.max(needed.length <= 2 ? 3 : 2, 7 - needed.length);
    const distractors = shuffle(
      'abcdefghijklmnopqrstuvwxyz'.split('').filter((c) => !needed.includes(c)),
      rng,
    ).slice(0, Math.max(0, Math.min(extraTarget, 9 - needed.length)));
    return shuffle([...needed, ...distractors], rng).map((ch) => ({ ch, used: false }));
  }
}
