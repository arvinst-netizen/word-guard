import Phaser from 'phaser';
import type { BattleAnswer, BattleSummary } from '../../core/battle/battle';
import { courseArtStage, setArtStage } from '../../core/content/art';
import { getLevel, nextLevel, type LevelDef } from '../../core/content/levels';
import { speakTexts, wordById } from '../../core/content/words';
import { isLevelUnlocked } from '../../core/progress';
import {
  CASTLE_NAMES,
  castleTier,
  dailyStatus,
  OUTFITS,
  PET_KINDS,
  PET_STAGES,
  petPerk,
  petState,
  rankForXp,
} from '../../core/rewards';
import { ctx } from '../context';
import { openDictationReportModal } from '../report';
import { openPetNameDialog } from '../pet-name';
import {
  drawBackdrop,
  drawBoard,
  FONT_EN,
  FONT_PLAIN,
  hex,
  isPortrait,
  PALETTE,
  setupCamera,
  textStyle,
  viewH,
  viewW,
} from '../theme';
import { makeCastle } from '../ui/castle';
import { MonsterView } from '../ui/monster';
import { PetView } from '../ui/pet';
import { drawStar, makeButton, makePicture } from '../ui/widgets';

export interface ResultSceneData {
  levelId: string;
  result: 'win' | 'lose';
  stars: number;
  hearts: number;
  answers: BattleAnswer[];
  improved: boolean;
  unitCompleted: boolean;
  newOutfit?: string;
  score: BattleSummary;
  record: boolean;
  prevBest: number;
  xpBefore: number;
  xpGain: number;
  newCards: number;
  newGold: number;
  petGrew?: { from: number; to: number };
}

function uniqueStrings(arr: string[]): string[] {
  return [...new Set(arr)];
}

export class ResultScene extends Phaser.Scene {
  private data_!: ResultSceneData;

  constructor() {
    super('result');
  }

  init(data: ResultSceneData): void {
    this.data_ = data;
  }

