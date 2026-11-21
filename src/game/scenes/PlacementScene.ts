import Phaser from 'phaser';
import { chaptersForRoute, getCourse } from '../../core/content/levels';
import { wordById } from '../../core/content/words';
import { PlacementTest } from '../../core/placement';
import { createRng } from '../../core/rng';
import { track } from '../analytics';
import { ctx } from '../context';
import {
  drawBackdrop,
  drawBoard,
  FONT_EN,
  FONT_MIX,
  FONT_PLAIN,
  isPortrait,
  PALETTE,
  setupCamera,
  textStyle,
  viewH,
  viewW,
} from '../theme';
import { makeButton, makeSpeakerButton } from '../ui/widgets';

export class PlacementScene extends Phaser.Scene {
  private test!: PlacementTest;
  private layer!: Phaser.GameObjects.Container;
  private busy = false;

  constructor() {
    super('placement');
  }

  create(): void {
    setupCamera(this);
    drawBackdrop(this);
    ctx().platform.music.setMood('calm');
    this.test = new PlacementTest(createRng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0));
    this.layer = this.add.container(0, 0);
    this.busy = false;
    makeButton(this, 70, isPortrait(this) ? 56 : 44, 108, 52, '返回', () => this.scene.start('menu'), {
      fill: PALETTE.board,
      textColor: PALETTE.ink,
      fontSize: 22,
    });
    this.showIntro();
  }

  private showIntro(): void {
    const W = viewW(this);
    const H = viewH(this);
    this.layer.removeAll(true);
    const pw = Math.min(W - 40, 620);
    const g = this.add.graphics();
    drawBoard(g, W / 2 - pw / 2, H / 2 - 220, pw, 440, 26);
    this.layer.add(g);
    this.layer.add(this.add.text(W / 2, H / 2 - 160, '水平测试', textStyle(48)).setOrigin(0.5));

    const lines = [
      '一共 24 道题，大约 5 分钟',
      '看（听）英文单词，选出它的中文意思',
      '不认识就点"不认识"，不要猜',
      '题目会越来越难，做错很正常',
    ];
    lines.forEach((line, i) => {
      this.layer.add(this.add.text(W / 2, H / 2 - 80 + i * 44, line, textStyle(24, PALETTE.inkSoft)).setOrigin(0.5));
    });
    this.layer.add(
      makeButton(this, W / 2, H / 2 + 150, 260, 80, '开始测试', () => this.showItem(), { fontSize: 34 }),
    );
  }

  private showItem(): void {
    const W = viewW(this);
    const H = viewH(this);
    const portrait = isPortrait(this);
    this.layer.removeAll(true);
    this.busy = false;

    const item = this.test.current;
    const word = wordById(item.wordId);
    const topY = portrait ? 140 : 100;
    this.layer.add(this.add.text(W / 2, topY, `第 ${this.test.index + 1} / 24 题`, textStyle(24, PALETTE.inkSoft)).setOrigin(0.5));

    const bar = this.add.graphics();
    const barW = Math.min(W - 80, 600);
    bar.fillStyle(0xe6dccb, 1);
    bar.fillRoundedRect(W / 2 - barW / 2, topY + 26, barW, 12, 6);
    bar.fillStyle(PALETTE.carrot, 1);
    bar.fillRoundedRect(W / 2 - barW / 2, topY + 26, (barW * this.test.index) / 24, 12, 6);
    this.layer.add(bar);

    const wordY = portrait ? H * 0.3 : H * 0.34;
    const wordText = this.add.text(W / 2 + 40, wordY, word.en, textStyle(portrait ? 80 : 76, PALETTE.ink, FONT_EN)).setOrigin(0.5);
    if (wordText.width > W - 240) wordText.setScale((W - 240) / wordText.width);
    this.layer.add(wordText);
    this.layer.add(
      makeSpeakerButton(this, wordText.x - wordText.displayWidth / 2 - 60, wordY, 80, () =>
        ctx().platform.speech.say(word.en),
      ),
    );
    ctx().platform.speech.say(word.en, { interrupt: true });

    const cols = portrait ? 1 : 2;
    const bw = portrait ? Math.min(W - 80, 560) : 420;
    const bh = portrait ? 86 : 82;
    const startY = portrait ? H * 0.42 : H * 0.52;
    const btns: Phaser.GameObjects.Container[] = [];

    item.options.forEach((opt, idx) => {
      const bx = cols === 1 ? W / 2 : W / 2 + (idx % 2 === 0 ? -1 : 1) * (bw / 2 + 9);
      const by = startY + Math.floor(idx / cols) * (bh + 18) + bh / 2;
      const btn = makeButton(this, bx, by, bw, bh, opt, () => this.choose(idx, btns), {
        fill: PALETTE.white,
        textColor: PALETTE.ink,
        fontSize: 30,
        family: FONT_PLAIN,
      });
      btns.push(btn);
      this.layer.add(btn);
    });

    const skipY = startY + Math.ceil(item.options.length / cols) * (bh + 18) + 40;
    this.layer.add(
      makeButton(this, W / 2, skipY, 220, 64, '不认识', () => this.choose(null, btns), {
        fill: PALETTE.board,
        textColor: PALETTE.inkSoft,
        fontSize: 26,
      }),
    );
  }

  private choose(choice: number | null, btns: Phaser.GameObjects.Container[]): void {
    if (this.busy) return;
    this.busy = true;
    const item = this.test.current;
    const ans = this.test.answer(choice);
    ctx().engine.record(item.wordId, 'recognize', ans.correct ? 'perfect' : 'missed', ctx().platform.now());
    ctx().platform.sfx.play(ans.correct ? 'correct' : 'wrong');

    const outline = (idx: number, color: number) => {
      const b = btns[idx];
      const g = this.add.graphics();
      const bw = b.width;
      const bh = b.height - 6;
      g.lineStyle(8, color, 1);
      g.strokeRoundedRect(b.x - bw / 2 - 6, b.y - bh / 2 - 6, bw + 12, bh + 12, 24);
      this.layer.add(g);
    };

    outline(item.answer, PALETTE.good);
    if (choice !== null && !ans.correct) outline(choice, PALETTE.bad);

    this.time.delayedCall(ans.correct ? 600 : 1100, () => {
      if (this.test.done) this.showResult();
      else this.showItem();
    });
  }

  private showResult(): void {
    const W = viewW(this);
    const H = viewH(this);
    const c = ctx();
    const res = this.test.result(c.platform.now());

    c.engine.data.placement = { band: res.band, course: res.course, unit: res.unit, at: res.at };
    track('placement_done', { band: res.band, course: res.course, unit: res.unit + 1 });
    c.save();

    this.registry.set('levels:route', 'cambridge');
    this.registry.set(
      'levels:chapter:cambridge',
      Math.max(0, chaptersForRoute('cambridge').findIndex((ch) => ch.course === res.course && ch.units.includes(res.unit))),
    );
    this.layer.removeAll(true);
    ctx().platform.sfx.play('win');

    const pw = Math.min(W - 40, 640);
    const g = this.add.graphics();
    drawBoard(g, W / 2 - pw / 2, H / 2 - 230, pw, 460, 26);
    this.layer.add(g);
    this.layer.add(this.add.text(W / 2, H / 2 - 176, '测试完成！', textStyle(44, PALETTE.good)).setOrigin(0.5));
    this.layer.add(this.add.text(W / 2, H / 2 - 112, `答对 ${res.correct} / ${res.total} 题`, textStyle(24, PALETTE.inkSoft)).setOrigin(0.5));
    this.layer.add(this.add.text(W / 2, H / 2 - 50, `现在的水平：${res.label}`, textStyle(36, PALETTE.ink, FONT_MIX)).setOrigin(0.5));
    this.layer.add(
      this.add.text(W / 2, H / 2 + 10, `建议从 ${getCourse(res.course).short} 第 ${res.unit + 1} 单元开始`, textStyle(26, PALETTE.carrotDark)).setOrigin(0.5),
    );
    this.layer.add(
      this.add
        .text(
          W / 2,
          H / 2 + 62,
          res.band > 0 ? '前面的单元也都打开了，想复习随时可以去' : '答错的词已经记下来了，游戏里会多出现',
          textStyle(18, PALETTE.inkSoft),
        )
        .setOrigin(0.5),
    );
    this.layer.add(
      makeButton(this, W / 2 - 120, H / 2 + 150, 220, 72, '开始学习', () => this.scene.start('levels'), { fontSize: 30 }),
    );
    this.layer.add(
      makeButton(this, W / 2 + 120, H / 2 + 150, 200, 72, '重新测试', () => this.scene.restart(), {
        fill: PALETTE.board,
        textColor: PALETTE.ink,
        fontSize: 26,
      }),
    );
  }
}
