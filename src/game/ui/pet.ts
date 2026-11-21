import Phaser from 'phaser';
import { PALETTE } from '../theme';
import { uiArtKey } from '../ui-art';

const PET_KEYS = ['dragon', 'fox', 'owl'] as const;

const PET_PALETTES = [
  { body: 0x86d56f, dark: 0x4fa64a, belly: 0xfff1b8, accent: 0xff8a3d },
  { body: 0xffa24d, dark: 0xd96b1f, belly: 0xfff6e6, accent: 0xffffff },
  { body: 0x78b7f2, dark: 0x3f7fc4, belly: 0xf4f9ff, accent: 0xffd34d },
] as const;

export const PET_STAGE_SCALES = [0, 0.6, 0.76, 0.92, 1.06, 1.16] as const;

function drawOutlinedEllipse(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  border = 4,
): void {
  g.fillStyle(PALETTE.ink, 1);
  g.fillEllipse(x, y, w + border * 2, h + border * 2);
  g.fillStyle(fill, 1);
  g.fillEllipse(x, y, w, h);
}

function drawOutlinedTriangle(
  g: Phaser.GameObjects.Graphics,
  pts: [number, number, number, number, number, number],
  fill: number,
): void {
  const [x1, y1, x2, y2, x3, y3] = pts;
  g.fillStyle(fill, 1);
  g.fillTriangle(x1, y1, x2, y2, x3, y3);
  g.lineStyle(4, PALETTE.ink, 1);
  g.strokeTriangle(x1, y1, x2, y2, x3, y3);
}

function drawEgg(g: Phaser.GameObjects.Graphics, kind: number, crack: number): void {
  const pal = PET_PALETTES[kind];
  g.fillStyle(PALETTE.shadow, 0.2);
  g.fillEllipse(0, 0, 70, 14);
  drawOutlinedEllipse(g, 0, -40, 62, 78, pal.belly);
  g.fillStyle(pal.body, 1);
  g.fillCircle(-12, -52, 9);
  g.fillCircle(14, -34, 11);
  g.fillCircle(-8, -18, 7);
  g.fillStyle(pal.dark, 1);
  g.fillCircle(12, -62, 5);
  g.fillStyle(0xffffff, 0.6);
  g.fillEllipse(-14, -62, 12, 18);
  if (crack > 0) {
    g.lineStyle(3, PALETTE.ink, 1);
    g.beginPath();
    g.moveTo(-22, -44);
    g.lineTo(-12, -36);
    g.lineTo(-4, -46);
    if (crack > 1) {
      g.lineTo(6, -36);
      g.lineTo(16, -46);
    }
    g.strokePath();
  }
}

function drawFace(
  g: Phaser.GameObjects.Graphics,
  y: number,
  s: number,
  kind: number,
  happy: boolean,
): void {
  const ex = 15 * s;
  const er = 10 * s;
  for (const side of [-1, 1]) {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(side * ex, y, er);
    g.lineStyle(3, PALETTE.ink, 1);
    g.strokeCircle(side * ex, y, er);
    g.fillStyle(PALETTE.ink, 1);
    g.fillCircle(side * ex, y + 1, er * 0.56);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(side * ex - er * 0.2, y - er * 0.25, er * 0.22);
  }
  g.fillStyle(0xff8fa3, 0.55);
  g.fillEllipse(-ex - er * 1.1, y + er * 1.1, er * 1.1, er * 0.6);
  g.fillEllipse(ex + er * 1.1, y + er * 1.1, er * 1.1, er * 0.6);

  if (kind === 2) {
    drawOutlinedTriangle(g, [-6 * s, y + er * 0.9, 6 * s, y + er * 0.9, 0, y + er * 0.9 + 11 * s], 0xffb020);
  } else {
    g.lineStyle(3, PALETTE.ink, 1);
    g.beginPath();
    if (happy) g.arc(0, y + er * 0.9, 7 * s, 0.15, Math.PI - 0.15);
    else g.arc(0, y + er * 1.5, 5 * s, Math.PI + 0.3, -0.3);
    g.strokePath();
    if (kind === 1) {
      g.fillStyle(PALETTE.ink, 1);
      g.fillEllipse(0, y + er * 0.75, 8 * s, 5 * s);
    }
  }
}

