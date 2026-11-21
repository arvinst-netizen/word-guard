import Phaser from 'phaser';
import { getCourse } from '../../core/content/levels';
import { parseLearnerData } from '../../core/learning/engine';
import {
  LIMIT_PRESETS,
  limitStatus,
  makeParentQuiz,
  setDailyLimit,
  setSchoolUnit,
} from '../../core/parent';
import { computeStats, type DayStat, type GroupStat, type StatsSummary } from '../../core/stats';
import { isAnalyticsOff, setAnalyticsOff, track } from '../analytics';
import { exportBackupCode, importBackupCode } from '../backup';
import { ctx } from '../context';
import { openFeedbackDialog } from '../feedback';
import { openWeekReportModal } from '../report';
import { drawBackdrop, drawBoard, FONT_EN, isPortrait, PALETTE, setupCamera, textStyle, viewH, viewW } from '../theme';
import { copyText, isDialogOpen, openTextDialog } from '../ui/dialog';
import { makeButton } from '../ui/widgets';

const fmtPct = (v: number | null): string => (v === null ? '-' : `${Math.round(v * 100)}%`);

export class StatsScene extends Phaser.Scene {
  private parentLayer?: Phaser.GameObjects.Container;

  constructor() {
    super('stats');
  }

  create(data?: { parent?: boolean }): void {
    setupCamera(this);
    const W = viewW(this);
    const H = viewH(this);
    const portrait = isPortrait(this);
    drawBackdrop(this);
    ctx().platform.music.setMood('calm');

    const engine = ctx().engine;
    const stats = computeStats(engine, ctx().platform.now());
    const topY = portrait ? 56 : 44;

    makeButton(this, 70, topY, 108, 52, '返回', () => !isDialogOpen() && this.scene.start('menu'), {
      fill: PALETTE.board,
      textColor: PALETTE.ink,
      fontSize: 22,
    });
    this.add.text(W / 2, topY, '学习记录', textStyle(40)).setOrigin(0.5);

    const limitMins = engine.data.limit?.minutes ?? 0;
    makeButton(
      this,
      W - 96,
      topY,
      168,
      44,
      limitMins ? `家长设置 · ${limitMins}分钟` : '家长设置',
      () => !isDialogOpen() && this.askParent(),
      { fill: PALETTE.board, textColor: PALETTE.ink, fontSize: 18 },
    );

    this.parentLayer = undefined;
    if (data?.parent) this.time.delayedCall(60, () => this.showParent());

    this.add
      .text(
        W / 2,
        topY + (portrait ? 52 : 44),
        `累计 ${stats.totalMinutes} 分钟 · ${stats.totalSessions} 局 · 见过 ${stats.wordsSeen} 个词 · 会了 ${stats.wordsMastered} 个`,
        textStyle(20, PALETTE.inkSoft),
      )
      .setOrigin(0.5);

    const cardW = portrait ? W - 32 : (W - 48) / 2;
    const leftY = topY + (portrait ? 86 : 72);
    const bottomY = H - 60 - 30;
    const cardH = portrait ? (bottomY - leftY - 16) / 2 : bottomY - leftY;
    const rightX = portrait ? 16 : 32 + cardW;
    const rightY = portrait ? leftY + cardH + 16 : leftY;

    const g = this.add.graphics();
    drawBoard(g, 16, leftY, cardW, cardH, 18);
    drawBoard(g, rightX, rightY, cardW, cardH, 18);

    if (stats.totalSessions === 0) {
      this.add
        .text(16 + cardW / 2, leftY + cardH / 2, '还没有记录\n玩几关再来看吧', textStyle(26, PALETTE.inkSoft, undefined, { align: 'center' }))
        .setOrigin(0.5);
    } else {
      this.drawDays(stats.days, 16, leftY, cardW, cardH * 0.5);
      this.drawStages(stats.byStage, 16, leftY + cardH * 0.5, cardW, cardH * 0.5);
    }
    this.drawLists(stats, rightX, rightY, cardW, cardH);

    const btnW = portrait ? 164 : 230;
    const btnY = H - 30 - 16;
    const btnX = (i: number) => W / 2 + (i - 1.5) * (btnW + 10);

    makeButton(this, btnX(0), btnY, btnW, 60, '本周小结', () => !isDialogOpen() && openWeekReportModal(), {
      fontSize: 22,
    });
    makeButton(this, btnX(1), btnY, btnW, 60, portrait ? '反馈' : '反馈问题或需求', () => openFeedbackDialog(), {
      fill: PALETTE.sun,
      textColor: PALETTE.ink,
      fontSize: 21,
    });
    makeButton(
      this,
      btnX(2),
      btnY,
      btnW,
      60,
      '备份进度',
      () => {
        if (isDialogOpen()) return;
        exportBackupCode(engine.data).then((code) =>
          openTextDialog({
            title: '备份进度',
            message:
              '这串文字就是孩子的全部学习进度。复制下来存好（比如发给自己的微信）。换手机、清了浏览器缓存后，在"恢复进度"里粘贴回来。',
            text: code,
            readOnly: true,
            buttons: [
              {
                label: '复制',
                primary: true,
                onClick: async (val, setStatus) => {
                  setStatus((await copyText(val)) ? '已复制，记得存到别处' : '复制失败，请长按文字框手动复制');
                  return false;
                },
              },
            ],
          }),
        );
      },
      { fill: PALETTE.board, textColor: PALETTE.ink, fontSize: 22 },
    );
    makeButton(
      this,
      btnX(3),
      btnY,
      btnW,
      60,
      '恢复进度',
      () => {
        if (isDialogOpen()) return;
        openTextDialog({
          title: '恢复进度',
          message: '把之前备份的文字粘贴到下面。注意：恢复后，这台设备上现在的进度会被替换。',
          readOnly: false,
          placeholder: 'WG1.……',
          buttons: [
            {
              label: '恢复',
              primary: true,
              onClick: async (val, setStatus) => {
                const parsed = await importBackupCode(val);
                if (!parsed || !parseLearnerData(JSON.stringify(parsed))) {
                  setStatus('这串文字不对，请检查是否完整复制');
                  return false;
                }
                engine.data = parsed;
                await ctx().save();
                this.scene.restart();
                return true;
              },
            },
          ],
        });
      },
      { fill: PALETTE.board, textColor: PALETTE.ink, fontSize: 22 },
    );
  }

