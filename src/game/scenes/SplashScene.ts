import Phaser from 'phaser';
import { petState, rankForXp } from '../../core/rewards';
import { ctx } from '../context';
import { FONT_EN, FONT_PLAIN, isPortrait, PALETTE, setupCamera, textStyle, viewH, viewW } from '../theme';
import { makeCastle } from '../ui/castle';
import { makeIcon } from '../ui/icons';
import { PetView } from '../ui/pet';

export type IntroStyle = 'action' | 'fairy';

export interface SplashSceneData {
  style?: IntroStyle;
}

const INTRO_STORAGE_KEY = 'word-guard:intro-style';

export function getIntroStyle(): IntroStyle {
  try {
    const param = new URLSearchParams(location.search).get('intro');
    if (param === 'action' || param === 'fairy') return param;
    const saved = localStorage.getItem(INTRO_STORAGE_KEY);
    if (saved === 'action' || saved === 'fairy') return saved;
  } catch {
    // ignore storage errors
  }
  return 'action';
}

export function setIntroStyle(style: IntroStyle): void {
  try {
    localStorage.setItem(INTRO_STORAGE_KEY, style);
  } catch {
    // ignore storage errors
  }
}

export class SplashScene extends Phaser.Scene {
  private leaving = false;
  private style: IntroStyle = 'action';

  constructor() {
    super('splash');
  }

  init(data?: SplashSceneData): void {
    this.style = data?.style ?? getIntroStyle();
    this.leaving = false;
  }

