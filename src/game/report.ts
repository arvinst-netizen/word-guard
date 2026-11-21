import { continueTarget } from '../core/progress';
import { rankForXp } from '../core/rewards';
import { computeWeekReport } from '../core/stats';
import { track } from './analytics';
import { ctx } from './context';
import { isDialogOpen } from './ui/dialog';

const W = 750;
const H = 1120;
const INK = '#4a2f1b';
const SOFT = '#7a5a40';
const FONT_CN = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
const FONT_NUM = '"Baloo 2","Arial Rounded MT Bold","Trebuchet MS",sans-serif';

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function renderWeekReportDataUrl(): string {
  const engine = ctx().engine;
  const now = ctx().platform.now();
  const report = computeWeekReport(engine, now);
  const rank = rankForXp(engine.xp);
  const next = continueTarget(engine, now);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;

  const drawText = (
    text: string,
    x: number,
    y: number,
    size: number,
    color = INK,
    font = FONT_CN,
    align: CanvasTextAlign = 'left',
    weight = 600,
  ) => {
    c.font = `${weight} ${size}px ${font}`;
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = 'middle';
    c.fillText(text, x, y);
  };

  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#c9f0ee');
  bg.addColorStop(0.35, '#f3fbe6');
  bg.addColorStop(1, '#fff4dc');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);

  drawText('单词守卫 · 本周学习小结', W / 2, 70, 44, INK, FONT_CN, 'center', 800);
  drawText(`${report.from} 至 ${report.to}`, W / 2, 122, 26, SOFT, FONT_NUM, 'center');

  const cards: [string, string, string][] = [
    [`${report.activeDays}`, '/ 7 天', '学习天数'],
    [`${report.minutes}`, '分钟', '学习时长'],
    [`${report.wordsPracticed}`, '个词', report.wordsNew > 0 ? `练过的词（新学 ${report.wordsNew}）` : '练过的词'],
    [report.accuracy === null ? '-' : `${Math.round(report.accuracy * 100)}`, report.accuracy === null ? '' : '%', '一次答对率'],
  ];

  cards.forEach(([num, unit, label], i) => {
    const x = 40 + (i % 2) * 345;
    const y = 170 + Math.floor(i / 2) * 160;
    c.fillStyle = INK;
    roundRect(c, x - 3, y - 3, 331, 146, 24);
    c.fill();
    c.fillStyle = '#ffffff';
    roundRect(c, x, y, 325, 140, 22);
    c.fill();
    c.font = `800 68px ${FONT_NUM}`;
    const numW = c.measureText(num).width;
    drawText(num, x + 28, y + 58, 68, '#d9661f', FONT_NUM, 'left', 800);
    drawText(unit, x + 38 + numW, y + 70, 26, SOFT);
    drawText(label, x + 28, y + 112, 24, SOFT);
  });

  drawText('每天学了多久（分钟）', 44, 520, 28);
  const maxMin = Math.max(10, ...report.days.map((d) => d.minutes));
  const colW = 662 / report.days.length;
  report.days.forEach((d, i) => {
    const cx = 44 + colW * i + colW / 2;
    const barH = d.minutes > 0 ? Math.max(8, (d.minutes / maxMin) * 120) : 4;
    c.fillStyle = d.minutes > 0 ? '#ff8a3d' : '#e6dccb';
    roundRect(c, cx - 26, 710 - barH, 52, barH, Math.min(10, barH / 2));
    c.fill();
    if (d.minutes > 0) drawText(String(d.minutes), cx, 710 - barH - 18, 24, INK, FONT_NUM, 'center', 700);
    drawText(d.date, cx, 734, 20, SOFT, FONT_NUM, 'center', 500);
  });

  c.fillStyle = '#fff';
  roundRect(c, 40, 750, 670, 80, 20);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 3;
  roundRect(c, 40, 750, 670, 80, 20);
  c.stroke();
  drawText(
    `到现在：认得 ${report.known} 个词 · 会拼 ${report.spellable} 个 · 段位「${rank.title}」`,
    W / 2,
    790,
    26,
    INK,
    FONT_CN,
    'center',
  );

  drawText(
    report.weak.length ? '这周还不太熟的词（可以考考孩子）' : '这周没有特别容易错的词，很棒',
    44,
    880,
    28,
  );

  report.weak.forEach((w, i) => {
    const x = 44 + (i % 2) * 335;
    const y = 932 + Math.floor(i / 2) * 44;
    c.font = `700 28px ${FONT_NUM}`;
    const enW = Math.min(170, c.measureText(w.en).width);
    c.save();
    roundRect(c, x, y - 22, 320, 44, 0);
    c.clip();
    drawText(w.en, x, y, 28, INK, FONT_NUM, 'left', 700);
    drawText(w.zh, x + enW + 14, y, 24, SOFT);
    c.restore();
  });

  if (next) {
    drawText(`接下来：${next.review ? '今日复习' : next.level.title}`, W / 2, 1040, 24, SOFT, FONT_CN, 'center');
  }
  drawText('单词守卫 · 每天十分钟，守住学过的词', W / 2, 1086, 22, '#b7a88c', FONT_CN, 'center', 500);

  return canvas.toDataURL('image/png');
}

let reportOpen = false;

export function openWeekReportModal(): void {
  if (reportOpen || isDialogOpen()) return;
  reportOpen = true;
  track('week_report');

  const url = renderWeekReportDataUrl();
  const shade = document.createElement('div');
  shade.style.cssText =
    'position:fixed;inset:0;z-index:1000;background:rgba(58,40,24,.6);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:12px;box-sizing:border-box;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;';

  const img = document.createElement('img');
  img.src = url;
  img.alt = '本周学习小结';
  img.style.cssText =
    'max-width:100%;max-height:calc(100% - 110px);border-radius:16px;border:4px solid #4a3426;box-shadow:0 8px 24px rgba(0,0,0,.3);-webkit-touch-callout:default;user-select:auto;';

  const hint = document.createElement('div');
  hint.textContent = '长按图片可以保存或转发';
  hint.style.cssText = 'color:#fff;font-size:15px;';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;';

  const makeBtn = (label: string, primary: boolean) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `font-size:17px;padding:10px 20px;border-radius:12px;border:3px solid #4a3426;cursor:pointer;background:${primary ? '#f08a3c' : '#fff'};color:${primary ? '#fff' : '#4a3426'};font-weight:600;`;
    return b;
  };

  const close = () => {
    reportOpen = false;
    shade.remove();
  };

  const shareBtn = makeBtn('保存 / 分享', true);
  shareBtn.onclick = async () => {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], '单词守卫-本周小结.png', { type: 'image/png' });
      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean;
        share?: (data: { files: File[]; title: string }) => Promise<void>;
      };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share?.({ files: [file], title: '单词守卫 · 本周学习小结' });
        return;
      }
      const link = document.createElement('a');
      link.href = url;
      link.download = '单词守卫-本周小结.png';
      link.click();
    } catch {
      hint.textContent = '没保存成功，请长按图片保存';
    }
  };

  const closeBtn = makeBtn('关闭', false);
  closeBtn.onclick = close;

  row.append(shareBtn, closeBtn);
  shade.append(img, hint, row);
  for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click']) {
    shade.addEventListener(ev, (e) => e.stopPropagation());
  }
  document.body.appendChild(shade);
}