  private askParent(): void {
    if (!ctx().engine.data.limit) {
      this.showParent();
      return;
    }
    const q = makeParentQuiz(Math.random);
    openTextDialog({
      title: '请家长来答一下',
      message: q.question,
      text: '',
      readOnly: false,
      short: true,
      placeholder: '写答案',
      buttons: [
        {
          label: '确定',
          primary: true,
          onClick: async (val, setStatus) => {
            if (Number(val.trim()) === q.answer) {
              this.time.delayedCall(50, () => this.showParent());
              return true;
            }
            setStatus('不对哦，请家长来答');
            return false;
          },
        },
      ],
    });
  }

  private showParent(): void {
    if (this.parentLayer) return;
    const W = viewW(this);
    const H = viewH(this);
    const engine = ctx().engine;
    const now = ctx().platform.now();
    const layer = this.add.container(0, 0).setDepth(500);
    this.parentLayer = layer;
    layer.add(this.add.rectangle(W / 2, H / 2, W, H, 0, 0.4).setInteractive());

    const pw = Math.min(W - 24, 640);
    const x0 = W / 2 - pw / 2;
    const y0 = H / 2 - 283;
    const g = this.add.graphics();
    drawBoard(g, x0, y0, pw, 566, 24);
    layer.add(g);

    const close = () => {
      layer.destroy();
      this.parentLayer = undefined;
    };
    const refresh = () => {
      ctx().save();
      this.scene.restart({ parent: true });
    };

    layer.add(this.add.text(W / 2, y0 + 40, '家长设置', textStyle(32)).setOrigin(0.5));

    const lim = limitStatus(engine, now);
    let y = y0 + 96;
    layer.add(this.add.text(x0 + 28, y, '每天最多玩多久', textStyle(22)).setOrigin(0, 0.5));
    layer.add(this.add.text(x0 + pw - 28, y, `今天已学 ${Math.round(lim.used)} 分钟`, textStyle(17, PALETTE.inkSoft)).setOrigin(1, 0.5));
    y += 48;

    const currentLimit = engine.data.limit?.minutes ?? 0;
    const colW = (pw - 56) / LIMIT_PRESETS.length;
    LIMIT_PRESETS.forEach((mins, i) => {
      const active = mins === currentLimit;
      layer.add(
        makeButton(
          this,
          x0 + 28 + colW * (i + 0.5),
          y,
          colW - 8,
          48,
          mins ? `${mins}分钟` : '不限',
          () => {
            setDailyLimit(engine, mins);
            track('limit_set', { minutes: mins });
            refresh();
          },
          { fill: active ? PALETTE.carrot : PALETTE.board, textColor: active ? PALETTE.white : PALETTE.ink, fontSize: 18 },
        ),
      );
    });

    y += 46;
    layer.add(
      this.add
        .text(
          W / 2,
          y,
          '到点后不再开新的一局（正在打的会让孩子打完），首页会请孩子明天再来',
          textStyle(15, PALETTE.inkSoft, undefined, { wordWrap: { width: pw - 50 }, align: 'center' }),
        )
        .setOrigin(0.5),
    );

    y += 58;
    layer.add(this.add.text(x0 + 28, y, '学校这周学到哪', textStyle(22)).setOrigin(0, 0.5));
    y += 44;

    const sch = engine.data.school;
    let schLabel = '还没标。在"沪教版"地图里点开单元，最下面可以标';
    if (sch) {
      try {
        const course = getCourse(sch.course);
        schLabel = `${course.short} · ${course.units[sch.unit]?.title ?? `第 ${sch.unit + 1} 单元`}`;
      } catch {
        schLabel = '标的单元找不到了';
      }
    }
    const schText = this.add
      .text(x0 + 28, y, schLabel, textStyle(sch ? 19 : 16, sch ? PALETTE.ink : PALETTE.inkSoft))
      .setOrigin(0, 0.5);
    const maxW = pw - 56 - (sch ? 120 : 0);
    if (schText.width > maxW) schText.setScale(maxW / schText.width);
    layer.add(schText);

    if (sch) {
      layer.add(
        makeButton(
          this,
          x0 + pw - 78,
          y,
          100,
          42,
          '取消',
          () => {
            setSchoolUnit(engine, undefined);
            refresh();
          },
          { fill: PALETTE.board, textColor: PALETTE.ink, fontSize: 18 },
        ),
      );
    }

    y += 36;
    layer.add(this.add.text(W / 2, y, '标了以后，首页的"继续"会先带孩子把这个单元打完', textStyle(15, PALETTE.inkSoft)).setOrigin(0.5));

    y += 58;
    const off = isAnalyticsOff();
    layer.add(this.add.text(x0 + 28, y, '匿名使用统计', textStyle(22)).setOrigin(0, 0.5));
    layer.add(
      makeButton(
        this,
        x0 + pw - 88,
        y,
        120,
        42,
        off ? '已关' : '开着',
        () => {
          setAnalyticsOff(!off);
          refresh();
        },
        { fill: off ? PALETTE.board : 0xd8f5d9, textColor: PALETTE.ink, fontSize: 18 },
      ),
    );
    y += 40;
    layer.add(
      this.add
        .text(
          W / 2,
          y,
          '只记哪天打开、打了哪一关、输赢和正确率；不记姓名和联系方式。点右边可以关',
          textStyle(14, PALETTE.inkSoft, undefined, { wordWrap: { width: pw - 50 }, align: 'center' }),
        )
        .setOrigin(0.5),
    );

    layer.add(makeButton(this, W / 2, y0 + 566 - 40, 150, 50, '关闭', close, { fill: PALETTE.carrot, fontSize: 22 }));
  }

