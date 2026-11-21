import Phaser from 'phaser';
import { ctx } from '../context';
import { addPicture } from '../pictures';
import { PALETTE, textStyle } from '../theme';
import { makeIcon, type IconName } from './icons';

export interface ButtonOptions {
  fill?: number;
  textColor?: number;
  fontSize?: number;
  family?: string;
  radius?: number;
  disabled?: boolean;
  icon?: IconName;
}

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  opts: ButtonOptions = {},
): Phaser.GameObjects.Container {
  const fill = opts.fill ?? PALETTE.carrot;
  const radius = opts.radius ?? Math.min(22, h / 2);
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();

  const text = scene.add
    .text(0, 0, label, textStyle(opts.fontSize ?? 30, opts.textColor ?? PALETTE.white, opts.family))
    .setOrigin(0.5);

  const iconSize = opts.icon ? Math.min(h - 18, (opts.fontSize ?? 30) * 1.25) : 0;
  const maxTextW = w - 24 - (iconSize ? iconSize + 6 : 0);
  if (text.width > maxTextW) text.setScale(maxTextW / text.width);

  c.add([g, text]);

  let iconObj: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics | undefined;
  if (opts.icon) {
    const totalW = iconSize + 6 + text.displayWidth;
    text.setX(-totalW / 2 + iconSize + 6 + text.displayWidth / 2);
    iconObj = makeIcon(scene, opts.icon, -totalW / 2 + iconSize / 2, 0, iconSize);
    c.add(iconObj);
  }

  const draw = (pressed: boolean) => {
    g.clear();
    const dy = pressed ? 4 : 0;
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, radius);
    g.fillStyle(opts.disabled ? 0xd9cdb0 : fill, 1);
    g.fillRoundedRect(-w / 2, -h / 2 + dy, w, h, radius);
    g.lineStyle(4, PALETTE.ink, 1);
    g.strokeRoundedRect(-w / 2, -h / 2 + dy, w, h, radius);
    g.fillStyle(0xffffff, opts.disabled ? 0.1 : 0.28);
    g.fillRoundedRect(-w / 2 + 10, -h / 2 + dy + 7, w - 20, Math.max(6, h * 0.18), Math.max(3, radius / 2));
    text.setY(dy);
    iconObj?.setY(dy);
  };

  draw(false);
  c.setSize(w, h + 6);

  if (!opts.disabled) {
    let down = false;
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => {
      down = true;
      draw(true);
      ctx().platform.sfx.play('tap');
    });
    c.on('pointerout', () => {
      down = false;
      draw(false);
    });
    c.on('pointerup', () => {
      draw(false);
      if (down) onClick();
      down = false;
    });
  }
  return c;
}

export function drawSpeakerIcon(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  scale: number,
  color = PALETTE.ink,
): void {
  g.fillStyle(color, 1);
  g.fillRect(x - 14 * scale, y - 8 * scale, 10 * scale, 16 * scale);
  g.fillTriangle(x - 6 * scale, y - 8 * scale, x + 8 * scale, y - 18 * scale, x + 8 * scale, y + 18 * scale);
  g.fillTriangle(x - 6 * scale, y + 8 * scale, x + 8 * scale, y + 18 * scale, x - 6 * scale, y - 8 * scale);
  g.lineStyle(4 * scale, color, 1);
  g.beginPath();
  g.arc(x + 10 * scale, y, 10 * scale, -0.8, 0.8);
  g.strokePath();
  g.beginPath();
  g.arc(x + 10 * scale, y, 19 * scale, -0.8, 0.8);
  g.strokePath();
}

export function makeSpeakerButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  diameter: number,
  onClick: () => void,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const draw = (pressed: boolean) => {
    g.clear();
    const dy = pressed ? 3 : 0;
    g.fillStyle(PALETTE.ink, 1);
    g.fillCircle(0, 5, diameter / 2);
    g.fillStyle(PALETTE.sun, 1);
    g.fillCircle(0, dy, diameter / 2);
    g.lineStyle(4, PALETTE.ink, 1);
    g.strokeCircle(0, dy, diameter / 2);
    drawSpeakerIcon(g, -2, dy, diameter / 64);
  };
  draw(false);
  c.add(g);
  c.setSize(diameter + 10, diameter + 10);
  let down = false;
  c.setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => {
    down = true;
    draw(true);
  });
  c.on('pointerout', () => {
    down = false;
    draw(false);
  });
  c.on('pointerup', () => {
    draw(false);
    if (down) onClick();
    down = false;
  });
  return c;
}

export function drawHeart(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  scale: number,
  fill: boolean | number,
): void {
  const amount = fill === true ? 1 : fill === false ? 0 : fill;
  g.fillStyle(PALETTE.ink, 1);
  g.fillCircle(x - 9 * scale, y - 4 * scale, 11 * scale);
  g.fillCircle(x + 9 * scale, y - 4 * scale, 11 * scale);
  g.fillTriangle(x - 19 * scale, y + 1 * scale, x + 19 * scale, y + 1 * scale, x, y + 22 * scale);

  const innerColor = amount >= 1 ? PALETTE.bad : 0xd9cdb0;
  g.fillStyle(innerColor, 1);
  g.fillCircle(x - 9 * scale, y - 4 * scale, 8 * scale);
  g.fillCircle(x + 9 * scale, y - 4 * scale, 8 * scale);
  g.fillTriangle(x - 16 * scale, y, x + 16 * scale, y, x, y + 18 * scale);

  if (amount > 0 && amount < 1) {
    g.fillStyle(PALETTE.bad, 1);
    g.fillCircle(x - 9 * scale, y - 4 * scale, 8 * scale);
    g.fillTriangle(x - 16 * scale, y, x, y, x, y + 18 * scale);
    g.fillStyle(0xd9cdb0, 1);
    g.fillRect(x, y - 13 * scale, 1.5 * scale, 12 * scale);
  }

  if (amount > 0) {
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(x - 11 * scale, y - 7 * scale, 3 * scale);
  }
}

export function drawStar(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  r: number,
  lit: boolean,
): void {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.48;
    pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * rad, y + Math.sin(a) * rad));
  }
  g.fillStyle(lit ? PALETTE.sun : 0xe8ddc2, 1);
  g.fillPoints(pts, true);
  g.lineStyle(Math.max(2, r * 0.14), PALETTE.ink, 1);
  g.strokePoints(pts, true);
}

export function makePicture(
  scene: Phaser.Scene,
  x: number,
  y: number,
  pic: string,
  size: number,
): Phaser.GameObjects.GameObject {
  return addPicture(scene, x, y, pic, size);
}
