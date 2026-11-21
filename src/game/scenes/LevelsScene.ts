import Phaser from 'phaser';
import {
  chaptersForRoute,
  coursesForRoute,
  dictationLevel,
  getCourse,
  unitLevels,
  unitSpellableWords,
  type ChapterDef,
  type LevelDef,
  type RouteId,
} from '../../core/content/levels';
import { isSchoolUnit, setSchoolUnit } from '../../core/parent';
import {
  activeChapterIndex,
  buildReviewLevel,
  isLevelUnlocked,
  isUnitUnlocked,
  reviewCandidateCount,
} from '../../core/progress';
import { isUnitCompleted, wordCardState } from '../../core/rewards';
import { wordById } from '../../core/content/words';
import { track } from '../analytics';
import { ctx } from '../context';
import {
  drawBackdrop,
  drawBoard,
  FONT_EN,
  isPortrait,
  PALETTE,
  setupCamera,
  textStyle,
  viewH,
  viewW,
} from '../theme';
import { makeIcon } from '../ui/icons';
import { drawStar, makeButton } from '../ui/widgets';

const ROUTE_KEY = 'levels:route';
const CHAPTER_KEY = (route: RouteId) => `levels:chapter:${route}`;
const ROUTE_LABEL: Record<RouteId, string> = {
  cambridge: '剑桥版',
  shanghai: '沪教版',
};

export class LevelsScene extends Phaser.Scene {
  private overlay?: Phaser.GameObjects.Container;

  constructor() {
    super('levels');
  }