  private drawDays(days: DayStat[], x: number, y: number, w: number, h: number): void {
    this.add.text(x + 16, y + 20, '最近 7 天（分钟）', textStyle(20)).setOrigin(0, 0.5);
    const maxMin = Math.max(10, ...days.map((d) => d.minutes));
    const colW = (w - 32) / days.length;
    const base = y + h - 34;
    const top = y + 48;
    const g = this.add.graphics();
    days.forEach((d, i) => {
      const cx = x + 16 + colW * i + colW / 2;
      const barH = ((base - top) * d.minutes) / maxMin;
      g.fillStyle(d.minutes > 0 ? PALETTE.carrot : 0xe6dccb, 1);
      g.fillRoundedRect(cx - colW * 0.3, base - Math.max(3, barH), colW * 0.6, Math.max(3, barH), 6);
      if (d.minutes > 0) this.add.text(cx, base - barH - 12, String(d.minutes), textStyle(15, PALETTE.ink, FONT_EN)).setOrigin(0.5);
      this.add.text(cx, base + 12, d.date, textStyle(13, PALETTE.inkSoft, FONT_EN)).setOrigin(0.5);
      this.add.text(cx, base + 28, d.answers ? fmtPct(d.accuracy) : '', textStyle(13, PALETTE.good, FONT_EN)).setOrigin(0.5);
    });
  }

