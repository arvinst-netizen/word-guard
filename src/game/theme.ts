import Phaser from 'phaser';

export const PALETTE = {
  skyTop: 0xc9f0ee,
  skyBottom: 0xf3fde6,
  grassA: 0x9fd36a,
  grassB: 0x8fc85c,
  grassEdge: 0x77b24a,
  soil: 0xe2c39a,
  soilDark: 0xc7a272,
  ink: 0x4a2f1b,
  inkSoft: 0x7a5940,
  board: 0xfff5dc,
  boardShade: 0xf1dfb8,
  carrot: 0xff883d,
  carrotDark: 0xd9631f,
  good: 0x2fa866,
  bad: 0xe0484d,
  sun: 0xffd14d,
  white: 0xffffff,
  shadow: 0x2c4a1c,
  monster: [0xb69bf7, 0xff8d86, 0x5fcfa2, 0xf6c045],
  monsterDark: [0x7f62c9, 0xd25c5a, 0x2f9f72, 0xc9921a],
} as const;

export const hex = (color: number): string => '#' + color.toString(16).padStart(6, '0');

export const FONT_EN = '"Baloo 2", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
export const FONT_CN = '"ZCOOL KuaiLe", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
export const FONT_MIX = '"Baloo 2", "ZCOOL KuaiLe", "PingFang SC", "Microsoft YaHei", sans-serif';
export const FONT_PLAIN = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';
export const FONT_EN_PLAIN = '"Baloo 2", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';
export const FONT_EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

let dprScale = 1;

export function setRenderScale(scale: number): void {
  dprScale = scale;
}

export function textStyle(
  size: number,
  color: number = PALETTE.ink,
  family: string = FONT_MIX,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: family,
    fontSize: `${size}px`,
    color: hex(color),
    fontStyle: family === FONT_EN ? 'bold' : '',
    resolution: dprScale,
    padding: { x: 2, y: Math.ceil(size * 0.15) },
    ...extra,
  };
}

export function setupCamera(scene: Phaser.Scene): void {
  const cam = scene.cameras.main;
  cam.setZoom(dprScale);
  cam.centerOn(viewW(scene) / 2, viewH(scene) / 2);
}

export function viewW(scene: Phaser.Scene): number {
  return scene.scale.width / dprScale;
}

export function viewH(scene: Phaser.Scene): number {
  return scene.scale.height / dprScale;
}

export function isPortrait(scene: Phaser.Scene): boolean {
  return viewH(scene) > viewW(scene);
}

export interface FieldTheme {
  id: string;
  name: string;
  skyTop: number;
  skyBottom: number;
  hill: number;
  a: number;
  b: number;
  edge: number;
  deco: 'grass' | 'mushroom' | 'shell' | 'snow' | 'flower';
}

export const FIELD_THEMES: readonly FieldTheme[] = [
  {
    id: 'meadow',
    name: '草地',
    skyTop: PALETTE.skyTop,
    skyBottom: PALETTE.skyBottom,
    hill: 0xb8e2a0,
    a: PALETTE.grassA,
    b: PALETTE.grassB,
    edge: PALETTE.grassEdge,
    deco: 'grass',
  },
  {
    id: 'forest',
    name: '森林',
    skyTop: 0xcdebd6,
    skyBottom: 0xeef8e0,
    hill: 0x7fbc7a,
    a: 0x79c06a,
    b: 0x69b35c,
    edge: 0x4f9648,
    deco: 'mushroom',
  },
  {
    id: 'beach',
    name: '沙滩',
    skyTop: 0xbfe8f7,
    skyBottom: 0xfdf8e0,
    hill: 0x8fd6c8,
    a: 0xf3e2a6,
    b: 0xecd592,
    edge: 0xcfb16a,
    deco: 'shell',
  },
  {
    id: 'snow',
    name: '雪地',
    skyTop: 0xd6e8f8,
    skyBottom: 0xf6fbff,
    hill: 0xdcebf7,
    a: 0xf2f8fd,
    b: 0xe3f0f8,
    edge: 0xb9d3e6,
    deco: 'snow',
  },
  {
    id: 'dusk',
    name: '傍晚',
    skyTop: 0xffd7b8,
    skyBottom: 0xffefd6,
    hill: 0xe9b59a,
    a: 0xb9d17e,
    b: 0xa9c370,
    edge: 0x86a24a,
    deco: 'flower',
  },
];

export function drawBackdrop(
  scene: Phaser.Scene,
  opts: { sky?: boolean; theme?: FieldTheme } = {},
): Phaser.GameObjects.Graphics {
  const w = viewW(scene);
  const h = viewH(scene);
  const g = scene.add.graphics();
  const th = opts.theme ?? FIELD_THEMES[0];
  g.fillGradientStyle(th.skyTop, th.skyTop, th.skyBottom, th.skyBottom, 1);
  g.fillRect(0, 0, w, h);
  g.fillStyle(th.hill, 1);
  for (let i = 0; i < 6; i++) {
    g.fillEllipse((i / 5) * w, h * 0.36, w * 0.36, h * 0.22);
  }
  if (opts.sky === false) return g;
  g.fillStyle(PALETTE.sun, 0.9);
  g.fillCircle(w * 0.88, h * 0.1, 34);
  g.fillStyle(PALETTE.sun, 0.25);
  g.fillCircle(w * 0.88, h * 0.1, 52);
  const cloud = (cx: number, cy: number, s: number) => {
    g.fillStyle(0xffffff, 0.85);
    g.fillEllipse(cx, cy, 90 * s, 34 * s);
    g.fillEllipse(cx - 26 * s, cy + 6 * s, 54 * s, 26 * s);
    g.fillEllipse(cx + 30 * s, cy + 6 * s, 60 * s, 26 * s);
  };
  cloud(w * 0.18, h * 0.09, 1);
  cloud(w * 0.55, h * 0.06, 0.8);
  return g;
}

export function drawBoard(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 18,
  fill: number = PALETTE.board,
): void {
  g.fillStyle(PALETTE.shadow, 0.18);
  g.fillRoundedRect(x + 3, y + 6, w, h, radius);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(4, PALETTE.ink, 1);
  g.strokeRoundedRect(x, y, w, h, radius);
}
