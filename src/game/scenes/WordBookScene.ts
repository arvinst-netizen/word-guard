import Phaser from 'phaser';
import { setArtStage } from '../../core/content/art';
import { COURSES } from '../../core/content/levels';
import { speakTexts, wordById, type Word } from '../../core/content/words';
import type { Mastery } from '../../core/learning/engine';
import { collectionCounts, wordCardState } from '../../core/rewards';
import { ctx } from '../context';
import { ICON_CREDITS } from '../pictures';
import {
  drawBackdrop,
  drawBoard,
  FONT_EN,
  FONT_PLAIN,
  isPortrait,
  PALETTE,
  setupCamera,
  textStyle,
  viewH,
  viewW,
} from '../theme';
import { makeIcon } from '../ui/icons';
import { makeButton, makePicture } from '../ui/widgets';

const MASTERY_BADGE: Record<Mastery, [string, number]> = {
  new: ['没见过', 0xb7a88c],
  learning: ['在学', PALETTE.carrot],
  familiar: ['眼熟', 0x5b8def],
  mastered: ['会了', PALETTE.good],
};

const PAGE_KEY = 'wordbook:page';
const SEEN_KEY = 'wordbook:seenOnly';
const PAGE_SIZE = 32;

const BOOK_ENTRIES: { w: Word; from: string }[] = (() => {
  const list: { w: Word; from: string }[] = [];
  const seen = new Set<string>();
  for (const course of COURSES) {
    course.units.forEach((unit, idx) => {
      const from = course.route === 'cambridge' ? `${course.short} 第 ${idx + 1} 单元` : `${course.short} ${unit.title}`;
      for (const id of unit.words) {
        if (!seen.has(id)) {
          list.push({ w: wordById(id), from });
          seen.add(id);
        }
      }
    });
  }
  return list;
})();

export class WordBookScene extends Phaser.Scene {
  private confirmReset = false;

  constructor() {
    super('wordbook');
  }

