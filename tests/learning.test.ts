import { describe, expect, it } from 'vitest';
import { LearningEngine, emptyLearnerData, parseLearnerData } from '../src/core/learning/engine';
import { createRng } from '../src/core/rng';

const NOW = 1_700_000_000_000;

describe('学习引擎：记忆盒', () => {
  it('一次就对升一盒，错过后做对降一盒，没做出来清零', () => {
    const e = new LearningEngine(emptyLearnerData(NOW));
    expect(e.record('apple', 'recognize', 'perfect', NOW).box).toBe(1);
    expect(e.record('apple', 'recognize', 'perfect', NOW).box).toBe(2);
    expect(e.record('apple', 'recognize', 'recovered', NOW).box).toBe(1);
    e.record('apple', 'recognize', 'perfect', NOW);
    e.record('apple', 'recognize', 'perfect', NOW);
    expect(e.record('apple', 'recognize', 'missed', NOW).box).toBe(0);
  });

  it('盒子封顶 5，下次复习时间向后推进', () => {
    const e = new LearningEngine(emptyLearnerData(NOW));
    let s = e.record('cat', 'recognize', 'perfect', NOW);
    for (let i = 0; i < 10; i++) s = e.record('cat', 'recognize', 'perfect', NOW);
    expect(s.box).toBe(5);
    expect(s.due).toBeGreaterThan(NOW);
  });

  it('认得和会拼分开记', () => {
    const e = new LearningEngine(emptyLearnerData(NOW));
    e.record('dog', 'recognize', 'perfect', NOW);
    expect(e.stat('dog', 'spell')).toBeUndefined();
    expect(e.mastery('dog', 'recognize')).toBe('learning');
    expect(e.mastery('dog', 'spell')).toBe('new');
  });
});

describe('学习引擎：选词', () => {
  it('不会选同屏已有的词', () => {
    const e = new LearningEngine(emptyLearnerData(NOW));
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) {
      const w = e.pick(['a', 'b', 'c'], 'recognize', NOW, rng, new Set(['a', 'b']));
      expect(w).toBe('c');
    }
    expect(e.pick(['a'], 'recognize', NOW, rng, new Set(['a']))).toBeNull();
  });

  it('到期又不熟的词出现得明显更多', () => {
    const e = new LearningEngine(emptyLearnerData(NOW));
    e.record('weak', 'recognize', 'missed', NOW - 1000);
    for (let i = 0; i < 5; i++) e.record('strong', 'recognize', 'perfect', NOW);
    const rng = createRng(7);
    let weak = 0;
    for (let i = 0; i < 2000; i++) if (e.pick(['weak', 'strong'], 'recognize', NOW, rng, new Set()) === 'weak') weak++;
    expect(weak / 2000).toBeGreaterThan(0.85);
  });

  it('刚出过的词尽量不连着出，除非没别的可选', () => {
    const e = new LearningEngine(emptyLearnerData(NOW));
    const rng = createRng(3);
    for (let i = 0; i < 100; i++) expect(e.pick(['a', 'b', 'c'], 'recognize', NOW, rng, new Set(), ['a', 'b'])).toBe('c');
    expect(e.pick(['a', 'b'], 'recognize', NOW, rng, new Set(['b']), ['a'])).toBe('a');
  });
});

describe('存档', () => {
  it('能原样存取', () => {
    const e = new LearningEngine(emptyLearnerData(NOW));
    e.record('pear', 'spell', 'perfect', NOW);
    e.saveLevel('fruit-1', 2);
    const back = parseLearnerData(e.serialize());
    expect(back).toEqual(e.data);
  });

  it('坏数据返回 null，越界数值被修正', () => {
    expect(parseLearnerData(null)).toBeNull();
    expect(parseLearnerData('{oops')).toBeNull();
    expect(parseLearnerData('{"version":2,"words":{},"levels":{}}')).toBeNull();
    const fixed = parseLearnerData(
      JSON.stringify({ version: 1, createdAt: 1, words: { a: { recognize: { box: 99, seen: -3 } } }, levels: { x: { stars: 7, plays: 1 } } }),
    )!;
    expect(fixed.words.a.recognize!.box).toBe(5);
    expect(fixed.words.a.recognize!.seen).toBe(0);
    expect(fixed.levels.x.stars).toBe(3);
  });

  it('关卡只保留最好成绩', () => {
    const e = new LearningEngine(emptyLearnerData(NOW));
    expect(e.saveLevel('l', 2).improved).toBe(true);
    expect(e.saveLevel('l', 1).improved).toBe(false);
    expect(e.levelStars('l')).toBe(2);
    expect(e.data.levels.l.plays).toBe(2);
  });
});