  private drawStages(groups: GroupStat[], x: number, y: number, w: number, h: number): void {
    this.add.text(x + 16, y + 18, '按玩法', textStyle(20)).setOrigin(0, 0.5);
    const cols = [0.04, 0.36, 0.52, 0.7, 0.86].map((p) => x + w * p);
    ['玩法', '局数', '过关', '一次对', '反应'].forEach((label, i) => {
      this.add.text(cols[i], y + 46, label, textStyle(15, PALETTE.inkSoft)).setOrigin(0, 0.5);
    });
    const rowH = Math.min(26, (h - 66) / Math.max(1, Math.min(groups.length, 6)));
    groups.slice(0, 6).forEach((row, idx) => {
      const ry = y + 70 + idx * rowH;
      const vals = [row.label, String(row.sessions), fmtPct(row.winRate), fmtPct(row.accuracy), row.reactSec ? `${row.reactSec.toFixed(1)}秒` : '-'];
      vals.forEach((v, i) => this.add.text(cols[i], ry, v, textStyle(16, PALETTE.ink)).setOrigin(0, 0.5));
    });
  }

  private drawLists(stats: StatsSummary, x: number, y: number, w: number, h: number): void {
    this.add.text(x + 16, y + 20, '卡住的关', textStyle(20)).setOrigin(0, 0.5);
    const hard = stats.hardLevels.slice(0, 4);
    if (!hard.length) this.add.text(x + 16, y + 50, '暂时没有', textStyle(16, PALETTE.inkSoft)).setOrigin(0, 0.5);
    hard.forEach((item, i) => {
      const t = this.add.text(x + 16, y + 50 + i * 26, `${item.title}（玩 ${item.plays} 次，没过 ${item.fails} 次）`, textStyle(16, PALETTE.ink)).setOrigin(0, 0.5);
      if (t.width > w - 32) t.setScale((w - 32) / t.width);
    });

    const weakY = y + Math.max(160, h * 0.45);
    this.add.text(x + 16, weakY, '常错的词', textStyle(20)).setOrigin(0, 0.5);
    const weak = stats.weakWords.slice(0, 12);
    if (!weak.length) this.add.text(x + 16, weakY + 30, '暂时没有', textStyle(16, PALETTE.inkSoft)).setOrigin(0, 0.5);
    const colW = (w - 32) / 2;
    const rowH = Math.min(26, (y + h - weakY - 40) / Math.ceil(Math.max(1, weak.length) / 2));
    weak.forEach((item, i) => {
      const t = this.add
        .text(x + 16 + (i % 2) * colW, weakY + 30 + Math.floor(i / 2) * rowH, `${item.en} ${item.zh}（${item.missed}/${item.seen}）`, textStyle(16, PALETTE.ink))
        .setOrigin(0, 0.5);
      if (t.width > colW - 8) t.setScale((colW - 8) / t.width);
    });
  }
}
