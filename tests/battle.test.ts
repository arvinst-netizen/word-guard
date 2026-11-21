import { describe, expect, it } from 'vitest';
import { Battle, type BattleEvent } from '../src/core/battle/battle';
import { LEVELS, type LevelDef } from '../src/core/content/levels';
import { LearningEngine, emptyLearnerData } from '../src/core/learning/engine';
import { createRng } from '../src/core/rng';
import { createBattleSession } from '../src/core/session';

const NOW = 1_700_000_000_000;

function makeBattle(level: LevelDef, seed = 1) {
  const engine = new LearningEngine(emptyLearnerData(NOW));
  const battle = createBattleSession(level, engine, createRng(seed), () => NOW);
  return { engine, battle };
}

function runUntilCall(b: Battle, limit = 30) {
  for (let t = 0; t < limit && !b.call; t += 0.05) b.update(0.05);
  expect(b.call).not.toBeNull();
  return b.call!;
}

describe('听音模式', () => {
  const level = LEVELS.find((l) => l.mode === 'listen')!;

  it('点对：怪物消失，记为一次就对', () => {
    const { battle, engine } = makeBattle(level);
    const call = runUntilCall(battle);
    battle.tapMonster(call.monsterId);
    const ev = battle.drainEvents();
    expect(ev.some((e) => e.type === 'defeat' && e.outcome === 'perfect')).toBe(true);
    expect(battle.monsters.find((m) => m.id === call.monsterId)).toBeUndefined();
    expect(engine.stat(call.wordId, 'recognize')!.box).toBe(1);
  });

  it('点错：触发错误事件并进入冷却，扣半颗心', () => {
    const { battle } = makeBattle(level, 5);
    for (let t = 0; t < 30 && battle.monsters.length < 2; t += 0.05) battle.update(0.05);
    const call = runUntilCall(battle);
    const startHearts = battle.hearts;
    const wrong = battle.monsters.find((m) => m.id !== call.monsterId)!;
    battle.tapMonster(wrong.id);
    expect(battle.stunned).toBe(true);
    expect(battle.hearts).toBeLessThan(startHearts);
    expect(battle.drainEvents().some((e) => e.type === 'wrongTap')).toBe(true);
  });

  it('不答题：怪物走到家门扣心，扣完就输', () => {
    const { battle, engine } = makeBattle(level, 2);
    const events: BattleEvent[] = [];
    for (let t = 0; t < 200 && !battle.result; t += 0.05) {
      battle.update(0.05);
      events.push(...battle.drainEvents());
    }
    expect(battle.result).toBe('lose');
    expect(battle.hearts).toBe(0);
    expect(events.filter((e) => e.type === 'leak').length).toBeGreaterThan(0);
    const missed = battle.answers.filter((a) => a.outcome === 'missed');
    expect(missed.length).toBeGreaterThan(0);
    for (const a of missed) expect(engine.stat(a.wordId, 'recognize')!.missed).toBeGreaterThan(0);
  });
});

describe('拼写模式', () => {
  const level = LEVELS.find((l) => l.mode === 'spell')!;

  it('字母块包含待拼写字母，按顺序点完就打倒', () => {
    const { battle } = makeBattle(level, 9);
    const call = runUntilCall(battle);
    const letters = call.tiles.map((t) => t.ch);
    const target = call.wordId.replace(/[^a-z]/gi, '').toLowerCase();
    const remaining = target.slice(call.progress);
    for (const ch of remaining) expect(letters).toContain(ch);
    for (let i = 0; i < remaining.length; i++) battle.tapTile(battle.nextTileIndex());
    expect(battle.answers.at(-1)).toEqual({ wordId: call.wordId, outcome: 'perfect' });
  });

  it('点错字母不前进，允许提示后用提示就不算一次就对', () => {
    const { battle } = makeBattle(level, 4);
    const call = runUntilCall(battle);
    const target = call.wordId.replace(/[^a-z]/gi, '').toLowerCase();
    const startProgress = call.progress;
    const nextCh = target[startProgress];
    const wrongIndex = call.tiles.findIndex((t) => t.ch !== nextCh);
    if (wrongIndex >= 0) {
      battle.tapTile(wrongIndex);
      expect(call.progress).toBe(startProgress);
    }
    for (let t = 0; t < 20 && !battle.canHint; t += 0.1) battle.update(0.1);
    if (battle.canHint) {
      battle.hint();
      const hintEv = battle.drainEvents().find((e) => e.type === 'hint');
      expect(hintEv && hintEv.type === 'hint' && call.tiles[hintEv.tileIndex!].ch).toBe(nextCh);
    }
    const remaining = target.length - call.progress;
    for (let i = 0; i < remaining; i++) battle.tapTile(battle.nextTileIndex());
    expect(battle.answers.at(-1)!.outcome).toBe('recovered');
  });
});

describe('开局三选一技能', () => {
  const level = LEVELS.find((l) => l.mode === 'listen')!;

  it('多一颗心：开局血量上限与当前血量 +1，且无主动技能按钮', () => {
    const { battle } = makeBattle(level, 3);
    const baseMax = battle.maxHearts;
    battle.selectSkill('heart');
    expect(battle.maxHearts).toBe(baseMax + 1);
    expect(battle.hearts).toBe(baseMax + 1);
    battle.energy = 5;
    expect(battle.skillReady).toBe(false);
  });

  it('提示一只：满 5 能量可免费揭示正确答案，不断连击且仍算一次就对', () => {
    const { battle } = makeBattle(level, 7);
    battle.selectSkill('reveal');
    const call = runUntilCall(battle);
    battle.energy = 5;
    battle.combo = 5;
    expect(battle.skillReady).toBe(true);
    battle.useSkill();
    const ev = battle.drainEvents().find((e) => e.type === 'reveal');
    expect(ev && ev.type === 'reveal' && ev.monsterId).toBe(call.monsterId);
    expect(battle.energy).toBe(0);
    expect(battle.combo).toBe(5);
    expect(call.revealed).toBe(true);
    battle.tapMonster(call.monsterId);
    expect(battle.answers.at(-1)).toEqual({ wordId: call.wordId, outcome: 'perfect' });
  });

  it('冰冻：满 5 能量可停住全场小怪', () => {
    const { battle } = makeBattle(level, 8);
    battle.selectSkill('freeze');
    battle.energy = 5;
    expect(battle.skillReady).toBe(true);
    battle.useSkill();
    expect(battle.frozen).toBe(true);
    expect(battle.drainEvents().some((e) => e.type === 'freeze')).toBe(true);
  });
});