  create(): void {
    setupCamera(this);
    const W = viewW(this);
    const H = viewH(this);
    const portrait = isPortrait(this);

    const finish = () => {
      if (this.leaving) return;
      this.leaving = true;
      this.cameras.main.fadeOut(260, 201, 240, 238);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('menu');
      });
    };

    // Tap anywhere to skip immediately
    this.input.once('pointerdown', finish);

    if (this.style === 'fairy') {
      this.playFairyIntro(W, H, portrait, finish);
    } else {
      this.playActionIntro(W, H, portrait, finish);
    }

    // Subtle skip hint & style tag
    const styleLabel = this.style === 'fairy' ? '童话星光风' : '热血塔防风';
    this.add
      .text(W / 2, H - (portrait ? 54 : 34), `${styleLabel} · 轻点任意处跳过`, textStyle(18, 0xffffff, FONT_PLAIN))
      .setOrigin(0.5)
      .setAlpha(0.78)
      .setDepth(50);
  }

  /** 方案 A：热血塔防风 —— 小怪来袭 → 冰蓝星辰魔法击退 → 城堡护盾升起 + 标题震屏登场 */
  private playActionIntro(W: number, H: number, portrait: boolean, finish: () => void): void {
    const cx = W / 2;
    const cy = H / 2;

    // 1. Dynamic twilight-sky backdrop with radial speed lines
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1f3c6e, 0x1f3c6e, 0x4fb8d6, 0x4fb8d6, 1);
    bg.fillRect(0, 0, W, H);

    const rays = this.add.graphics().setPosition(cx, cy - 30).setAlpha(0.16);
    for (let i = 0; i < 18; i++) {
      const a0 = (i / 18) * Math.PI * 2;
      const a1 = a0 + 0.12;
      rays.fillStyle(0xffffff, 1);
      rays.beginPath();
      rays.moveTo(0, 0);
      rays.arc(0, 0, Math.max(W, H), a0, a1);
      rays.closePath();
      rays.fillPath();
    }
    this.tweens.add({ targets: rays, angle: 360, duration: 14000, repeat: -1 });

    // 2. Cute word-sign monsters rush in from left & right
    const words = ['APPLE', 'STAR', 'MAGIC'];
    const monsters: Phaser.GameObjects.Container[] = [];
    const spawnCoords = [
      { sx: -90, tx: cx - (portrait ? 170 : 250), y: cy + (portrait ? 70 : 40), col: PALETTE.monster[0] },
      { sx: W + 90, tx: cx + (portrait ? 170 : 250), y: cy + (portrait ? 95 : 55), col: PALETTE.monster[1] },
      { sx: W + 110, tx: cx + (portrait ? 90 : 150), y: cy - (portrait ? 120 : 95), col: PALETTE.monster[3] },
    ];

    spawnCoords.forEach((cfg, i) => {
      const m = this.add.container(cfg.sx, cfg.y).setDepth(12);
      const mg = this.add.graphics();
      // Monster body
      mg.fillStyle(cfg.col, 1);
      mg.fillCircle(0, 14, 34);
      mg.lineStyle(4, PALETTE.ink, 1);
      mg.strokeCircle(0, 14, 34);
      // Eyes
      mg.fillStyle(0xffffff, 1);
      mg.fillCircle(-11, 8, 7);
      mg.fillCircle(11, 8, 7);
      mg.fillStyle(PALETTE.ink, 1);
      mg.fillCircle(-10, 8, 3.5);
      mg.fillCircle(10, 8, 3.5);
      // Word sign
      mg.fillStyle(PALETTE.board, 1);
      mg.fillRoundedRect(-52, -48, 104, 36, 10);
      mg.lineStyle(3, PALETTE.ink, 1);
      mg.strokeRoundedRect(-52, -48, 104, 36, 10);
      m.add(mg);
      m.add(this.add.text(0, -30, words[i], textStyle(18, PALETTE.ink, FONT_EN)).setOrigin(0.5));
      monsters.push(m);

      this.tweens.add({
        targets: m,
        x: cfg.tx,
        duration: 420,
        delay: i * 70,
        ease: 'Back.easeOut',
      });
    });

    // 3. Ice-blue + golden star slash sweeps across and knocks monsters flying
    this.time.delayedCall(520, () => {
      if (this.leaving) return;
      ctx().platform.sfx.play('streak', 1.45);
      this.cameras.main.shake(170, 0.011);

      const slash = this.add.graphics().setDepth(20);
      slash.lineStyle(18, 0x7ce4ff, 0.95);
      slash.lineBetween(cx - W * 0.45, cy + 160, cx + W * 0.45, cy - 160);
      slash.lineStyle(7, PALETTE.sun, 1);
      slash.lineBetween(cx - W * 0.42, cy + 150, cx + W * 0.42, cy - 150);
      this.tweens.add({
        targets: slash,
        alpha: 0,
        scaleY: 2.2,
        duration: 380,
        ease: 'Cubic.easeOut',
        onComplete: () => slash.destroy(),
      });

      // Knock monsters flying off screen + star bursts
      monsters.forEach((m, i) => {
        const dir = m.x < cx ? -1 : 1;
        this.tweens.add({
          targets: m,
          x: m.x + dir * 420,
          y: m.y - 180,
          angle: dir * 320,
          alpha: 0,
          scale: 0.4,
          duration: 460,
          ease: 'Cubic.easeIn',
        });
        for (let k = 0; k < 5; k++) {
          const sp = makeIcon(this, k % 2 === 0 ? 'snow' : 'star', m.x, m.y, 18 + (k % 3) * 8, k % 2 === 0 ? 0x7ce4ff : PALETTE.sun)
            .setDepth(22);
          const ang = (k / 5) * Math.PI * 2 + i;
          this.tweens.add({
            targets: sp,
            x: m.x + Math.cos(ang) * 110,
            y: m.y + Math.sin(ang) * 110,
            alpha: 0,
            scale: 0.2,
            duration: 500,
            onComplete: () => sp.destroy(),
          });
        }
      });
    });

    // 4. Castle rises with shield wave + Title slams in with confetti
    this.time.delayedCall(820, () => {
      if (this.leaving) return;
      ctx().platform.sfx.play('win');

      const rank = rankForXp(ctx().engine.xp);
      const castleY = cy + (portrait ? 150 : 120);
      const castle = makeCastle(this, cx, castleY + 80, portrait ? 1.35 : 1.15, Math.min(4, Math.floor(rank.index / 2))).setDepth(14).setAlpha(0);
      this.tweens.add({
        targets: castle,
        y: castleY,
        alpha: 1,
        duration: 460,
        ease: 'Back.easeOut',
      });

      // Expanding magic shield ring
      const ring = this.add.circle(cx, castleY - 20, 40, 0x7ce4ff, 0.22).setStrokeStyle(6, PALETTE.sun, 0.9).setDepth(13);
      this.tweens.add({
        targets: ring,
        scale: 3.4,
        alpha: 0,
        duration: 680,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy(),
      });

      this.spawnTitleBlock(cx, cy - (portrait ? 110 : 75), portrait, 0xfff4dc);
      this.spawnConfetti(cx, cy - 60, 26);
    });

    this.time.delayedCall(2750, finish);
  }

  /** 方案 B：童话星光风 —— 晨光云海散开 → 城堡与小伙伴浮现 + 金色星轨点亮标题 + 发光字母飘升 */
  private playFairyIntro(W: number, H: number, portrait: boolean, finish: () => void): void {
    const cx = W / 2;
    const cy = H / 2;

    // 1. Warm dawn gradient sky
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x7fd3ec, 0x7fd3ec, 0xfff1cf, 0xfff1cf, 1);
    bg.fillRect(0, 0, W, H);

    // Warm sun glow behind castle
    const glow = this.add.circle(cx, cy + 20, portrait ? 210 : 185, 0xffe596, 0.35).setDepth(2).setScale(0.3);
    this.tweens.add({ targets: glow, scale: 1.25, alpha: 0.55, duration: 1200, ease: 'Sine.easeOut' });

    // Soft rotating sunbeams
    const beams = this.add.graphics().setPosition(cx, cy + 20).setAlpha(0.24).setDepth(3);
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2;
      beams.fillStyle(0xfff6d1, 1);
      beams.beginPath();
      beams.moveTo(0, 0);
      beams.arc(0, 0, Math.max(W, H) * 0.75, a0, a0 + 0.14);
      beams.closePath();
      beams.fillPath();
    }
    this.tweens.add({ targets: beams, angle: 120, duration: 10000, repeat: -1 });

    // 2. Parting fluffy clouds
    const makeCloud = (x: number, y: number, s: number) => {
      const g = this.add.graphics().setPosition(x, y).setDepth(28);
      g.fillStyle(0xffffff, 0.92);
      g.fillCircle(0, 0, 58 * s);
      g.fillCircle(-52 * s, 14 * s, 44 * s);
      g.fillCircle(56 * s, 12 * s, 46 * s);
      g.fillRoundedRect(-90 * s, 10 * s, 180 * s, 42 * s, 20 * s);
      return g;
    };
    const leftCloud = makeCloud(cx - 80, cy + 40, portrait ? 1.5 : 1.7);
    const rightCloud = makeCloud(cx + 80, cy + 60, portrait ? 1.5 : 1.7);
    this.tweens.add({ targets: leftCloud, x: -240, alpha: 0, duration: 1050, ease: 'Cubic.easeInOut' });
    this.tweens.add({ targets: rightCloud, x: W + 240, alpha: 0, duration: 1050, ease: 'Cubic.easeInOut' });

    // 3. Floating glowing letters & stardust
    const letters = ['A', 'B', 'C', 'W', 'O', 'R', 'D', '★'];
    for (let i = 0; i < 14; i++) {
      const lx = 60 + ((W - 120) * i) / 13;
      const ly = H * 0.65 + (i % 3) * 70;
      const ch = letters[i % letters.length];
      const t = this.add
        .text(lx, ly, ch, textStyle(24 + (i % 3) * 8, i % 2 === 0 ? 0xf5a623 : 0x5b8def, FONT_EN))
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(6);
      this.tweens.add({
        targets: t,
        y: ly - 220 - (i % 4) * 45,
        alpha: { from: 0, to: 0.72 },
        duration: 1500 + (i % 4) * 260,
        delay: i * 65,
        ease: 'Sine.easeOut',
      });
    }

    // 4. Castle + Pet (or mystery egg) float up smoothly
    this.time.delayedCall(260, () => {
      if (this.leaving) return;
      ctx().platform.sfx.play('streak', 1.15);
      const rank = rankForXp(ctx().engine.xp);
      const castleY = cy + (portrait ? 155 : 122);
      const castle = makeCastle(this, cx, castleY + 60, portrait ? 1.32 : 1.15, Math.min(4, Math.floor(rank.index / 2))).setDepth(12).setAlpha(0);
      this.tweens.add({
        targets: castle,
        y: castleY,
        alpha: 1,
        duration: 720,
        ease: 'Sine.easeOut',
      });

      const ps = petState(ctx().engine);
      const pet = new PetView(this, cx + (portrait ? 135 : 155), castleY + 68, ps?.kind ?? 0, ps?.stage ?? 0, 0.95)
        .setDepth(14)
        .setAlpha(0);
      this.tweens.add({
        targets: pet,
        y: castleY + 26,
        alpha: 1,
        duration: 760,
        delay: 140,
        ease: 'Back.easeOut',
      });
    });

    // 5. Golden shooting-star arc lights up the title
    this.time.delayedCall(620, () => {
      if (this.leaving) return;
      const comet = makeIcon(this, 'star', cx - W * 0.36, cy - 20, 36, PALETTE.sun).setDepth(24);
      const targetY = cy - (portrait ? 115 : 80);
      this.tweens.add({
        targets: comet,
        x: cx,
        y: targetY,
        angle: 360,
        duration: 420,
        ease: 'Quad.easeOut',
        onUpdate: () => {
          const dot = this.add.circle(comet.x, comet.y, 7, PALETTE.sun, 0.75).setDepth(22);
          this.tweens.add({ targets: dot, scale: 0.1, alpha: 0, duration: 320, onComplete: () => dot.destroy() });
        },
        onComplete: () => {
          comet.destroy();
          if (this.leaving) return;
          ctx().platform.sfx.play('win');
          const bloom = this.add.circle(cx, targetY, 30, 0xfff4c2, 0.65).setDepth(19);
          this.tweens.add({
            targets: bloom,
            scale: 4.2,
            alpha: 0,
            duration: 520,
            ease: 'Cubic.easeOut',
            onComplete: () => bloom.destroy(),
          });
          this.spawnTitleBlock(cx, targetY, portrait, 0xfff8e6);
        },
      });
    });

    this.time.delayedCall(2850, finish);
  }

  private spawnTitleBlock(cx: number, cy: number, portrait: boolean, strokeCol: number): void {
    const titleBox = this.add.container(cx, cy).setDepth(30).setScale(0.3).setAlpha(0);
    const title = this.add
      .text(0, 0, '单词守卫', textStyle(portrait ? 78 : 74, PALETTE.ink, undefined, { stroke: `#${strokeCol.toString(16).padStart(6, '0')}`, strokeThickness: 12 }))
      .setOrigin(0.5);
    titleBox.add(title);

    // Gold 2.0 badge
    const bx = title.width / 2 + 24;
    const by = -28;
    const bg = this.add.graphics();
    bg.fillStyle(PALETTE.ink, 1);
    bg.fillRoundedRect(bx - 30, by - 18, 60, 36, 14);
    bg.fillStyle(PALETTE.sun, 1);
    bg.fillRoundedRect(bx - 27, by - 15, 54, 30, 12);
    titleBox.add(bg);
    titleBox.add(this.add.text(bx, by, '2.0', textStyle(22, PALETTE.ink, FONT_EN)).setOrigin(0.5));

    const sub = this.add
      .text(0, portrait ? 62 : 56, '听音 · 拼写 · 守护你的英语城堡', textStyle(portrait ? 24 : 22, PALETTE.ink, undefined, { stroke: '#fff9eb', strokeThickness: 6 }))
      .setOrigin(0.5);
    titleBox.add(sub);

    this.tweens.add({
      targets: titleBox,
      scale: 1,
      alpha: 1,
      duration: 460,
      ease: 'Back.easeOut',
    });
  }

  private spawnConfetti(cx: number, cy: number, count: number): void {
    const colors = [PALETTE.sun, PALETTE.carrot, PALETTE.good, 0x5b8def, 0xf27ea9];
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
      const dist = 120 + Math.random() * 190;
      const p = this.add
        .rectangle(cx, cy, 10 + Math.random() * 8, 6 + Math.random() * 6, colors[i % colors.length])
        .setDepth(26)
        .setRotation(Math.random() * Math.PI);
      this.tweens.add({
        targets: p,
        x: cx + Math.cos(ang) * dist,
        y: cy + Math.sin(ang) * dist + 70,
        angle: (Math.random() - 0.5) * 360,
        alpha: 0,
        duration: 850 + Math.random() * 350,
        ease: 'Cubic.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }
}
