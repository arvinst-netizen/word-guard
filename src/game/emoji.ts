import { FONT_EMOJI } from './theme';

export function makeEmojiUnsupportedChecker(): (emoji: string) => boolean {
  let ctx2d: CanvasRenderingContext2D | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 40;
    ctx2d = canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    ctx2d = null;
  }
  if (!ctx2d) return () => false;

  const c = ctx2d;
  c.font = `28px ${FONT_EMOJI}`;
  c.textBaseline = 'middle';
  c.textAlign = 'center';

  const render = (ch: string, color: string) => {
    c.clearRect(0, 0, 40, 40);
    c.fillStyle = color;
    c.fillText(ch, 20, 20);
    return c.getImageData(0, 0, 40, 40).data;
  };

  const refWidth = c.measureText('😀').width || 28;
  const cache = new Map<string, boolean>();

  return (emoji: string) => {
    const hit = cache.get(emoji);
    if (hit !== undefined) return hit;
    let bad = false;
    try {
      const red = render(emoji, '#f00');
      const blue = render(emoji, '#00f');
      let pixels = 0;
      let changed = 0;
      for (let i = 0; i < red.length; i += 4) {
        if (red[i + 3] > 0) pixels++;
        if (Math.abs(red[i] - blue[i]) > 30 || Math.abs(red[i + 2] - blue[i + 2]) > 30) {
          changed++;
        }
      }
      bad = pixels === 0 || changed > pixels * 0.2 || c.measureText(emoji).width > refWidth * 1.6;
    } catch {
      bad = false;
    }
    cache.set(emoji, bad);
    return bad;
  };
}