function drawCreature(g: Phaser.GameObjects.Graphics, kind: number, stage: number, happy: boolean): void {
  const pal = PET_PALETTES[kind];
  const s = PET_STAGE_SCALES[stage];
  const w = 84 * s;
  const h = 88 * s;
  const cy = -h / 2 - 6 * s;

  g.fillStyle(PALETTE.shadow, 0.2);
  g.fillEllipse(0, 0, w * 0.95, 14 * s + 4);

  if (stage >= 5) {
    g.fillStyle(0xfff3a8, 0.5);
    g.fillCircle(0, cy, w * 0.95);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(0, cy, w * 0.72);
  }

  if (kind === 0) {
    if (stage >= 2) {
      drawOutlinedEllipse(g, w * 0.5, -10 * s, 34 * s, 18 * s, pal.body);
      drawOutlinedEllipse(g, w * 0.72, -20 * s, 22 * s, 14 * s, pal.body);
      drawOutlinedTriangle(g, [w * 0.8, -34 * s, w * 0.98, -30 * s, w * 0.86, -16 * s], pal.accent);
    }
    if (stage >= 3) {
      const wing = (stage >= 4 ? 52 : 34) * s;
      for (const side of [-1, 1]) {
        drawOutlinedTriangle(
          g,
          [side * w * 0.34, cy - 8 * s, side * (w * 0.36 + wing), cy - 40 * s, side * (w * 0.36 + wing * 0.8), cy + 14 * s],
          pal.dark,
        );
        g.lineStyle(3, PALETTE.ink, 0.6);
        g.lineBetween(side * w * 0.36, cy - 6 * s, side * (w * 0.36 + wing * 0.8), cy - 14 * s);
      }
    }
  } else if (kind === 1) {
    const tails = stage >= 5 ? 3 : stage >= 4 ? 2 : stage >= 2 ? 1 : 0;
    for (let i = 0; i < tails; i++) {
      const off = tails === 1 ? 0 : (i - (tails - 1) / 2) * 0.5;
      const tx = w * 0.52 + Math.abs(off) * -10 * s;
      const ty = -26 * s - Math.abs(off) * 4 * s + off * 30 * s;
      drawOutlinedEllipse(g, tx, ty, 46 * s, 28 * s, pal.body);
      drawOutlinedEllipse(g, tx + 16 * s, ty - 6 * s, 20 * s, 16 * s, pal.accent, 3);
    }
  } else if (stage >= 2) {
    const spread = stage >= 4 ? 30 * s : stage >= 3 ? 12 * s : 0;
    for (const side of [-1, 1]) {
      drawOutlinedEllipse(g, side * (w * 0.46 + spread * 0.5), cy + 10 * s - spread * 0.4, 30 * s + spread, 50 * s, pal.dark);
      if (spread > 0) {
        g.lineStyle(3, PALETTE.ink, 0.5);
        g.lineBetween(w * 0.4 * side, cy, side * (w * 0.46 + spread), cy + 20 * s);
      }
    }
  }

  if (kind === 0) {
    const ear = (stage >= 3 ? 24 : 14) * s;
    for (const side of [-1, 1]) {
      drawOutlinedTriangle(
        g,
        [side * 14 * s, cy - h * 0.42, side * 30 * s, cy - h * 0.4, side * 26 * s, cy - h * 0.42 - ear],
        0xfff1b8,
      );
    }
  } else if (kind === 1) {
    const ear = (stage >= 2 ? 34 : 24) * s;
    for (const side of [-1, 1]) {
      drawOutlinedTriangle(
        g,
        [side * 8 * s, cy - h * 0.36, side * 38 * s, cy - h * 0.26, side * 32 * s, cy - h * 0.36 - ear],
        pal.body,
      );
      g.fillStyle(0xffd9c2, 1);
      g.fillTriangle(
        side * 16 * s,
        cy - h * 0.36,
        side * 32 * s,
        cy - h * 0.3,
        side * 29 * s,
        cy - h * 0.36 - ear * 0.6,
      );
    }
  } else {
    const ear = (stage >= 3 ? 22 : 14) * s;
    for (const side of [-1, 1]) {
      drawOutlinedTriangle(
        g,
        [side * 12 * s, cy - h * 0.4, side * 34 * s, cy - h * 0.34, side * 36 * s, cy - h * 0.4 - ear],
        pal.dark,
      );
    }
  }

  drawOutlinedEllipse(g, 0, cy, w, h, pal.body);
  g.fillStyle(pal.belly, 1);
  g.fillEllipse(0, cy + h * 0.16, w * 0.62, h * 0.56);

  if (kind === 0) {
    g.lineStyle(2.5, pal.accent, 0.5);
    for (let i = 0; i < 3; i++) {
      g.lineBetween(-w * 0.2, cy + h * (0.1 + i * 0.1), w * 0.2, cy + h * (0.1 + i * 0.1));
    }
    if (stage >= 2) {
      for (let i = 0; i < 3; i++) {
        g.fillStyle(pal.accent, 1).fillTriangle(
          -6 * s + i * 6 * s - 6 * s,
          cy - h * 0.48,
          6 * s + i * 6 * s - 6 * s,
          cy - h * 0.48,
          i * 6 * s - 6 * s,
          cy - h * 0.48 - 10 * s,
        );
      }
    }
  }

  if (kind === 2) {
    g.lineStyle(2.5, pal.dark, 0.5);
    for (let row = 0; row < 2; row++) {
      for (let col = -1; col <= 1; col++) {
        g.beginPath();
        g.arc(col * 13 * s + (row % 2) * 6 * s, cy + h * (0.12 + row * 0.12), 6 * s, 0.2, Math.PI - 0.2);
        g.strokePath();
      }
    }
    g.fillStyle(pal.belly, 1);
    g.fillCircle(-15 * s, cy - h * 0.12, 16 * s);
    g.fillCircle(15 * s, cy - h * 0.12, 16 * s);
  }

  g.fillStyle(0xffffff, 0.35);
  g.fillEllipse(-w * 0.24, cy - h * 0.3, w * 0.2, h * 0.1);
  drawFace(g, cy - h * 0.12, s, kind, happy);

  for (const side of [-1, 1]) {
    drawOutlinedEllipse(g, side * w * 0.22, -3 * s, 24 * s, 12 * s, pal.dark, 3);
  }

  if (stage >= 2 && kind !== 2) {
    for (const side of [-1, 1]) {
      drawOutlinedEllipse(g, side * w * 0.44, cy + h * 0.16, 14 * s, 18 * s, pal.body, 3);
    }
  }

  if (stage === 1) {
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(-w * 0.56 - 3, -h * 0.36 - 3, w * 1.12 + 6, h * 0.36 + 6, {
      tl: 4,
      tr: 4,
      bl: 26,
      br: 26,
    });
    g.fillStyle(pal.belly, 1);
    g.fillRoundedRect(-w * 0.56, -h * 0.36, w * 1.12, h * 0.36, {
      tl: 2,
      tr: 2,
      bl: 24,
      br: 24,
    });
    g.fillStyle(pal.belly, 1);
    for (let i = 0; i < 5; i++) {
      const px = -w * 0.56 + (i + 0.5) * ((w * 1.12) / 5);
      g.fillTriangle(px - w * 0.11, -h * 0.36 + 1, px + w * 0.11, -h * 0.36 + 1, px, -h * 0.36 - 9);
    }
    g.fillStyle(pal.body, 1);
    g.fillCircle(-w * 0.2, -h * 0.16, 5);
    g.fillCircle(w * 0.24, -h * 0.2, 4);
  }

  if (stage >= 3) {
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(-w * 0.36 - 3, cy + h * 0.2 - 3, w * 0.72 + 6, 14 * s + 6, 8);
    g.fillStyle(0xe0484d, 1);
    g.fillRoundedRect(-w * 0.36, cy + h * 0.2, w * 0.72, 14 * s, 6);
    g.fillRoundedRect(w * 0.12, cy + h * 0.2 + 8 * s, 12 * s, 20 * s, 4);
  }

  if (stage >= 4) {
    const my = cy + h * 0.36;
    g.fillStyle(PALETTE.ink, 1);
    g.fillCircle(0, my, 11 * s);
    g.fillStyle(PALETTE.sun, 1);
    g.fillCircle(0, my, 8.5 * s);
  }

  if (stage >= 5) {
    const ty = cy - h * 0.5 - 2;
    g.fillStyle(PALETTE.sun, 1);
    g.lineStyle(3, PALETTE.ink, 1);
    g.beginPath();
    g.moveTo(-20 * s, ty);
    g.lineTo(-24 * s, ty - 22 * s);
    g.lineTo(-10 * s, ty - 10 * s);
    g.lineTo(0, ty - 28 * s);
    g.lineTo(10 * s, ty - 10 * s);
    g.lineTo(24 * s, ty - 22 * s);
    g.lineTo(20 * s, ty);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.fillStyle(0xe0484d, 1);
    g.fillCircle(0, ty - 8 * s, 4 * s);
  }
}