  create(data?: { route?: RouteId }): void {
    setupCamera(this);
    this.overlay = undefined;
    const W = viewW(this);
    const H = viewH(this);
    const portrait = isPortrait(this);
    drawBackdrop(this);
    ctx().platform.music.setMood('calm');

    const engine = ctx().engine;
    if (data?.route) this.registry.set(ROUTE_KEY, data.route);
    const route: RouteId = this.registry.get(ROUTE_KEY) === 'shanghai' ? 'shanghai' : 'cambridge';
    const chapters = chaptersForRoute(route);
    let chIdx = this.registry.get(CHAPTER_KEY(route)) as number | undefined;
    if (chIdx === undefined || chIdx < 0 || chIdx >= chapters.length) {
      chIdx = activeChapterIndex(engine, route);
    }
    this.registry.set(CHAPTER_KEY(route), chIdx);

    const chapter = chapters[chIdx];
    const course = getCourse(chapter.course);
    const topY = portrait ? 56 : 44;

    makeButton(this, 70, topY, 108, 52, '返回', () => this.scene.start('menu'), {
      fill: PALETTE.board,
      textColor: PALETTE.ink,
      fontSize: 22,
    });

    const tabY = portrait ? topY + 64 : topY;
    const tabW = portrait ? 150 : 176;
    const tabX0 = portrait ? 16 + tabW / 2 : W / 2 - 40 - 92;
    (['cambridge', 'shanghai'] as const).forEach((r, i) => {
      const active = r === route;
      makeButton(
        this,
        tabX0 + i * (tabW + 8),
        tabY,
        tabW,
        52,
        ROUTE_LABEL[r],
        () => {
          if (!active) {
            this.registry.set(ROUTE_KEY, r);
            this.scene.restart({});
          }
        },
        { fill: active ? PALETTE.carrot : PALETTE.board, textColor: active ? PALETTE.white : PALETTE.ink, fontSize: 22 },
      );
    });

    const dueCount = reviewCandidateCount(engine, ctx().platform.now());
    const reviewLvl = buildReviewLevel(engine, ctx().platform.now());
    makeButton(
      this,
      W - (portrait ? 110 : 330),
      topY,
      200,
      52,
      reviewLvl ? `今日复习 ${dueCount}` : '暂无要复习的',
      () => {
        if (reviewLvl) this.scene.start('battle', { levelId: reviewLvl.id });
      },
      { fill: reviewLvl ? PALETTE.sun : 0xe6dccb, textColor: PALETTE.ink, fontSize: 21, disabled: !reviewLvl },
    );

    makeButton(
      this,
      W - 110,
      portrait ? topY + 64 : topY,
      200,
      52,
      engine.data.placement ? '重新测水平' : '水平测试',
      () => this.scene.start('placement'),
      { fill: PALETTE.board, textColor: PALETTE.ink, fontSize: 21 },
    );

    const headY = portrait ? 196 : 112;
    const firstU = chapter.units[0];
    const lastU = chapter.units[chapter.units.length - 1];
    const titleStr = route === 'cambridge' ? `${course.short} · 第 ${firstU + 1}–${lastU + 1} 单元` : chapter.title;
    const titleText = this.add.text(W / 2, headY, titleStr, textStyle(portrait ? 30 : 32)).setOrigin(0.5);
    const maxTitleW = portrait ? 420 : 520;
    if (titleText.width > maxTitleW) titleText.setScale(maxTitleW / titleText.width);

    const turn = (delta: number) => {
      this.registry.set(CHAPTER_KEY(route), Math.max(0, Math.min(chapters.length - 1, chIdx! + delta)));
      this.scene.restart({});
    };
    const arrowDist = portrait ? 300 : 330;
    makeButton(this, W / 2 - arrowDist, headY, 76, 56, '‹', () => turn(-1), {
      fill: chIdx > 0 ? PALETTE.carrot : 0xd9cdb0,
      fontSize: 36,
      disabled: chIdx === 0,
    });
    makeButton(this, W / 2 + arrowDist, headY, 76, 56, '›', () => turn(1), {
      fill: chIdx < chapters.length - 1 ? PALETTE.carrot : 0xd9cdb0,
      fontSize: 36,
      disabled: chIdx === chapters.length - 1,
    });

    const sub =
      route === 'shanghai' && course.edition === 'old'
        ? '旧版牛津教材的单元，新版词表到了会更新'
        : `第 ${chIdx + 1} / ${chapters.length} 页`;
    this.add.text(W / 2, headY + 34, sub, textStyle(16, PALETTE.inkSoft)).setOrigin(0.5);

    makeButton(
      this,
      portrait ? 16 + tabW * 2 + 16 + 66 : W / 2 + arrowDist + 120,
      portrait ? tabY : headY,
      portrait ? 124 : 136,
      50,
      route === 'cambridge' ? '选级别' : '选年级',
      () => this.showPicker(route),
      { fill: PALETTE.sun, textColor: PALETTE.ink, fontSize: 21 },
    );

    this.drawChapter(chapter, headY + 64);
    if (reviewLvl) this.maybePromptReview(reviewLvl.id, dueCount);
    if (route === 'cambridge' && !engine.data.placement) {
      this.add
        .text(
          W / 2,
          H - 26,
          '不知道从哪开始？点右上角"水平测试"，5 分钟帮你找到合适的起点',
          textStyle(18, PALETTE.ink, undefined, { backgroundColor: '#fff4dc', padding: { x: 12, y: 6 } }),
        )
        .setOrigin(0.5);
    }
  }

