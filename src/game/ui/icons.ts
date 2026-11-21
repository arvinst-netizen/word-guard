import Phaser from 'phaser';
import { PALETTE } from '../theme';
import { uiArtKey } from '../ui-art';

export type IconName =
  | 'chest'
  | 'fire'
  | 'tasks'
  | 'castle'
  | 'bow'
  | 'gift'
  | 'lock'
  | 'crown'
  | 'pencil'
  | 'boss'
  | 'bolt'
  | 'snow'
  | 'star'
  | 'check'
  | 'cross'
  | 'play'
  | 'arrow';

export function drawVectorIcon(
  g: Phaser.GameObjects.Graphics,
  name: IconName,
  cx: number,
  cy: number,
  size: number,
  color?: number,
): void {
  const s = size / 24;
  const pt = (x: number, y: number): [number, number] => [cx + x * s, cy + y * s];
  const ink = PALETTE.ink;
  const lw = Math.max(1.5, 2 * s);

  const poly = (pts: [number, number][], fill: number, stroke = true) => {
    g.fillStyle(fill, 1);
    g.beginPath();
    pts.forEach(([x, y], i) => {
      const [px, py] = pt(x, y);
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    });
    g.closePath();
    g.fillPath();
    if (stroke) {
      g.lineStyle(lw, ink, 1);
      g.strokePath();
    }
  };

  const circ = (x: number, y: number, r: number, fill: number, stroke = true) => {
    const [px, py] = pt(x, y);
    g.fillStyle(fill, 1);
    g.fillCircle(px, py, r * s);
    if (stroke) {
      g.lineStyle(lw, ink, 1);
      g.strokeCircle(px, py, r * s);
    }
  };

  const rect = (x: number, y: number, w: number, h: number, r: number, fill: number, stroke = true) => {
    g.fillStyle(fill, 1);
    g.fillRoundedRect(cx + x * s, cy + y * s, w * s, h * s, r * s);
    if (stroke) {
      g.lineStyle(lw, ink, 1);
      g.strokeRoundedRect(cx + x * s, cy + y * s, w * s, h * s, r * s);
    }
  };

  const line = (x1: number, y1: number, x2: number, y2: number, col: number, width = 3) => {
    const [px1, py1] = pt(x1, y1);
    const [px2, py2] = pt(x2, y2);
    g.lineStyle(width * s, col, 1);
    g.lineBetween(px1, py1, px2, py2);
  };

  switch (name) {
    case 'chest':
      rect(-10, -2, 20, 12, 2, color ?? 0xb9783d);
      rect(-10, -9, 20, 8, 4, 0xd89955);
      rect(-2, -4, 4, 6, 1, PALETTE.sun);
      break;
    case 'fire':
      poly(
        [
          [0, -11],
          [5, -4],
          [8, -6],
          [9, 3],
          [5, 10],
          [-5, 10],
          [-9, 3],
          [-6, -3],
          [-3, -1],
        ],
        color ?? 0xff7a2f,
      );
      poly(
        [
          [0, -2],
          [4, 4],
          [2, 9],
          [-2, 9],
          [-4, 4],
        ],
        0xffd34d,
        false,
      );
      break;
    case 'tasks':
      rect(-8, -9, 16, 20, 3, 0xffffff);
      rect(-4, -12, 8, 5, 2, color ?? PALETTE.carrot);
      line(-4, -1, 4, -1, PALETTE.inkSoft, 2);
      line(-4, 4, 4, 4, PALETTE.inkSoft, 2);
      break;
    case 'castle':
      rect(-9, -2, 18, 12, 1, color ?? 0xd9dcde);
      poly(
        [
          [-9, -2],
          [-9, -9],
          [-5, -9],
          [-5, -5],
          [-2, -5],
          [-2, -9],
          [2, -9],
          [2, -5],
          [5, -5],
          [5, -9],
          [9, -9],
          [9, -2],
        ],
        color ?? 0xd9dcde,
      );
      rect(-3, 2, 6, 8, 3, PALETTE.soilDark);
      break;
    case 'bow':
      poly(
        [
          [0, 0],
          [-10, -7],
          [-10, 7],
        ],
        color ?? 0xff5d8f,
      );
      poly(
        [
          [0, 0],
          [10, -7],
          [10, 7],
        ],
        color ?? 0xff5d8f,
      );
      circ(0, 0, 3.5, 0xff8fb3);
      break;
    case 'gift':
      rect(-9, -3, 18, 13, 2, color ?? 0xe0484d);
      rect(-10, -7, 20, 5, 2, 0xff7a7f);
      rect(-2, -7, 4, 17, 0, PALETTE.sun);
      poly(
        [
          [0, -7],
          [-6, -12],
          [-7, -8],
        ],
        PALETTE.sun,
      );
      poly(
        [
          [0, -7],
          [6, -12],
          [7, -8],
        ],
        PALETTE.sun,
      );
      break;
    case 'lock': {
      const [lx, ly] = pt(0, -3);
      g.lineStyle(3.5 * s, color ?? PALETTE.inkSoft, 1);
      g.beginPath();
      g.arc(lx, ly, 5.5 * s, Math.PI, 0);
      g.strokePath();
      rect(-8, -3, 16, 13, 3, color ?? PALETTE.inkSoft, false);
      circ(0, 3, 2.2, 0xffffff, false);
      break;
    }
    case 'crown':
      poly(
        [
          [-10, 8],
          [-11, -6],
          [-5, 1],
          [0, -10],
          [5, 1],
          [11, -6],
          [10, 8],
        ],
        color ?? PALETTE.sun,
      );
      circ(0, 3, 2, 0xe0484d, false);
      break;
    case 'pencil':
      poly(
        [
          [-10, 10],
          [-8, 3],
          [5, -10],
          [10, -5],
          [-3, 8],
        ],
        color ?? PALETTE.sun,
      );
      poly(
        [
          [-10, 10],
          [-8, 3],
          [-3, 8],
        ],
        0xfff4dc,
      );
      poly(
        [
          [5, -10],
          [8, -13],
          [13, -8],
          [10, -5],
        ],
        0xff8fa3,
      );
      break;
    case 'boss':
      poly(
        [
          [-9, -4],
          [-11, -12],
          [-4, -8],
        ],
        color ?? 0x7b5be9,
      );
      poly(
        [
          [9, -4],
          [11, -12],
          [4, -8],
        ],
        color ?? 0x7b5be9,
      );
      circ(0, 1, 10, color ?? 0x7b5be9);
      circ(-4, -1, 2.6, 0xffffff, false);
      circ(4, -1, 2.6, 0xffffff, false);
      circ(-4, -0.5, 1.2, ink, false);
      circ(4, -0.5, 1.2, ink, false);
      line(-7, -5, -2, -3, ink, 2);
      line(7, -5, 2, -3, ink, 2);
      poly(
        [
          [-4, 5],
          [4, 5],
          [2, 8],
          [0, 6],
          [-2, 8],
        ],
        0xffffff,
        false,
      );
      break;
    case 'bolt':
      poly(
        [
          [3, -12],
          [-8, 2],
          [-1, 2],
          [-4, 12],
          [8, -3],
          [1, -3],
        ],
        color ?? PALETTE.sun,
      );
      break;
    case 'snow': {
      const col = color ?? 0xffffff;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        const dx = Math.cos(a) * 10;
        const dy = Math.sin(a) * 10;
        line(-dx, -dy, dx, dy, col, 2.6);
        for (const dir of [-1, 1]) {
          const bx = dx * 0.62 * dir;
          const by = dy * 0.62 * dir;
          for (const side of [-1, 1]) {
            const ba = a + (dir > 0 ? 0 : Math.PI) + side * 0.8;
            line(bx, by, bx + Math.cos(ba) * 3.6, by + Math.sin(ba) * 3.6, col, 2);
          }
        }
      }
      break;
    }
    case 'star': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 11 : 4.8;
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      poly(pts, color ?? PALETTE.sun);
      break;
    }
    case 'check': {
      const [x1, y1] = pt(-7, 0);
      const [x2, y2] = pt(-2, 6);
      const [x3, y3] = pt(8, -6);
      g.lineStyle(4 * s, color ?? 0xffffff, 1);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.lineTo(x3, y3);
      g.strokePath();
      break;
    }
    case 'cross':
      line(-7, -7, 7, 7, color ?? PALETTE.bad, 4);
      line(7, -7, -7, 7, color ?? PALETTE.bad, 4);
      break;
    case 'play':
      poly(
        [
          [-7, -10],
          [10, 0],
          [-7, 10],
        ],
        color ?? 0xffffff,
      );
      break;
    case 'arrow':
      poly(
        [
          [-11, -3],
          [2, -3],
          [2, -9],
          [12, 0],
          [2, 9],
          [2, 3],
          [-11, 3],
        ],
        color ?? PALETTE.inkSoft,
        false,
      );
      break;
  }
}

export function makeIcon(
  scene: Phaser.Scene,
  name: IconName,
  x: number,
  y: number,
  size: number,
  color?: number,
): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
  const key = color === undefined ? uiArtKey('icon-' + name) : null;
  if (key) {
    return scene.add.image(x, y, key).setDisplaySize(size * 1.12, size * 1.12);
  }
  const g = scene.add.graphics();
  drawVectorIcon(g, name, 0, 0, size, color);
  return g.setPosition(x, y);
}