export function drawPetVector(
  g: Phaser.GameObjects.Graphics,
  kind: number,
  stage: number,
  opts: { crack?: number; happy?: boolean } = {},
): void {
  if (stage <= 0) drawEgg(g, kind, opts.crack ?? 0);
  else drawCreature(g, kind, Math.min(5, stage), opts.happy ?? true);
}

export class PetView extends Phaser.GameObjects.Container {
  kind: number;
  stage: number;
  private g: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  private idle?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    kind: number,
    stage: number,
    scale = 1,
    opts: { crack?: number; happy?: boolean } = {},
  ) {
    super(scene, x, y);
    this.kind = kind;
    this.stage = stage;

    const key = uiArtKey(`pet-${PET_KEYS[kind]}-${Math.max(0, Math.min(5, stage))}`);
    if (key) {
      const sz =
        stage <= 0 ? 92 : 88 * PET_STAGE_SCALES[Math.min(5, stage)] + (stage >= 5 ? 62 : stage >= 3 ? 44 : 34);
      this.g = scene.add.image(0, 6, key).setOrigin(0.5, 1).setDisplaySize(sz, sz);
      const shadow = scene.add.graphics();
      shadow.fillStyle(PALETTE.shadow, 0.2);
      shadow.fillEllipse(0, 0, sz * 0.6, 12);
      this.add(shadow);
    } else {
      const gfx = scene.add.graphics();
      drawPetVector(gfx, kind, stage, opts);
      this.g = gfx;
    }
    this.add(this.g);

    const baseScale = { x: this.g.scaleX, y: this.g.scaleY };
    this.setScale(scale);

    if (stage <= 0) {
      this.idle = scene.tweens.add({
        targets: this.g,
        angle: { from: -5, to: 5 },
        duration: 160,
        yoyo: true,
        repeat: 3,
        repeatDelay: 0,
        loop: -1,
        loopDelay: opts.crack ? 700 : 1800,
        ease: 'Sine.easeInOut',
      });
    } else {
      this.idle = scene.tweens.add({
        targets: this.g,
        scaleY: baseScale.y * 1.04,
        scaleX: baseScale.x * 0.98,
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      if (stage >= 5 && !key) {
        for (const [sx, sy, delay] of [
          [-52, -90, 0],
          [56, -60, 300],
          [-44, -30, 600],
        ]) {
          const st = scene.add.star(sx, sy, 4, 3, 9, 0xffffff).setStrokeStyle(2, 0xe0a41c);
          this.add(st);
          scene.tweens.add({
            targets: st,
            scale: 0.2,
            angle: 90,
            duration: 520,
            delay,
            yoyo: true,
            repeat: -1,
          });
        }
      }
    }

    scene.add.existing(this);
  }

  cheer(height = 26): void {
    if (!this.active || this.scene.tweens.isTweening(this)) return;
    const baseY = this.y;
    this.scene.tweens.add({
      targets: this,
      y: baseY - height,
      duration: 150,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (this.active) this.setY(baseY);
      },
    });
  }

  flinch(): void {
    if (!this.active || this.scene.tweens.isTweening(this)) return;
    const baseX = this.x;
    this.scene.tweens.add({
      targets: this,
      x: baseX - 6,
      duration: 50,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        if (this.active) this.setX(baseX);
      },
    });
  }

  override destroy(fromScene?: boolean): void {
    this.idle?.stop();
    super.destroy(fromScene);
  }
}