  private maybePromptReview(levelId: string, count: number): void {
    const d = new Date(ctx().platform.now());
    const key = `word-guard:review-prompt:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      if (this.registry.get(key)) return;
      this.registry.set(key, true);
    }

    const W = viewW(this);
    const H = viewH(this);
    const layer = this.add.container(0, 0).setDepth(100);
    this.overlay = layer;
    layer.add(this.add.rectangle(W / 2, H / 2, W, H, 0, 0.35).setInteractive());
    const pw = Math.min(W - 40, 560);
    const g = this.add.graphics();
    drawBoard(g, W / 2 - pw / 2, H / 2 - 140, pw, 280, 24);
    layer.add(g);
    layer.add(this.add.text(W / 2, H / 2 - 82, '先复习一下？', textStyle(34)).setOrigin(0.5));
    layer.add(
      this.add
        .text(W / 2, H / 2 - 22, `有 ${count} 个学过的词快忘了\n花两分钟复习，记得更牢`, textStyle(22, PALETTE.inkSoft, undefined, { align: 'center' }))
        .setOrigin(0.5),
    );
    layer.add(
      makeButton(this, W / 2 - 110, H / 2 + 80, 190, 64, '先复习', () => this.scene.start('battle', { levelId }), {
        fill: PALETTE.sun,
        textColor: PALETTE.ink,
        fontSize: 26,
      }),
    );
    layer.add(
      makeButton(
        this,
        W / 2 + 110,
        H / 2 + 80,
        190,
        64,
        '等会儿',
        () => {
          layer.destroy();
          this.overlay = undefined;
        },
        { fill: PALETTE.board, textColor: PALETTE.ink, fontSize: 26 },
      ),
    );
  }

  private showPicker(route: RouteId): void {
    if (this.overlay) return;
    const W = viewW(this);
    const H = viewH(this);
    const portrait = isPortrait(this);
    const courses = coursesForRoute(route);
    const chapters = chaptersForRoute(route);
    const layer = this.add.container(0, 0).setDepth(100);
    this.overlay = layer;

    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0, 0.35).setInteractive();
    layer.add(shade);

    const cols = route === 'cambridge' ? 1 : portrait ? 2 : 5;
    const bw = route === 'cambridge' ? 360 : portrait ? 260 : 200;
    const rows = Math.ceil(courses.length / cols);
    const pw = cols * bw + (cols - 1) * 18 + 60;
    const ph = rows * 72 + (rows - 1) * 18 + 150;
    const g = this.add.graphics();
    drawBoard(g, W / 2 - pw / 2, H / 2 - ph / 2, pw, ph, 24);
    layer.add(g);
    layer.add(
      this.add.text(W / 2, H / 2 - ph / 2 + 40, route === 'cambridge' ? '从哪一级开始？' : '选年级和学期', textStyle(28)).setOrigin(0.5),
    );

    const close = () => {
      layer.destroy();
      this.overlay = undefined;
    };
    shade.on('pointerup', close);

    courses.forEach((c, i) => {
      const bx = W / 2 - pw / 2 + 30 + bw / 2 + (i % cols) * (bw + 18);
      const by = H / 2 - ph / 2 + 84 + 36 + Math.floor(i / cols) * 90;
      const label = route === 'cambridge' ? c.title : c.short + (c.edition === 'old' ? '（旧版）' : '');
      layer.add(
        makeButton(
          this,
          bx,
          by,
          bw,
          72,
          label,
          () => {
            this.registry.set(
              CHAPTER_KEY(route),
              chapters.findIndex((ch) => ch.course === c.id),
            );
            this.scene.restart({});
          },
          { fill: PALETTE.board, textColor: PALETTE.ink, fontSize: 24 },
        ),
      );
    });
    layer.add(makeButton(this, W / 2, H / 2 + ph / 2 - 6, 140, 48, '关闭', close, { fill: PALETTE.carrot, fontSize: 22 }));
  }

  private drawChapter(chapter: ChapterDef, topY: number): void {
    const W = viewW(this);
    const H = viewH(this);
    const portrait = isPortrait(this);
    const engine = ctx().engine;
    const n = chapter.units.length;
    const botY = H - (engine.data.placement || chapter.route === 'shanghai' ? 20 : 58);

    const bg = this.add.graphics();
    bg.fillStyle(PALETTE.grassA, 0.55);
    bg.fillRoundedRect(12, topY, W - 24, botY - topY, 26);
    bg.fillStyle(PALETTE.grassB, 0.35);
    for (let i = 0; i < 7; i++) {
      bg.fillEllipse(60 + ((i * 197) % (W - 120)), topY + 40 + ((i * 131) % Math.max(60, botY - topY - 80)), 120, 34);
    }

    const pts: { x: number; y: number }[] = [];
    if (portrait) {
      const step = (botY - topY - 150) / Math.max(1, n - 1);
      const xs = [0.24, 0.5, 0.76, 0.5];
      for (let i = 0; i < n; i++) pts.push({ x: W * xs[i % 4], y: topY + 62 + i * step });
    } else {
      const cols = Math.min(5, n);
      const rows = Math.ceil(n / cols);
      const rowH = (botY - topY) / rows;
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const col = r % 2 === 0 ? c : cols - 1 - c;
        pts.push({
          x: W * ((col + 0.5) / cols),
          y: topY + rowH * r + rowH * 0.42 + (col % 2 === 0 ? -14 : 14),
        });
      }
    }

    const pathG = this.add.graphics();
    const states = chapter.units.map((u) => ({
      open: isUnitUnlocked(chapter.course, u, engine),
      done: isUnitCompleted(engine, chapter.course, u),
    }));

    for (let i = 0; i + 1 < n; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const open = states[i + 1].open;
      const dots = Math.max(4, Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 22));
      for (let j = 1; j < dots; j++) {
        const t = j / dots;
        pathG.fillStyle(open ? 0xf3d7a4 : 0xffffff, open ? 1 : 0.7);
        pathG.fillCircle(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t, open ? 8 : 5);
      }
    }

    const activeIdx = states.findIndex((s) => s.open && !s.done);
    chapter.units.forEach((u, i) => {
      this.makeNode(chapter.course, u, pts[i].x, pts[i].y, states[i].open, states[i].done, i === activeIdx, portrait);
    });
  }

  private makeNode(
    courseId: string,
    unit: number,
    x: number,
    y: number,
    open: boolean,
    done: boolean,
    current: boolean,
    portrait: boolean,
  ): void {
    const engine = ctx().engine;
    const course = getCourse(courseId);
    const lvls = unitLevels(courseId, unit);
    const stars = lvls.reduce((acc, l) => acc + engine.levelStars(l.id), 0);
    const pl = engine.data.placement;
    const isStart = !!pl && (pl.course ?? 'ket') === courseId && pl.unit === unit;
    const boss = lvls.find((l) => l.boss);
    const bossDone = !!boss && engine.levelStars(boss.id) > 0;
    const rad = portrait ? 46 : 50;

    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.ink, 0.18);
    g.fillEllipse(0, rad + 4, rad * 1.9, 20);
    g.fillStyle(PALETTE.ink, 1);
    g.fillCircle(0, 0, rad + 5);
    g.fillStyle(open ? (done ? PALETTE.sun : stars > 0 ? 0xd8f5d9 : PALETTE.white) : 0xd9cdb0, 1);
    g.fillCircle(0, 0, rad);
    if (open && !done) {
      g.lineStyle(5, stars > 0 ? PALETTE.good : PALETTE.carrot, 1);
      g.strokeCircle(0, 0, rad - 5);
    }
    c.add(g);

    if (open) {
      c.add(this.add.text(0, -8, `${unit + 1}`, textStyle(40, PALETTE.ink, FONT_EN)).setOrigin(0.5));
      const sg = this.add.graphics();
      drawStar(sg, -22, 24, 9, true);
      c.add(sg);
      c.add(this.add.text(-8, 24, `${stars}/${lvls.length * 3}`, textStyle(16, PALETTE.ink, FONT_EN)).setOrigin(0, 0.5));
    } else {
      c.add(makeIcon(this, 'lock', 0, -2, 38));
    }

    if (bossDone) c.add(makeIcon(this, 'crown', rad - 8, -rad + 6, 30));

    const labelStr = course.route === 'cambridge' ? course.units[unit].words.slice(0, 2).join(' · ') : course.units[unit].title;
    const label = this.add
      .text(
        0,
        rad + 26,
        open ? labelStr : '还没解锁',
        textStyle(portrait ? 19 : 18, open ? PALETTE.ink : PALETTE.inkSoft, course.route === 'cambridge' && open ? FONT_EN : undefined, {
          backgroundColor: '#fff4dccc',
          padding: { x: 8, y: 3 },
        }),
      )
      .setOrigin(0.5);
    const maxLW = portrait ? 230 : 220;
    if (label.width > maxLW) label.setScale(maxLW / label.width);
    c.add(label);

    if (isSchoolUnit(engine, courseId, unit)) {
      const tag = this.add.graphics();
      tag.fillStyle(PALETTE.ink, 1);
      tag.fillRoundedRect(-rad - 20, -rad - 4, 50, 26, 13);
      tag.fillStyle(0x5b8def, 1);
      tag.fillRoundedRect(-rad - 18, -rad - 2, 46, 22, 11);
      c.add(tag);
      c.add(this.add.text(-rad + 5, -rad + 9, '学校', textStyle(14, PALETTE.white)).setOrigin(0.5));
    }

    if (isStart || current) {
      const pin = this.add.container(0, -rad - 26);
      const pg = this.add.graphics();
      const pw = isStart ? 96 : 76;
      pg.fillStyle(PALETTE.carrot, 1);
      pg.fillRoundedRect(-pw / 2, -15, pw, 30, 15);
      pg.fillTriangle(-8, 14, 8, 14, 0, 24);
      pin.add(pg);
      pin.add(this.add.text(0, 0, isStart ? '从这开始' : '到这啦', textStyle(16, PALETTE.white)).setOrigin(0.5));
      c.add(pin);
      this.tweens.add({ targets: pin, y: -rad - 34, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    if (current) {
      this.tweens.add({ targets: g, scale: 1.06, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    c.setSize(rad * 2 + 30, rad * 2 + 60);
    this.makeTappable(c, rad * 2 + 30, rad * 2 + 60, () => {
      if (open) {
        this.showUnit(courseId, unit);
      } else {
        this.tweens.add({ targets: c, x: x + 8, duration: 50, yoyo: true, repeat: 3 });
      }
    });
  }

  private showUnit(courseId: string, unit: number): void {
    if (this.overlay) return;
    const W = viewW(this);
    const H = viewH(this);
    const engine = ctx().engine;
    const course = getCourse(courseId);
    const lvls = unitLevels(courseId, unit);
    const words = course.units[unit].words;

    const layer = this.add.container(0, 0).setDepth(100);
    this.overlay = layer;
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0, 0.4).setInteractive();
    layer.add(shade);
    const close = () => {
      layer.destroy();
      this.overlay = undefined;
    };
    shade.on('pointerup', close);

    const stages = course.stages;
    const pw = Math.min(W - 32, 600);
    const rows = Math.ceil(stages.length / 2);
    const dictLvl = dictationLevel(courseId, unit);
    const isSh = course.route === 'shanghai';
    const ph = 150 + rows * 74 + 64 + 96 + (dictLvl ? 56 : 0) + (isSh ? 50 : 0);
    const x0 = W / 2 - pw / 2;
    const y0 = H / 2 - ph / 2;

    const g = this.add.graphics();
    drawBoard(g, x0, y0, pw, ph, 24);
    layer.add(g);

    const titleStr = course.route === 'cambridge' ? `${course.short} · 第 ${unit + 1} 单元` : course.units[unit].title;
    const title = this.add.text(W / 2, y0 + 40, titleStr, textStyle(30)).setOrigin(0.5);
    if (title.width > pw - 60) title.setScale((pw - 60) / title.width);
    layer.add(title);

    const preview = this.add
      .text(W / 2, y0 + 78, words.slice(0, 4).join(' · ') + (words.length > 4 ? ' …' : ''), textStyle(20, PALETTE.inkSoft, FONT_EN))
      .setOrigin(0.5);
    if (preview.width > pw - 50) preview.setScale((pw - 50) / preview.width);
    layer.add(preview);

    const lit = words.filter((id) => wordCardState(engine, id) !== 'none').length;
    const gold = words.filter((id) => wordCardState(engine, id) === 'gold').length;
    const barW = pw - 220;
    const barY = y0 + 112;
    const bg = this.add.graphics();
    bg.fillStyle(PALETTE.ink, 1);
    bg.fillRoundedRect(x0 + 110 - 3, barY - 10, barW + 6, 20, 10);
    bg.fillStyle(0xeee7cf, 1);
    bg.fillRoundedRect(x0 + 110, barY - 7, barW, 14, 7);
    if (lit > 0) {
      bg.fillStyle(PALETTE.good, 1);
      bg.fillRoundedRect(x0 + 110, barY - 7, Math.max(14, (barW * lit) / words.length), 14, 7);
    }
    if (gold > 0) {
      bg.fillStyle(PALETTE.sun, 1);
      bg.fillRoundedRect(x0 + 110, barY - 7, Math.max(14, (barW * gold) / words.length), 14, 7);
    }
    layer.add(bg);
    layer.add(this.add.text(x0 + 100, barY, '图鉴', textStyle(18, PALETTE.inkSoft)).setOrigin(1, 0.5));
    layer.add(this.add.text(x0 + 110 + barW + 12, barY, `${lit}/${words.length}`, textStyle(18, PALETTE.ink, FONT_EN)).setOrigin(0, 0.5));

    const chipW = (pw - 48 - 10) / 2;
    const chipY0 = y0 + 146;
    stages.forEach((st, i) => {
      const lvl = lvls.find((l) => l.stage === st.stage);
      const cx = x0 + 24 + (i % 2) * (chipW + 10) + chipW / 2;
      const cy = chipY0 + Math.floor(i / 2) * 74 + 32;
      layer.add(this.makeChip(lvl, st.label, cx, cy, chipW, 64, true, true));
    });

    const boss = lvls.find((l) => l.boss);
    const bossY = chipY0 + rows * 74 + 32;
    if (boss) layer.add(this.makeBossChip(boss, W / 2, bossY, pw - 48, 64));

    if (dictLvl) {
      const stars = engine.levelStars(dictLvl.id);
      layer.add(
        makeButton(
          this,
          W / 2,
          bossY + 32 + 34,
          pw - 48,
          46,
          `听写练习（可以挑词）${stars > 0 ? ' · 练过' : ''}`,
          () => {
            close();
            this.showDictation(courseId, unit);
          },
          { fill: 0xe8f3ff, textColor: PALETTE.ink, fontSize: 20, icon: 'pencil' },
        ),
      );
    }

    if (isSh) {
      const marked = isSchoolUnit(engine, courseId, unit);
      layer.add(
        makeButton(
          this,
          W / 2,
          bossY + 32 + 34 + (dictLvl ? 54 : 0),
          pw - 48,
          42,
          marked ? '学校这周在学这个单元（点一下取消）' : '家长：标成学校这周在学的单元',
          () => {
            setSchoolUnit(engine, marked ? undefined : courseId, unit);
            ctx().save();
            track('school_unit', { on: !marked, course: courseId, unit: unit + 1 });
            this.scene.restart({});
          },
          { fill: marked ? 0xd8f5d9 : PALETTE.board, textColor: PALETTE.ink, fontSize: 18, icon: marked ? 'check' : undefined },
        ),
      );
    }

    layer.add(makeButton(this, W / 2, y0 + ph - 40, 150, 52, '关闭', close, { fill: PALETTE.board, textColor: PALETTE.ink, fontSize: 22 }));
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 120 });
  }

  private showDictation(courseId: string, unit: number): void {
    if (this.overlay) return;
    const W = viewW(this);
    const H = viewH(this);
    const portrait = isPortrait(this);
    const words = unitSpellableWords(courseId, unit).slice(0, 30);
    const picked = new Set(words.slice(0, 14));

    const layer = this.add.container(0, 0).setDepth(100);
    this.overlay = layer;
    layer.add(this.add.rectangle(W / 2, H / 2, W, H, 0, 0.4).setInteractive());
    const close = () => {
      layer.destroy();
      this.overlay = undefined;
    };

    const cols = portrait ? 2 : 3;
    const rows = Math.ceil(words.length / cols);
    const rowH = Math.min(52, Math.floor((H - 250) / rows));
    const pw = Math.min(W - 24, portrait ? 660 : 860);
    const ph = 150 + rows * rowH + 86;
    const x0 = W / 2 - pw / 2;
    const y0 = H / 2 - ph / 2;

    const g = this.add.graphics();
    drawBoard(g, x0, y0, pw, ph, 24);
    layer.add(g);
    layer.add(this.add.text(W / 2, y0 + 38, '听写哪些词？', textStyle(30)).setOrigin(0.5));
    layer.add(
      this.add.text(W / 2, y0 + 76, '点一下词可以去掉或加上。只听发音，整个词自己拼，每个词考一次', textStyle(17, PALETTE.inkSoft)).setOrigin(0.5),
    );

    const colW = (pw - 40) / cols;
    let startBtn: Phaser.GameObjects.Container | undefined;
    const refreshers: (() => void)[] = [];
    const refresh = () => {
      refreshers.forEach((fn) => fn());
      startBtn?.destroy();
      const cnt = picked.size;
      startBtn = makeButton(
        this,
        W / 2 + 120,
        y0 + ph - 44,
        250,
        56,
        cnt ? `开始听写（${cnt} 个）` : '先挑几个词',
        () => {
          const lvl = dictationLevel(courseId, unit, [...picked]);
          if (lvl) {
            track('dictation_start', {
              course: courseId,
              unit: unit + 1,
              words: lvl.wordIds.length,
              picked: lvl.wordIds.length !== Math.min(words.length, 14),
            });
            this.scene.start('battle', { levelId: lvl.id });
          }
        },
        { fontSize: 24, disabled: !cnt, icon: cnt ? 'pencil' : undefined },
      );
      layer.add(startBtn);
    };

    words.forEach((id, i) => {
      const w = wordById(id);
      const cx = x0 + 20 + (i % cols) * colW + colW / 2;
      const cy = y0 + 112 + Math.floor(i / cols) * rowH + rowH / 2;
      const bg = this.add.graphics();
      const chk = makeIcon(this, 'check', cx - colW / 2 + 24, cy, 18, PALETTE.white);
      const en = this.add.text(cx - colW / 2 + 46, cy, w.en, textStyle(22, PALETTE.ink, FONT_EN)).setOrigin(0, 0.5);
      const zh = this.add.text(cx + colW / 2 - 14, cy, w.short, textStyle(16, PALETTE.inkSoft)).setOrigin(1, 0.5);
      const maxEnW = colW - 70 - Math.min(zh.width, 90);
      if (en.width > maxEnW) en.setScale(maxEnW / en.width);
      if (zh.width > 90) zh.setScale(90 / zh.width);

      refreshers.push(() => {
        const on = picked.has(id);
        bg.clear();
        bg.fillStyle(on ? 0xd8f5d9 : 0xf3ead8, 1);
        bg.fillRoundedRect(cx - colW / 2 + 4, cy - rowH / 2 + 3, colW - 8, rowH - 6, 10);
        bg.lineStyle(3, on ? PALETTE.good : 0xc9b99c, 1);
        bg.strokeRoundedRect(cx - colW / 2 + 4, cy - rowH / 2 + 3, colW - 8, rowH - 6, 10);
        bg.fillStyle(on ? PALETTE.good : 0xd9cdb0, 1);
        bg.fillCircle(cx - colW / 2 + 24, cy, 12);
        chk.setVisible(on);
        en.setAlpha(on ? 1 : 0.5);
        zh.setAlpha(on ? 1 : 0.5);
      });
      layer.add([bg, chk, en, zh]);

      const hit = this.add.zone(cx, cy, colW - 8, rowH - 6).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (picked.has(id)) picked.delete(id);
        else picked.add(id);
        refresh();
      });
      layer.add(hit);
    });

    layer.add(
      makeButton(
        this,
        W / 2 - 235,
        y0 + ph - 44,
        120,
        48,
        picked.size ? '全不选' : '全选',
        () => {
          if (picked.size) picked.clear();
          else words.forEach((id) => picked.add(id));
          refresh();
        },
        { fill: PALETTE.board, textColor: PALETTE.ink, fontSize: 19 },
      ),
    );
    layer.add(
      makeButton(this, W / 2 - 105, y0 + ph - 44, 110, 48, '取消', close, {
        fill: PALETTE.board,
        textColor: PALETTE.ink,
        fontSize: 19,
      }),
    );
    refresh();
  }

  private makeBossChip(
    level: LevelDef,
    x: number,
    y: number,
    w: number,
    h: number,
  ): Phaser.GameObjects.Container {
    const engine = ctx().engine;
    const open = isLevelUnlocked(level, engine);
    const stars = engine.levelStars(level.id);
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 15);
    g.fillStyle(open ? (stars > 0 ? PALETTE.sun : 0xe0484d) : 0xe6dccb, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    c.add(g);

    const textCol = open ? (stars > 0 ? PALETTE.ink : PALETTE.white) : 0xb7a88c;
    c.add(makeIcon(this, open ? 'boss' : 'lock', -w / 2 + 34, 0, 36, open ? undefined : 0xb7a88c));
    c.add(this.add.text(-w / 2 + 62, 0, 'Boss 战', textStyle(26, textCol)).setOrigin(0, 0.5));

    if (open) {
      const sg = this.add.graphics();
      for (let i = 0; i < 3; i++) drawStar(sg, w / 2 - 96 + i * 34, 0, 13, i < stars);
      c.add(sg);
      this.makeTappable(c, w, h, () => this.scene.start('battle', { levelId: level.id }), true);
      if (stars === 0) {
        this.tweens.add({ targets: c, scale: 1.03, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    } else {
      c.add(this.add.text(w / 2 - 16, 0, '前面几步都过关后出现', textStyle(16, 0xb7a88c)).setOrigin(1, 0.5));
    }
    return c;
  }

  private makeChip(
    level: LevelDef | undefined,
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
    tall = false,
    allowOverlay = false,
  ): Phaser.GameObjects.Container {
    const engine = ctx().engine;
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    if (!level) {
      g.fillStyle(0xeee7cf, 1);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
      c.add(g);
      c.add(this.add.text(0, 0, `${label}（本单元无）`, textStyle(14, 0xb7a88c)).setOrigin(0.5));
      return c;
    }

    const open = isLevelUnlocked(level, engine);
    const stars = engine.levelStars(level.id);
    const fill = open ? (stars > 0 ? 0xd8f5d9 : PALETTE.white) : 0xe6dccb;
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    g.lineStyle(3, open ? (stars > 0 ? PALETTE.good : PALETTE.carrot) : 0xc9b99c, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    c.add(g);
    c.add(this.add.text(-w / 2 + 10, tall ? -h / 4 + 2 : 0, label, textStyle(tall ? 22 : 17, open ? PALETTE.ink : 0xb7a88c)).setOrigin(0, 0.5));

    if (open) {
      const sg = this.add.graphics();
      for (let i = 0; i < 3; i++) {
        if (tall) drawStar(sg, -w / 2 + 22 + i * 30, h / 4 + 2, 12, i < stars);
        else drawStar(sg, w / 2 - 58 + i * 22, 0, 9, i < stars);
      }
      c.add(sg);
      this.makeTappable(c, w, h, () => this.scene.start('battle', { levelId: level.id }), allowOverlay);
    }
    return c;
  }

  private makeTappable(
    target: Phaser.GameObjects.Container,
    w: number,
    h: number,
    onClick: () => void,
    allowOverlay = false,
  ): void {
    target.setSize(w, h);
    target.setInteractive({ useHandCursor: true });
    let down = false;
    target.on('pointerdown', () => {
      if (!this.overlay || allowOverlay) {
        down = true;
        ctx().platform.sfx.play('tap');
        this.tweens.add({ targets: target, scale: 0.96, duration: 70, yoyo: true });
      }
    });
    target.on('pointerout', () => {
      down = false;
    });
    target.on('pointerup', () => {
      if (down && (allowOverlay || !this.overlay)) onClick();
      down = false;
    });
  }
}
