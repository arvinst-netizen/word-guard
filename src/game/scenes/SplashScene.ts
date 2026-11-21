import Phaser from 'phaser';
import { petState, rankForXp } from '../../core/rewards';
import { ctx } from '../context';
import { FONT_EN, FONT_PLAIN, isPortrait, PALETTE, setupCamera, textStyle, viewH, viewW } from '../theme';
import { makeCastle } from '../ui/castle';
import { makeIcon } from '../ui/icons';
import { PetView } from '../ui/pet';

export class SplashScene extends Phaser.Scene {
  private leaving = false;

  constructor() {
    super('splash');
  }

  init(): void {
    this.leaving = false;
  }

  create(): void {
    setupCamera(this);
    const W = viewW(this);
    const H = viewH(this);
    const portrait = isPortrait(this);
    const cx = W / 2;
    const cy = H / 2;

    const finish = () => {
      if (this.leaving) return;
      this.leaving = true;
      this.cameras.main.fadeOut(260, 201, 240, 238);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('menu');
      });
    };

    // Start Fairy Starlight musical fanfare & calm background music
    ctx().platform.music.setMood('calm');
    ctx().platform.sfx.play('intro');

    // Tap anywhere to skip immediately
    this.input.once('pointerdown', finish);

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
      const rank = rankForXp(ctx().engine.xp);
      const castleTier = Math.min(4, Math.floor(rank.index / 2));
      const castleY = cy + (portrait ? 155 : 122);
      const castle = makeCastle(this, cx, castleY + 60, portrait ? 1.32 : 1.15, castleTier).setDepth(12).setAlpha(0);
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
    this.time.delayedCall(600, () => {
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
          const bloom = this.add.circle(cx, targetY, 30, 0xfff4c2, 0.65).setDepth(19);
          this.tweens.add({
            targets: bloom,
            scale: 4.2,
            alpha: 0,
            duration: 520,
            ease: 'Cubic.easeOut',
            onComplete: () => bloom.destroy(),
          });
          this.spawnTitleBlock(cx, targetY, portrait);
        },
      });
    });

    // Subtle skip hint
    this.add
      .text(W / 2, H - (portrait ? 54 : 34), '轻点任意处跳过', textStyle(18, PALETTE.inkSoft, FONT_PLAIN))
      .setOrigin(0.5)
      .setAlpha(0.75)
      .setDepth(50);

    this.time.delayedCall(2850, finish);
  }

  private spawnTitleBlock(cx: number, cy: number, portrait: boolean): void {
    const titleBox = this.add.container(cx, cy).setDepth(30).setScale(0.3).setAlpha(0);
    const title = this.add
      .text(0, 0, '单词守卫', textStyle(portrait ? 78 : 74, PALETTE.ink, undefined, { stroke: '#fff8e6', strokeThickness: 12 }))
      .setOrigin(0.5);
    titleBox.add(title);

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
}
