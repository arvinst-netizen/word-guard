import Phaser from 'phaser';
import { PALETTE } from '../theme';
import { uiArtKey } from '../ui-art';

export function makeCastle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale: number,
  tier: number,
): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
  const key = uiArtKey('castle-' + tier);
  if (key) {
    const size = (tier >= 3 ? 176 : tier >= 2 ? 164 : 150) * scale;
    return scene.add.image(x, y + 4 * scale, key).setDisplaySize(size, size);
  }
  const g = scene.add.graphics();
  drawCastleVector(g, x, y, scale, tier);
  return g;
}

export function drawCastleVector(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  scale: number,
  tier: number,
): void {
  const w = 96 * scale;
  const h = 70 * scale;
  const stone = tier >= 2;
  const wallColor = stone ? 0xe3e1da : 0xfff0d0;
  const roofColor = tier >= 4 ? PALETTE.sun : tier >= 2 ? 0x5b8def : PALETTE.carrot;

  if (tier >= 3) {
    for (const side of [-1, 1]) {
      const tx = x + side * (w / 2 + 14 * scale);
      const tw = 30 * scale;
      const th = 92 * scale;
      const ty = y + h - th;
      g.fillStyle(PALETTE.ink, 1);
      g.fillRoundedRect(tx - tw / 2 - 4, ty - 4, tw + 8, th + 8, 6);
      g.fillStyle(wallColor, 1);
      g.fillRoundedRect(tx - tw / 2, ty, tw, th, 4);
      g.fillStyle(PALETTE.ink, 1);
      for (let i = -1; i <= 1; i++) g.fillRect(tx + i * 11 * scale - 5 * scale, ty - 12 * scale, 10 * scale, 12 * scale);
      g.fillStyle(wallColor, 1);
      for (let i = -1; i <= 1; i++) g.fillRect(tx + i * 11 * scale - 3 * scale, ty - 9 * scale, 6 * scale, 10 * scale);
      g.fillStyle(PALETTE.inkSoft, 1);
      g.fillRoundedRect(tx - 5 * scale, ty + 22 * scale, 10 * scale, 18 * scale, 4 * scale);
    }
  }

  g.fillStyle(PALETTE.ink, 1);
  g.fillRoundedRect(x - w / 2 - 4, y - 4, w + 8, h + 8, 8);
  g.fillStyle(wallColor, 1);
  g.fillRoundedRect(x - w / 2, y, w, h, 6);

  if (stone) {
    g.lineStyle(2, 0xb9b4aa, 1);
    for (let r = 1; r < 4; r++) {
      g.lineBetween(x - w / 2 + 4, y + (h * r) / 4, x + w / 2 - 4, y + (h * r) / 4);
    }
    for (let r = 0; r < 4; r++) {
      for (let c = 1; c < 4; c++) {
        const bx = x - w / 2 + (w * c) / 4 + (r % 2 ? w / 8 : 0) - (r % 2 && c === 3 ? w / 4 : 0);
        g.lineBetween(bx, y + (h * r) / 4 + 3, bx, y + (h * (r + 1)) / 4 - 3);
      }
    }
  }

  g.fillStyle(PALETTE.ink, 1);
  g.fillTriangle(x - w / 2 - 16 * scale, y + 4, x + w / 2 + 16 * scale, y + 4, x, y - 54 * scale);
  g.fillStyle(roofColor, 1);
  g.fillTriangle(x - w / 2 - 8 * scale, y, x + w / 2 + 8 * scale, y, x, y - 46 * scale);

  if (tier >= 4) {
    g.fillStyle(0xffffff, 0.45);
    g.fillTriangle(x - w / 2 + 6 * scale, y - 4 * scale, x - 10 * scale, y - 4 * scale, x - 6 * scale, y - 34 * scale);
  }

  g.fillStyle(PALETTE.inkSoft, 1);
  g.fillRoundedRect(x - 14 * scale, y + h - 40 * scale, 28 * scale, 40 * scale, {
    tl: 12 * scale,
    tr: 12 * scale,
    bl: 0,
    br: 0,
  });

  g.fillStyle(0x9fd8ff, 1);
  g.fillRect(x + 22 * scale, y + 16 * scale, 18 * scale, 16 * scale);
  g.fillRect(x - 40 * scale, y + 16 * scale, 18 * scale, 16 * scale);

  if (tier >= 1) {
    const fx = x + w / 2 - 6 * scale;
    const fy = y - 14 * scale;
    g.lineStyle(4 * scale, PALETTE.ink, 1);
    g.lineBetween(fx, fy, fx, fy - 44 * scale);
    g.fillStyle(PALETTE.ink, 1);
    g.fillTriangle(fx, fy - 46 * scale, fx + 26 * scale, fy - 36 * scale, fx, fy - 24 * scale);
    g.fillStyle(tier >= 4 ? PALETTE.sun : PALETTE.bad, 1);
    g.fillTriangle(fx + 2 * scale, fy - 42 * scale, fx + 20 * scale, fy - 36 * scale, fx + 2 * scale, fy - 28 * scale);
  }

  g.fillStyle(PALETTE.sun, 1);
  g.fillCircle(x, y - 46 * scale, 12 * scale);
  g.lineStyle(3, PALETTE.ink, 1);
  g.strokeCircle(x, y - 46 * scale, 12 * scale);
}