  create(): void {
    setupCamera(this);
    setArtStage(null);
    this.confirmReset = false;

    const W = viewW(this);
    const H = viewH(this);
    const portrait = isPortrait(this);
    const engine = ctx().engine;
    drawBackdrop(this);
    ctx().platform.music.setMood('calm');

    const topY = portrait ? 60 : 44;
    makeButton(this, 74, topY, 116, 54, '返回', () => this.scene.start('menu'), {
      fill: PALETTE.board,
      textColor: PALETTE.ink,
      fontSize: 24,
    });
    this.add.text(W / 2, topY, '图鉴', textStyle(40)).setOrigin(0.5);

    const counts: Record<Mastery, number> = { mastered: 0, familiar: 0, learning: 0, new: 0 };
    for (const { w } of BOOK_ENTRIES) counts[engine.mastery(w.id, 'recognize')]++;
    const col = collectionCounts(engine);
    this.add
      .text(W / 2, portrait ? 112 : 84, `已收集 ${col.lit} / ${BOOK_ENTRIES.length} 张 · 其中金卡 ${col.gold} 张 · 在学 ${counts.learning}`, textStyle(20, PALETTE.inkSoft))
      .setOrigin(0.5);

    const seenOnly = this.registry.get(SEEN_KEY) === true;
    const filtered = seenOnly
      ? BOOK_ENTRIES.filter(({ w }) => engine.mastery(w.id, 'recognize') !== 'new')
      : BOOK_ENTRIES;
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const page = Math.min(totalPages - 1, Math.max(0, (this.registry.get(PAGE_KEY) as number | undefined) ?? 0));
    this.registry.set(PAGE_KEY, page);

    const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const navY = portrait ? 160 : 124;
    const rangeLabel = slice.length
      ? slice[0].from === slice[slice.length - 1].from
        ? slice[0].from
        : `${slice[0].from} – ${slice[slice.length - 1].from}`
      : '还没有学过的词';
    const litOnPage = slice.filter(({ w }) => wordCardState(engine, w.id) !== 'none').length;
    const navText = this.add
      .text(W / 2, navY, `${rangeLabel}   第 ${page + 1} / ${totalPages} 页 · 本页 ${litOnPage}/${slice.length}`, textStyle(20, PALETTE.ink))
      .setOrigin(0.5);
    const maxNavW = (portrait ? 300 : 330) * 2 - 100;
    if (navText.width > maxNavW) navText.setScale(maxNavW / navText.width);

    const turn = (delta: number) => {
      this.registry.set(PAGE_KEY, Math.max(0, Math.min(totalPages - 1, page + delta)));
      this.scene.restart();
    };

    makeButton(this, W / 2 - (portrait ? 300 : 330), navY, 70, 46, '‹', () => turn(-1), {
      fill: page > 0 ? PALETTE.carrot : 0xd9cdb0,
      fontSize: 30,
      disabled: page === 0,
    });
    makeButton(this, W / 2 + (portrait ? 300 : 330), navY, 70, 46, '›', () => turn(1), {
      fill: page < totalPages - 1 ? PALETTE.carrot : 0xd9cdb0,
      fontSize: 30,
      disabled: page >= totalPages - 1,
    });
    makeButton(
      this,
      W - (portrait ? 110 : 120),
      topY,
      190,
      50,
      seenOnly ? '看全部' : '只看学过的',
      () => {
        this.registry.set(SEEN_KEY, !seenOnly);
        this.registry.set(PAGE_KEY, 0);
        this.scene.restart();
      },
      { fill: PALETTE.board, textColor: PALETTE.ink, fontSize: 20 },
    );

    const cols = portrait ? 4 : 8;
    const cw = portrait ? 162 : 146;
    const ch = portrait ? 108 : 110;
    const gap = portrait ? 10 : 8;
    const gridW = cols * cw + (cols - 1) * gap;
    const x0 = (W - gridW) / 2;
    let y0 = navY + 32;

    slice.forEach(({ w }, idx) => {
      const colIdx = idx % cols;
      const rowIdx = Math.floor(idx / cols);
      const cx = x0 + colIdx * (cw + gap);
      const cy = y0 + rowIdx * (ch + gap);
      const rec = engine.mastery(w.id, 'recognize');
      const spl = engine.mastery(w.id, 'spell');
      const card = this.add.container(cx, cy);
      const g = this.add.graphics();
      const state = wordCardState(engine, w.id);

      drawBoard(g, 0, 0, cw, ch, 14, state === 'gold' ? 0xffe998 : state === 'lit' ? PALETTE.board : 0xe9e1ca);
      if (state === 'gold') {
        g.lineStyle(5, PALETTE.sun, 1);
        g.strokeRoundedRect(3, 3, cw - 6, ch - 6, 12);
      }
      if (state !== 'none') {
        g.fillStyle(PALETTE.ink, 1);
        g.fillCircle(cw - 16, 16, 13);
        g.fillStyle(state === 'gold' ? PALETTE.sun : PALETTE.good, 1);
        g.fillCircle(cw - 16, 16, 10);
      }
      card.add(g);

      if (state !== 'none') {
        card.add(
          makeIcon(
            this,
            state === 'gold' ? 'star' : 'check',
            cw - 16,
            16,
            state === 'gold' ? 15 : 14,
            state === 'gold' ? PALETTE.ink : PALETTE.white,
          ),
        );
      }
      if (w.picture) {
        const pic = makePicture(this, 30, 26, w.picture, 30);
        if ('setAlpha' in pic && typeof pic.setAlpha === 'function') {
          (pic as Phaser.GameObjects.Image).setAlpha(state === 'none' ? 0.3 : 1);
        }
        card.add(pic);
      }

      const zh = this.add.text(w.picture ? 54 : 12, 26, w.short, textStyle(16, PALETTE.inkSoft, FONT_PLAIN)).setOrigin(0, 0.5);
      const maxZhW = cw - (w.picture ? 62 : 20);
      if (zh.width > maxZhW) zh.setScale(maxZhW / zh.width);
      card.add(zh);

      const enSize = Math.min(28, Math.floor((cw - 20) / (w.en.length * 0.52)));
      card.add(this.add.text(cw / 2, 58, w.en, textStyle(enSize, state === 'none' ? PALETTE.inkSoft : PALETTE.ink, FONT_EN)).setOrigin(0.5));

      const drawPill = (px: number, m: Mastery) => {
        const [label, color] = MASTERY_BADGE[m];
        const pg = this.add.graphics();
        const pw = (cw - 26) / 2;
        pg.fillStyle(color, 1);
        pg.fillRoundedRect(px, ch - 30, pw, 22, 11);
        card.add(pg);
        card.add(this.add.text(px + pw / 2, ch - 19, label, textStyle(14, PALETTE.white)).setOrigin(0.5));
      };
      drawPill(9, rec);
      drawPill(cw / 2 + 4, spl);

      card.setSize(cw, ch);
      card.setInteractive(new Phaser.Geom.Rectangle(0, 0, cw, ch), Phaser.Geom.Rectangle.Contains);
      card.on('pointerup', () => {
        const [first, ...rest] = speakTexts(w);
        ctx().platform.speech.say(first);
        for (const t of rest) ctx().platform.speech.say(t, { interrupt: false });
      });
    });

    const rows = Math.ceil(slice.length / cols);
    y0 = y0 + rows * (ch + gap) + 6;
    const footerY = Math.min(y0 + 22, H - 40);
    this.add
      .text(
        portrait ? W / 2 : x0,
        footerY,
        '认得了点亮（右上角绿勾），会拼了变金卡（金星）。左边标签是"认得"，右边是"会拼"',
        textStyle(portrait ? 17 : 18, PALETTE.inkSoft),
      )
      .setOrigin(portrait ? 0.5 : 0, 0.5);

    const credit = this.add
      .text(portrait ? W / 2 : x0, footerY + 24, `部分图标：${ICON_CREDITS.join('、')}`, textStyle(13, PALETTE.inkSoft, FONT_PLAIN))
      .setOrigin(portrait ? 0.5 : 0, 0.5)
      .setAlpha(0.8);
    const maxCreditW = portrait ? W - 40 : gridW - 250;
    if (credit.width > maxCreditW) credit.setScale(maxCreditW / credit.width);

    const resetY = portrait ? Math.min(y0 + 90, H - 50) : footerY;
    const resetX = portrait ? W / 2 : x0 + gridW - 110;
    let resetBtn: Phaser.GameObjects.Container | undefined;
    const renderReset = () => {
      resetBtn?.destroy();
      resetBtn = makeButton(
        this,
        resetX,
        resetY,
        220,
        50,
        this.confirmReset ? '确定清除？再点一次' : '清除学习记录',
        async () => {
          if (this.confirmReset) {
            await ctx().resetProgress();
            this.scene.restart();
          } else {
            this.confirmReset = true;
            renderReset();
            this.time.delayedCall(3000, () => {
              if (this.scene.isActive() && this.confirmReset) {
                this.confirmReset = false;
                renderReset();
              }
            });
          }
        },
        {
          fill: this.confirmReset ? PALETTE.bad : PALETTE.board,
          textColor: this.confirmReset ? PALETTE.white : PALETTE.inkSoft,
          fontSize: 18,
        },
      );
    };
    renderReset();
  }
}
