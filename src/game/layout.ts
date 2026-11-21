export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BattleLayout {
  portrait: boolean;
  W: number;
  H: number;
  top: Rect;
  field: Rect;
  base: Rect;
  panel: Rect;
  monsterScale: number;
  pos: (lane: number, progress: number) => { x: number; y: number };
  launcher: { x: number; y: number };
}

export function computeLayout(W: number, H: number): BattleLayout {
  const portrait = H > W;
  if (!portrait) {
    const top: Rect = { x: 0, y: 0, w: W, h: 78 };
    const field: Rect = { x: 200, y: 92, w: W - 200 - 20, h: 462 };
    const base: Rect = { x: 0, y: field.y, w: 200, h: field.h };
    const panel: Rect = { x: 16, y: 572, w: W - 32, h: H - 572 - 10 };
    const laneH = field.h / 4;
    const xRight = field.x + field.w - 50;
    const xLeft = field.x + 10;
    return {
      portrait,
      W,
      H,
      top,
      field,
      base,
      panel,
      monsterScale: 0.86,
      pos: (lane, progress) => ({
        x: xLeft + progress * (xRight - xLeft),
        y: field.y + laneH * (lane + 0.5) + 4,
      }),
      launcher: { x: 120, y: field.y + field.h / 2 - 40 },
    };
  }

  const top: Rect = { x: 0, y: 0, w: W, h: 92 };
  const field: Rect = { x: 0, y: 108, w: W, h: H - 580 };
  const base: Rect = { x: 0, y: field.y + field.h, w: W, h: 104 };
  const panel: Rect = { x: 16, y: base.y + base.h + 14, w: W - 32, h: H - (base.y + base.h + 14) - 16 };
  const laneW = W / 4;
  const yTop = field.y + 80;
  const yBot = field.y + field.h - 30;
  return {
    portrait,
    W,
    H,
    top,
    field,
    base,
    panel,
    monsterScale: 1.08,
    pos: (lane, progress) => ({
      x: laneW * (lane + 0.5),
      y: yBot - progress * (yBot - yTop),
    }),
    launcher: { x: W / 2, y: base.y + base.h / 2 },
  };
}