  create(): void {
    setupCamera(this);
    const W = viewW(this);
    const H = viewH(this);
    const portrait = isPortrait(this);
    const d = this.data_;
    const level = getLevel(d.levelId);
    setArtStage(courseArtStage(level.course));

    const win = d.result === 'win';
    drawBackdrop(this);
    ctx().platform.music.setMood('calm');

    const pw = Math.min(W - 40, portrait ? 680 : 900);
    const ph = portrait ? 760 : H - 60;
    const x0 = (W - pw) / 2;
    const y0 = portrait ? (H - 760) / 2 : 30;
    drawBoard(this.add.graphics(), x0, y0, pw, ph, 28);

    this.add.text(W / 2, y0 + 50, win ? '过关啦！' : '再来一次吧', textStyle(48, win ? PALETTE.good : PALETTE.carrotDark)).setOrigin(0.5);
    const sub =
      level.chapter === 'review'
        ? win
          ? '复习完成！这些词会隔一段时间再来'
          : '没关系，明天再复习一次'
        : level.title;
    this.add.text(W / 2, y0 + 98, sub, textStyle(22, PALETTE.inkSoft)).setOrigin(0.5);

    const starY = y0 + 160;
    for (let i = 0; i < 3; i++) {
      const sg = this.add.graphics();
      drawStar(sg, 0, 0, 34, i < d.stars);
      sg.setPosition(W / 2 + (i - 1) * 90, starY).setScale(0);
      this.tweens.add({ targets: sg, scale: 1, delay: 250 + i * 220, duration: 260, ease: 'Back.easeOut' });
    }

    const sc = d.score;
    const scoreY = starY + 66;
    const scoreText = this.add.text(W / 2, scoreY, '得分 0', textStyle(40, PALETTE.carrotDark)).setOrigin(0.5);
    const parts = [`答题 ${sc.battle}`];
    if (sc.hearts) parts.push(`剩下的心 +${sc.hearts}`);
    if (sc.flawless) parts.push(`全部一次答对 +${sc.flawless}`);
    if (sc.bestCombo >= 2) parts.push(`最高连击 ×${sc.bestCombo}`);
    const breakdown = this.add.text(W / 2, scoreY + 36, parts.join(' · '), textStyle(18, PALETTE.inkSoft)).setOrigin(0.5);
    if (breakdown.width > pw - 40) breakdown.setScale((pw - 40) / breakdown.width);

    const sfx = ctx().platform.sfx;
    const anim = { v: 0 };
    let lastTick = 0;
    this.tweens.add({
      targets: anim,
      v: sc.total,
      delay: 900,
      duration: sc.total > 0 ? 900 : 1,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        scoreText.setText(`得分 ${Math.round(anim.v)}`);
        if (this.time.now - lastTick > 70) {
          lastTick = this.time.now;
          sfx.play('tick', 1 + (anim.v / Math.max(1, sc.total)) * 0.5);
        }
      },
      onComplete: () => {
        scoreText.setText(`得分 ${sc.total}`);
        this.tweens.add({ targets: scoreText, scale: 1.18, duration: 130, yoyo: true });
        if (d.record) {
          sfx.play('record');
          const badge = this.add
            .text(
              W / 2 + scoreText.width / 2 + 70,
              scoreY - 6,
              '新纪录！',
              textStyle(26, PALETTE.white, undefined, { backgroundColor: hex(PALETTE.bad), padding: { x: 10, y: 4 } }),
            )
            .setOrigin(0.5)
            .setAngle(-10)
            .setScale(2.2)
            .setAlpha(0);
          this.tweens.add({ targets: badge, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
        } else if (win && d.prevBest > 0) {
          this.add
            .text(W / 2 + scoreText.width / 2 + 16, scoreY + 4, `本关最高 ${Math.max(d.prevBest, sc.total)}`, textStyle(17, PALETTE.inkSoft))
            .setOrigin(0, 0.5);
        }
      },
    });

    const firstPass = d.answers.filter((a) => !a.retry);
    const perfect = firstPass.filter((a) => a.outcome === 'perfect');
    const wrongWords = uniqueStrings(d.answers.filter((a) => a.outcome !== 'perfect').map((a) => a.wordId));
    let accStr = `一次就答对 ${perfect.length} / ${firstPass.length} 题`;
    if (win && d.stars < 3) {
      accStr += d.stars === 1 ? ' · 一次答对的越多，星星越多' : ' · 再少错几个就能拿三颗星';
    } else if (!win) {
      accStr += ' · 点错会扣心，想好了再点';
    }
    const accText = this.add.text(W / 2, scoreY + 70, accStr, textStyle(20, PALETTE.ink)).setOrigin(0.5);
    if (accText.width > pw - 40) accText.setScale((pw - 40) / accText.width);

    const listY = scoreY + 112;
    this.add
      .text(x0 + 40, listY, wrongWords.length ? '这些词要多练练（点一下听发音）' : '每个词都一次答对，太厉害了！', textStyle(22, PALETTE.ink))
      .setOrigin(0, 0.5);

    const cw = portrait ? 196 : 200;
    const cols = Math.floor((pw - 60) / (cw + 12));
    wrongWords.slice(0, cols * 2).forEach((id, i) => {
      const w = wordById(id);
      const cx = x0 + 40 + (i % cols) * (cw + 12) + cw / 2;
      const cy = listY + 50 + Math.floor(i / cols) * 76;
      const card = this.add.container(cx, cy);
      const g = this.add.graphics();
      g.fillStyle(PALETTE.white, 1);
      g.fillRoundedRect(-cw / 2, -32, cw, 64, 16);
      g.lineStyle(3, PALETTE.ink, 1);
      g.strokeRoundedRect(-cw / 2, -32, cw, 64, 16);
      card.add(g);
      if (w.picture) card.add(makePicture(this, -cw / 2 + 36, 0, w.picture, 34));
      const tx = w.picture ? 66 : 16;
      const fs = Math.min(26, Math.floor((cw - tx - 14) / (w.en.length * 0.55)));
      card.add(this.add.text(-cw / 2 + tx, -9, w.en, textStyle(fs, PALETTE.ink, FONT_EN)).setOrigin(0, 0.5));
      const zh = this.add.text(-cw / 2 + tx + 2, 16, w.zh, textStyle(16, PALETTE.inkSoft, FONT_PLAIN)).setOrigin(0, 0.5);
      if (zh.width > cw - tx - 12) zh.setScale((cw - tx - 12) / zh.width);
      card.add(zh);
      card.setSize(cw, 64).setInteractive({ useHandCursor: true });
      card.on('pointerup', () => {
        const [first, ...rest] = speakTexts(w);
        ctx().platform.speech.say(first);
        for (const t of rest) ctx().platform.speech.say(t, { interrupt: false });
      });
    });

    const nxt = nextLevel(level.id);
    const canNext = !!nxt && isLevelUnlocked(nxt, ctx().engine);
    const btnY = y0 + ph - 60;
    const actions: [string, () => void, number][] = win
      ? [
          ['选关', () => this.scene.start('levels'), PALETTE.board],
          ['再玩一次', () => this.scene.start('battle', { levelId: level.id }), canNext ? PALETTE.board : PALETTE.carrot],
        ]
      : [
          ['选关', () => this.scene.start('levels'), PALETTE.board],
          ['复习错词再战', () => this.reviewThenRetry(level.id, wrongWords.slice(0, 5)), PALETTE.carrot],
        ];
    if (level.dictation && d.answers.length > 0) {
      actions.push([
        '听写结果单',
        () => openDictationReportModal(level.title, d.answers),
        PALETTE.good,
      ]);
    }
    if (win && canNext && nxt) {
      actions.push([
        nxt.boss ? '打 Boss！' : '下一关',
        () => this.scene.start('battle', { levelId: nxt.id }),
        nxt.boss ? PALETTE.bad : PALETTE.carrot,
      ]);
    }

    const bw = actions.length >= 4 ? (portrait ? 156 : 185) : portrait ? (win ? 190 : 250) : win ? 210 : 270;
    const totalW = actions.length * bw + (actions.length - 1) * 20;
    actions.forEach(([label, fn, fill], i) => {
      makeButton(this, W / 2 - totalW / 2 + bw / 2 + i * (bw + 20), btnY, bw, 70, label, fn, {
        fill,
        textColor: fill === PALETTE.board ? PALETTE.ink : PALETTE.white,
        fontSize: 28,
      });
    });

    this.drawRewards(W / 2, btnY - 60, pw - 40, d);

    const rankedUp = rankForXp(d.xpBefore + d.xpGain).index > rankForXp(d.xpBefore).index;
    const afterCelebrate = () => {
      if (d.petGrew) this.celebratePet(d.petGrew.from, d.petGrew.to);
    };
    if (d.unitCompleted || d.newOutfit || rankedUp) {
      this.time.delayedCall(1900, () => this.celebrate(level, d, rankedUp, afterCelebrate));
    } else if (d.petGrew) {
      this.time.delayedCall(1900, afterCelebrate);
    }
  }

  private drawRewards(cx: number, y: number, maxW: number, d: ResultSceneData): void {
    const before = rankForXp(d.xpBefore);
    const after = rankForXp(d.xpBefore + d.xpGain);
    const engine = ctx().engine;
    const daily = dailyStatus(engine, ctx().platform.now());
    const pills: string[] = [];
    if (d.newCards > 0) pills.push(`图鉴 +${d.newCards}`);
    if (d.newGold > 0) pills.push(`金卡 +${d.newGold}`);
    pills.push(
      daily.claimed ? '今日任务完成' : daily.allDone ? '宝箱可以开了！' : `今日任务 ${daily.tasks.filter((t) => t.done).length}/3`,
    );

    const barW = Math.min(300, maxW - pills.length * 160 - 150);
    let x = cx - (150 + barW + pills.length * 160) / 2;
    const rankLabel = this.add.text(x + 140, y, after.title, textStyle(20, PALETTE.ink)).setOrigin(1, 0.5);
    x += 150;

    const bg = this.add.graphics();
    bg.fillStyle(PALETTE.ink, 1);
    bg.fillRoundedRect(x - 3, y - 13, barW + 6, 26, 13);
    bg.fillStyle(0xd9cdb0, 1);
    bg.fillRoundedRect(x, y - 10, barW, 20, 10);

    const bar = this.add.graphics();
    const fillBar = (p: number) => {
      bar.clear();
      bar.fillStyle(PALETTE.good, 1);
      if (p > 0.02) bar.fillRoundedRect(x, y - 10, Math.max(20, barW * p), 20, 10);
    };

    const up = after.index > before.index;
    const anim = { p: up ? 0 : before.progress };
    if (up) rankLabel.setText(before.title);
    fillBar(up ? before.progress : anim.p);

    const xpText = this.add.text(x + barW / 2, y, `+${d.xpGain} 经验`, textStyle(15, PALETTE.ink)).setOrigin(0.5);
    const animateToAfter = () =>
      this.tweens.add({
        targets: anim,
        p: after.progress,
        duration: 700,
        ease: 'Quad.easeOut',
        onUpdate: () => fillBar(anim.p),
        onComplete: () => xpText.setText(after.need ? `${after.have} / ${after.need}` : '满级'),
      });

    if (up) {
      const pre = { p: before.progress };
      this.tweens.add({
        targets: pre,
        p: 1,
        delay: 1000,
        duration: 500,
        onUpdate: () => fillBar(pre.p),
        onComplete: () => {
          rankLabel.setText(after.title);
          this.tweens.add({ targets: rankLabel, scale: 1.3, duration: 140, yoyo: true });
          animateToAfter();
        },
      });
    } else {
      this.time.delayedCall(1000, animateToAfter);
    }

    x += barW + 10;
    pills.forEach((label, i) => {
      const pg = this.add.graphics();
      const hot = label.includes('宝箱') || label.includes('+');
      pg.fillStyle(hot ? PALETTE.sun : 0xfff4dc, 1);
      pg.fillRoundedRect(x + i * 160, y - 17, 150, 34, 17);
      pg.lineStyle(3, PALETTE.ink, 1);
      pg.strokeRoundedRect(x + i * 160, y - 17, 150, 34, 17);
      const t = this.add.text(x + i * 160 + 75, y, label, textStyle(17, PALETTE.ink)).setOrigin(0.5);
      if (t.width > 138) t.setScale(138 / t.width);
    });
  }

  private reviewThenRetry(levelId: string, wordIds: string[]): void {
    const go = () => this.scene.start('battle', { levelId, shield: true });
    if (wordIds.length === 0) {
      go();
      return;
    }
    const W = viewW(this);
    const H = viewH(this);
    const layer = this.add.container(0, 0).setDepth(60);
    layer.add(this.add.rectangle(W / 2, H / 2, W, H, 0, 0.45).setInteractive());
    const pw = Math.min(520, W - 50);
    let card: Phaser.GameObjects.Container | undefined;

    const show = (idx: number) => {
      card?.destroy();
      const w = wordById(wordIds[idx]);
      card = this.add.container(W / 2, H / 2);
      layer.add(card);
      const g = this.add.graphics();
      drawBoard(g, -pw / 2, -215, pw, 430, 26);
      card.add(g);
      card.add(this.add.text(0, -181, `复习错词 ${idx + 1} / ${wordIds.length}`, textStyle(20, PALETTE.inkSoft)).setOrigin(0.5));

      let py = -145;
      if (w.picture) {
        card.add(makePicture(this, 0, py + 60, w.picture, 120));
        py += 130;
      } else {
        py += 40;
      }
      const en = this.add.text(0, py + 36, w.en, textStyle(60, PALETTE.ink, FONT_EN)).setOrigin(0.5);
      if (en.width > pw - 50) en.setScale((pw - 50) / en.width);
      card.add(en);
      const zh = this.add.text(0, py + 94, w.zh, textStyle(28, PALETTE.inkSoft, FONT_PLAIN)).setOrigin(0.5);
      if (zh.width > pw - 40) zh.setScale((pw - 40) / zh.width);
      card.add(zh);

      const last = idx === wordIds.length - 1;
      card.add(
        makeButton(this, -110, 165, 180, 62, '再听一遍', () => ctx().platform.speech.say(w.en), {
          fill: PALETTE.board,
          textColor: PALETTE.ink,
          fontSize: 24,
        }),
      );
      card.add(
        makeButton(this, 110, 165, 200, 62, last ? '带护盾再战！' : '记住了，下一个', () => (last ? go() : show(idx + 1)), {
          fill: PALETTE.carrot,
          fontSize: 24,
        }),
      );
      card.setScale(0.7);
      this.tweens.add({ targets: card, scale: 1, duration: 180, ease: 'Back.easeOut' });
      ctx().platform.sfx.play('card');
      ctx().platform.speech.say(w.en);
    };
    show(0);
  }

  private celebrate(level: LevelDef, d: ResultSceneData, rankedUp = false, onDone?: () => void): void {
    const W = viewW(this);
    const H = viewH(this);
    ctx().platform.sfx.play('win');
    const layer = this.add.container(0, 0).setDepth(50);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0, 0.3).setInteractive();
    layer.add(shade);

    const colors = [0xe2553a, 0xffc93c, 0x5b8def, 0x2fa866, 0xff7e96, 0x7b5be9];
    for (let i = 0; i < 80; i++) {
      const piece = this.add
        .rectangle(Math.random() * W, -20 - Math.random() * H * 0.5, 10, 16, colors[i % colors.length])
        .setAngle(Math.random() * 360);
      layer.add(piece);
      this.tweens.add({
        targets: piece,
        y: H + 40,
        angle: piece.angle + 360 * (Math.random() > 0.5 ? 1 : -1),
        x: piece.x + (Math.random() - 0.5) * 160,
        duration: 1800 + Math.random() * 1600,
        ease: 'Sine.easeIn',
      });
    }

    const lines: string[] = [];
    const after = rankForXp(d.xpBefore + d.xpGain);
    const castleUp = rankedUp && castleTier(after.index) > castleTier(rankForXp(d.xpBefore).index);
    if (rankedUp) {
      lines.push(`升级啦！现在是「${after.title}」` + (castleUp ? `，家变成了${CASTLE_NAMES[castleTier(after.index)]}` : ''));
    }
    if (d.unitCompleted) {
      lines.push(level.unit === undefined ? '单元全部过关！' : `${level.title.split(' · ')[0]} 全部过关！`);
    }
    if (d.newOutfit) lines.push(`认识的词又多了 50 个，解锁新装扮：${d.newOutfit}`);

    const pw = Math.min(W - 40, 600);
    const showCastle = castleUp && !d.newOutfit;
    const ph = 150 + lines.length * 36 + (d.newOutfit || showCastle ? 190 : 0);
    const g = this.add.graphics();
    drawBoard(g, W / 2 - pw / 2, H / 2 - ph / 2, pw, ph, 26);
    layer.add(g);
    layer.add(
      this.add.text(W / 2, H / 2 - ph / 2 + 50, d.unitCompleted ? '单元完成！' : rankedUp ? '升级！' : '新装扮！', textStyle(40, PALETTE.carrotDark)).setOrigin(0.5),
    );
    lines.forEach((line, i) => {
      const t = this.add.text(W / 2, H / 2 - ph / 2 + 104 + i * 36, line, textStyle(22, PALETTE.ink)).setOrigin(0.5);
      if (t.width > pw - 40) t.setScale((pw - 40) / t.width);
      layer.add(t);
    });

    if (d.newOutfit) {
      const idx = OUTFITS.indexOf(d.newOutfit as (typeof OUTFITS)[number]);
      const m = new MonsterView(this, W / 2, H / 2 + ph / 2 - 110, -99, 'apple', 2, 0.95, 'auto', idx);
      m.disableInteractive();
      layer.add(m);
      this.tweens.add({ targets: m, y: m.y - 10, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    if (showCastle) {
      layer.add(makeCastle(this, W / 2, H / 2 + ph / 2 - 130, 1, castleTier(after.index)));
    }

    layer.add(this.add.text(W / 2, H / 2 + ph / 2 - 26, '点任意处继续', textStyle(17, PALETTE.inkSoft)).setOrigin(0.5));
    shade.on('pointerup', () => {
      layer.destroy();
      onDone?.();
    });
  }

  private celebratePet(fromStage: number, toStage: number): void {
    const pet = petState(ctx().engine);
    if (!pet) return;
    const W = viewW(this);
    const H = viewH(this);
    ctx().platform.sfx.play('win');
    const layer = this.add.container(0, 0).setDepth(60);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0, 0.35).setInteractive();
    layer.add(shade);

    const pw = Math.min(W - 40, 560);
    const g = this.add.graphics();
    drawBoard(g, W / 2 - pw / 2, H / 2 - 215, pw, 430, 26);
    layer.add(g);

    const hatched = fromStage === 0;
    layer.add(this.add.text(W / 2, H / 2 - 215 + 48, hatched ? '蛋孵出来了！' : '小伙伴长大了！', textStyle(38, PALETTE.carrotDark)).setOrigin(0.5));
    const perk = petPerk(toStage);
    const newPerk = perk.text && perk.text !== petPerk(fromStage).text;
    const desc = hatched
      ? `是一只${PET_KINDS[pet.kind].name}宝宝！多认识单词，它会越长越大`
      : `${pet.name}长成了「${PET_STAGES[toStage].title}」`;
    const descText = this.add.text(W / 2, H / 2 - 215 + 96, desc, textStyle(22, PALETTE.ink)).setOrigin(0.5);
    if (descText.width > pw - 40) descText.setScale((pw - 40) / descText.width);
    layer.add(descText);
    if (newPerk) {
      layer.add(this.add.text(W / 2, H / 2 - 215 + 128, `新本领：${perk.text}`, textStyle(20, PALETTE.good)).setOrigin(0.5));
    }

    const petY = H / 2 + 215 - 112;
    const finalScale = toStage <= 2 ? 1.8 : toStage <= 3 ? 1.4 : 1.15;
    const oldView = new PetView(this, W / 2, petY, pet.kind, fromStage, fromStage === 0 ? 1.5 : finalScale, { crack: 2 });
    layer.add(oldView);
    this.tweens.add({
      targets: oldView,
      scale: 0.2,
      alpha: 0,
      delay: 500,
      duration: 350,
      ease: 'Back.easeIn',
      onComplete: () => {
        oldView.destroy();
        const flash = this.add.circle(W / 2, petY - 60, 30, 0xffffff, 0.9);
        layer.add(flash);
        this.tweens.add({ targets: flash, scale: 6, alpha: 0, duration: 420, onComplete: () => flash.destroy() });
        const newView = new PetView(this, W / 2, petY, pet.kind, toStage, 0.2);
        layer.add(newView);
        this.tweens.add({ targets: newView, scale: finalScale, duration: 420, ease: 'Back.easeOut' });
        ctx().platform.sfx.play('streak');
      },
    });

    const close = () => layer.destroy();
    if (hatched && !pet.named) {
      layer.add(
        makeButton(this, W / 2, H / 2 + 215 - 44, 260, 56, '给它起个名字', () => openPetNameDialog(() => close()), {
          fontSize: 24,
        }),
      );
    } else {
      layer.add(this.add.text(W / 2, H / 2 + 215 - 26, '点任意处继续', textStyle(17, PALETTE.inkSoft)).setOrigin(0.5));
    }
    shade.on('pointerup', close);
  }
}
