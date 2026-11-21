import { describe, expect, it } from 'vitest';
import { ALBUM_THEMES, BOOK_ENTRIES, classifyWordTheme, entriesForTheme } from '../src/core/content/themes';
import { wordById } from '../src/core/content/words';

describe('图鉴主题分册', () => {
  it('10 个主题分册完整覆盖全部词条且无重复', () => {
    let sum = 0;
    const seen = new Set<string>();
    for (const t of ALBUM_THEMES) {
      const items = entriesForTheme(t.id);
      expect(items.length, t.id).toBeGreaterThan(20);
      sum += items.length;
      for (const item of items) {
        expect(seen.has(item.w.id), item.w.id).toBe(false);
        seen.add(item.w.id);
      }
    }
    expect(sum).toBe(BOOK_ENTRIES.length);
  });

  it('常见核心词归入直观主题分册', () => {
    expect(classifyWordTheme(wordById('panda'))).toBe('animals');
    expect(classifyWordTheme(wordById('apple'))).toBe('food');
    expect(classifyWordTheme(wordById('sun'))).toBe('nature');
    expect(classifyWordTheme(wordById('mother'))).toBe('family');
    expect(classifyWordTheme(wordById('train'))).toBe('travel');
    expect(classifyWordTheme(wordById('football'))).toBe('sport');
    expect(classifyWordTheme(wordById('book'))).toBe('school');
  });
});
