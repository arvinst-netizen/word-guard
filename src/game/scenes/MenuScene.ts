import Phaser from 'phaser';
import { courseArtStage, pickArtForStage } from '../../core/content/art';
import { getCourse, type RouteId } from '../../core/content/levels';
import { wordById, WORDS } from '../../core/content/words';
import { addDailyBonus, limitStatus, makeParentQuiz } from '../../core/parent';
import { placementLabel } from '../../core/placement';
import { continueTarget } from '../../core/progress';
import {
  CASTLE_NAMES,
  castleTier,
  claimDailyChest,
  dailyStatus,
  knownWordCount,
  OUTFITS,
  PET_KINDS,
  PET_STAGES,
  petPerk,
  petState,
  rankForXp,
  RANKS,
  streakInfo,
  unlockedOutfitCount,
  wordsToNextOutfit,
} from '../../core/rewards';
import { track } from '../analytics';
import { ctx } from '../context';
import { openFeedbackDialog } from '../feedback';
import { openPetNameDialog } from '../pet-name';
import { warmArtFiles } from '../pictures';
import { drawBackdrop, drawBoard, FONT_EN, isPortrait, PALETTE, setupCamera, textStyle, viewH, viewW } from '../theme';
import { makeCastle } from '../ui/castle';
import { isDialogOpen, openTextDialog } from '../ui/dialog';
import { makeIcon, type IconName } from '../ui/icons';
import { MonsterView } from '../ui/monster';
import { PET_STAGE_SCALES, PetView } from '../ui/pet';
import { makeButton } from '../ui/widgets';

export class MenuScene extends Phaser.Scene {
  private resting = false;

  constructor() {
    super('menu');
  }

  create(data?: { rest?: boolean }): void {
    this.resting = false;
    setupCamera(this);
    const W = viewW(this);
    const H = viewH(this);
    const portrait = isPortrait(this);
    drawBackdrop(this);

    const g = this.add.graphics();
    g.fillStyle(PALETTE.grassA, 1);
    g.fillRect(0, H * 0.62, W, H * 0.38);
    g.fillStyle(PALETTE.grassB, 1);
    for (let i = 0; i < 4; i++) {
      g.fillRect(0, H * 0.62 + i * H * 0.1 + H * 0.05, W, H * 0.04);
    }

    const titleY = portrait ? H * 0.17 : H * 0.2;
    const title = this.add
      .text(
        W / 2,
        titleY,
        '单词守卫',
        textStyle(portrait ? 104 : 96, PALETTE.ink, undefined, { stroke: '#ffffff', strokeThickness: 12 }),
      )
      .setOrigin(0.5);
    this.add
      .text(W / 2, titleY + (portrait ? 84 : 76), 'WORD  GUARD', textStyle(30, PALETTE.carrotDark, FONT_EN, { letterSpacing: 8 }))
      .setOrigin(0.5);
    this.tweens.add({
      targets: title,
      y: titleY - 6,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const showcase = ['apple', 'panda', 'bus', 'grape'];
    const count = portrait ? 3 : 4;
    for (let i = 0; i < count; i++) {
      if (portrait && i === 1) continue;
      const mx = W * ((i + 0.5) / count);
      const my = portrait ? H * 0.47 : H * 0.55;
      const outfits = unlockedOutfitCount(knownWordCount(ctx().engine));
      new MonsterView(this, mx, my, -1 - i, showcase[i], i, portrait ? 0.95 : 0.9, 'auto', outfits - 1 - i).disableInteractive();
    }

    const engine = ctx().engine;
    this.makePet(W / 2, portrait ? H * 0.47 + 62 : H * 0.55 + 66, portrait);
    this.makeBadge(W / 2, portrait ? H * 0.553 : H * 0.69);

    const btnY = portrait ? H * 0.64 : H * 0.8;
    const seenCount = engine.seenWordIds().length;
    const placeLabel = engine.data.placement ? '重新测水平' : '水平测试';
    const goRoute = (route: RouteId) => this.scene.start('levels', { route });
    const next = continueTarget(engine, ctx().platform.now());
    const lim = limitStatus(engine, ctx().platform.now());
    const onContinue = () =>
      lim.over ? this.showRest() : next && this.scene.start('battle', { levelId: next.level.id });

    if (data?.rest) this.time.delayedCall(150, () => this.showRest());

    if (next) {
      const lvl = next.level;
      const wordSet = new Set(lvl.wordIds);
      if (lvl.unit !== undefined) {
        for (const off of [0, 1]) {
          for (const w of getCourse(lvl.course).units[lvl.unit + off]?.words ?? []) wordSet.add(w);
        }
      }
      const artStage = courseArtStage(lvl.course);
      warmArtFiles(
        [...wordSet]
          .map((id) => wordById(id).art)
          .filter((a): a is NonNullable<typeof a> => !!a)
          .map((a) => pickArtForStage(a, artStage))
          .filter((f): f is string => Boolean(f)),
      );
    }

    if (next) {
      const contLabel = lim.over ? '今天学够啦' : next.review ? '先复习' : '继续';
      if (portrait) {
        const contBtn = makeButton(
          this,
          W / 2,
          btnY,
          400,
          92,
          contLabel,
          onContinue,
          lim.over ? { fontSize: 36, fill: 0x8fc98f } : { fontSize: 42, icon: 'play' },
        );
        this.tweens.add({ targets: contBtn, scale: 1.04, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        makeButton(this, W / 2 - 104, btnY + 102, 196, 72, '剑桥版', () => goRoute('cambridge'), {
          fill: 0xffb26b,
          textColor: PALETTE.ink,
          fontSize: 30,
        });
        makeButton(this, W / 2 + 104, btnY + 102, 196, 72, '沪教版', () => goRoute('shanghai'), {
          fill: 0x5b8def,
          fontSize: 30,
        });
        makeButton(this, W / 2 - 104, btnY + 188, 196, 64, placeLabel, () => this.scene.start('placement'), {
          fill: PALETTE.sun,
          textColor: PALETTE.ink,
          fontSize: 26,
        });
        makeButton(this, W / 2 + 104, btnY + 188, 196, 64, '图鉴', () => this.scene.start('wordbook'), {
          fill: PALETTE.board,
          textColor: PALETTE.ink,
          fontSize: 28,
        });
      } else {
        const contBtn = makeButton(
          this,
          W / 2,
          btnY + 4,
          300,
          84,
          contLabel,
          onContinue,
          lim.over ? { fontSize: 32, fill: 0x8fc98f } : { fontSize: 40, icon: 'play' },
        );
        this.tweens.add({ targets: contBtn, scale: 1.04, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        makeButton(this, W / 2 - 252, btnY, 180, 76, '剑桥版', () => goRoute('cambridge'), {
          fill: 0xffb26b,
          textColor: PALETTE.ink,
          fontSize: 30,
        });
        makeButton(this, W / 2 + 252, btnY, 180, 76, '沪教版', () => goRoute('shanghai'), {
          fill: 0x5b8def,
          fontSize: 30,
        });
        makeButton(this, W / 2 - 440, btnY, 172, 68, placeLabel, () => this.scene.start('placement'), {
          fill: PALETTE.sun,
          textColor: PALETTE.ink,
          fontSize: 24,
        });
        makeButton(this, W / 2 + 440, btnY, 172, 68, '图鉴', () => this.scene.start('wordbook'), {
          fill: PALETTE.board,
          textColor: PALETTE.ink,
          fontSize: 28,
        });
      }
    } else if (portrait) {
      makeButton(this, W / 2, btnY, 400, 88, '剑桥版', () => goRoute('cambridge'), { fontSize: 38 });
      makeButton(this, W / 2, btnY + 104, 400, 88, '沪教版', () => goRoute('shanghai'), { fill: 0x5b8def, fontSize: 38 });
      makeButton(this, W / 2 - 104, btnY + 204, 196, 68, placeLabel, () => this.scene.start('placement'), {
        fill: PALETTE.sun,
        textColor: PALETTE.ink,
        fontSize: 26,
      });
      makeButton(this, W / 2 + 104, btnY + 204, 196, 68, '图鉴', () => this.scene.start('wordbook'), {
        fill: PALETTE.board,
        textColor: PALETTE.ink,
        fontSize: 28,
      });
    } else {
      makeButton(this, W / 2 - 140, btnY, 260, 88, '剑桥版', () => goRoute('cambridge'), { fontSize: 36 });
      makeButton(this, W / 2 + 140, btnY, 260, 88, '沪教版', () => goRoute('shanghai'), { fill: 0x5b8def, fontSize: 36 });
      makeButton(this, W / 2 - 450, btnY, 200, 72, placeLabel, () => this.scene.start('placement'), {
        fill: PALETTE.sun,
        textColor: PALETTE.ink,
        fontSize: 26,
      });
      makeButton(this, W / 2 + 450, btnY, 200, 72, '图鉴', () => this.scene.start('wordbook'), {
        fill: PALETTE.board,
        textColor: PALETTE.ink,
        fontSize: 28,
      });
    }

    const pl = engine.data.placement;
    const footer = lim.over
      ? `今天已经学了 ${Math.round(lim.used)} 分钟，明天再来 · 已认识 ${seenCount} 个词`
      : next
        ? `${next.review ? '今天该复习的词' : '下一关：' + next.level.title} · 已认识 ${seenCount} 个词`
        : (seenCount === 0 ? `${WORDS.length} 个单词等你来认识` : `已经认识 ${seenCount} / ${WORDS.length} 个单词`) +
          (pl ? ` · 水平：${placementLabel(pl.band)}` : seenCount === 0 ? ' · 先做个水平测试吧' : '');

    const footerText = this.add.text(W / 2, portrait ? btnY + (next ? 250 : 280) : btnY + 76, footer, textStyle(22, PALETTE.ink)).setOrigin(0.5);
    if (footerText.width > W - 40) footerText.setScale((W - 40) / footerText.width);

    ctx().platform.music.setMood('calm');
    const topY = portrait ? 60 : 50;
    this.makeToggles(W, topY);
    this.makeSpeechTest(110, topY, W);
    makeButton(this, 284, topY, 150, 52, '学习记录', () => this.scene.start('stats'), {
      fill: PALETTE.board,
      textColor: PALETTE.ink,
      fontSize: 22,
    });
    makeButton(this, 418, topY, 96, 52, '反馈', () => openFeedbackDialog(), {
      fill: PALETTE.sun,
      textColor: PALETTE.ink,
      fontSize: 22,
    });
  }

  private makeSpeechTest(x: number, y: number, W: number): void {
    const speech = ctx().platform.speech;
    const tip = this.add
      .text(
        x - 80,
        y + 40,
        '',
        textStyle(18, PALETTE.inkSoft, undefined, {
          wordWrap: { width: Math.min(W - 60, 560) },
          backgroundColor: '#fff4dc',
          padding: { x: 12, y: 8 },
        }),
      )
      .setOrigin(0, 0)
      .setDepth(50)
      .setVisible(false);

    makeButton(
      this,
      x,
      y,
      160,
      52,
      '试听发音',
      () => {
        tip.setVisible(true).setColor('#7a5a40').setText('正在读 apple ……');
        if (speech.test) {
          speech.test('apple', (ok, detail) => {
            if (!tip.active) return;
            if (ok) {
              tip.setColor('#2fa866').setText('朗读正常。如果还是听不到：把音量调大，并关掉手机侧边的静音键。');
            } else {
              tip.setColor('#e0484d').setText(`没有读出来（${detail}）。请再点一次试试；游戏里会自动显示单词。`);
            }
          });
        } else {
          speech.say('apple');
          tip.setText('');
        }
      },
      { fill: PALETTE.sun, textColor: PALETTE.ink, fontSize: 22 },
    );
  }

  private showRest(): void {
    if (this.resting) return;
    this.resting = true;
    const engine = ctx().engine;
    const lim = limitStatus(engine, ctx().platform.now());
    const pw = Math.min(viewW(this) - 32, 540);
    const { layer, y0, cx } = this.openPanel(pw, 400, '今天学够啦！');
    const pet = petState(engine);

    layer.add(
      this.add
        .text(
          cx,
          y0 + 84,
          `今天学了 ${Math.round(lim.used)} 分钟，真棒。休息一下，明天再来守家`,
          textStyle(20, PALETTE.ink, undefined, { wordWrap: { width: pw - 50 }, align: 'center' }),
        )
        .setOrigin(0.5),
    );
    if (pet) {
      layer.add(new PetView(this, cx, y0 + 250, pet.kind, pet.stage, pet.stage >= 4 ? 0.95 : 1.15));
    } else {
      layer.add(new MonsterView(this, cx, y0 + 170, -1, 'apple', 0, 1.1, 'hidden'));
    }

    layer.add(
      makeButton(
        this,
        cx + 110,
        y0 + 400 - 46,
        180,
        54,
        '好的',
        () => {
          this.resting = false;
          layer.destroy();
        },
        { fontSize: 24 },
      ),
    );
    layer.add(
      makeButton(
        this,
        cx - 100,
        y0 + 400 - 46,
        210,
        54,
        '家长：再玩 10 分钟',
        () => {
          if (isDialogOpen()) return;
          const q = makeParentQuiz(Math.random);
          openTextDialog({
            title: '请家长来答一下',
            message: `${q.question}（答对了今天再加 10 分钟）`,
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
                    addDailyBonus(engine, ctx().platform.now());
                    await ctx().save();
                    track('limit_bonus');
                    this.resting = false;
                    this.scene.restart({});
                    return true;
                  }
                  setStatus('不对哦，请家长来答');
                  return false;
                },
              },
            ],
          });
        },
        { fill: PALETTE.board, textColor: PALETTE.ink, fontSize: 19 },
      ),
    );
  }

  private makePet(x: number, y: number, portrait: boolean): void {
    const engine = ctx().engine;
    const pet = petState(engine);
    const addHitZone = (w: number, h: number, fn: () => void) => {
      this.add
        .zone(x, y - h / 2, w, h)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => !isDialogOpen() && fn());
    };

    if (!pet) {
      new PetView(this, x, y, 1, 0, portrait ? 1.15 : 1);
      const bubble = this.add.container(x, y - (portrait ? 118 : 104));
      const bg = this.add.graphics();
      bg.fillStyle(PALETTE.ink, 1);
      bg.fillRoundedRect(-93, -21, 186, 42, 21);
      bg.fillStyle(PALETTE.carrot, 1);
      bg.fillRoundedRect(-90, -18, 180, 36, 18);
      bg.fillTriangle(-9, 17, 9, 17, 0, 28);
      bubble.add(bg);
      bubble.add(this.add.text(0, 0, '领一个小伙伴', textStyle(20, PALETTE.white)).setOrigin(0.5));
      this.tweens.add({
        targets: bubble,
        y: bubble.y - 8,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      addHitZone(170, 190, () => this.showAdopt());
      return;
    }

    const sc = (portrait ? 1.1 : 0.95) * (pet.stage >= 4 ? 0.9 : 1);
    const view = new PetView(this, x, y, pet.kind, pet.stage, sc, {
      crack: pet.stage === 0 ? Math.min(2, pet.points) : 0,
    });
    const label = pet.stage === 0 ? `再认识 ${pet.toNext} 个词就孵出来` : pet.name;
    const height =
      pet.stage === 0
        ? 84
        : 88 * PET_STAGE_SCALES[pet.stage] + (pet.stage >= 5 ? 40 : pet.stage >= 3 ? 28 : 18);
    this.add
      .text(x, y - height * sc - 16, label, textStyle(18, PALETTE.ink, undefined, { backgroundColor: '#fff4dccc', padding: { x: 10, y: 3 } }))
      .setOrigin(0.5);
    addHitZone(190, 200, () => {
      view.cheer();
      this.showPet();
    });
  }

  private showAdopt(): void {
    const pw = Math.min(viewW(this) - 32, 620);
    const { layer, x0, y0, cx } = this.openPanel(pw, 430, '选一颗蛋，领回家');
    layer.add(
      this.add.text(cx, y0 + 80, '多认识单词，蛋会孵出来，还会一点点长大', textStyle(19, PALETTE.inkSoft)).setOrigin(0.5),
    );
    PET_KINDS.forEach((info, kind) => {
      const px = x0 + pw * ((kind + 0.5) / 3);
      const py = y0 + 250;
      layer.add(new PetView(this, px, py, kind, 0, 1.25));
      layer.add(this.add.text(px, py + 26, `会孵出${info.name}`, textStyle(19, PALETTE.ink)).setOrigin(0.5));
      layer.add(
        makeButton(
          this,
          px,
          py + 78,
          Math.min(170, pw / 3 - 16),
          52,
          '就选它',
          () => {
            ctx().engine.data.pet = { kind, at: ctx().platform.now() };
            ctx().save();
            track('pet_adopt', { kind });
            ctx().platform.sfx.play('win');
            this.scene.restart();
          },
          { fontSize: 22 },
        ),
      );
    });
    layer.add(
      makeButton(this, cx, y0 + 430 - 36, 140, 46, '再想想', () => layer.destroy(), {
        fill: PALETTE.board,
        textColor: PALETTE.ink,
        fontSize: 20,
      }),
    );
  }

  private showPet(): void {
    const pet = petState(ctx().engine);
    if (!pet) return;
    const pw = Math.min(viewW(this) - 32, 580);
    const title = pet.stage === 0 ? `${PET_KINDS[pet.kind].egg}` : `${pet.name} · ${pet.title}`;
    const { layer, y0, cx } = this.openPanel(pw, 520, title);
    const petY = y0 + 250;
    const maxed = pet.nextTitle === null;
    const stages = maxed ? [pet.stage] : [pet.stage, pet.stage + 1];

    stages.forEach((st, idx) => {
      const px = stages.length === 1 ? cx : cx + (idx === 0 ? -pw / 4 : pw / 4);
      const view = new PetView(this, px, petY, pet.kind, st, st >= 4 ? 0.95 : 1.1, {
        crack: st === 0 ? Math.min(2, pet.points) : 0,
      });
      if (idx === 1) view.setAlpha(0.35);
      layer.add(view);
      layer.add(
        this.add
          .text(px, petY + 26, idx === 0 ? '现在' : `下一个：${PET_STAGES[st].title}`, textStyle(18, idx === 0 ? PALETTE.ink : PALETTE.inkSoft))
          .setOrigin(0.5),
      );
    });
    if (stages.length === 2) layer.add(makeIcon(this, 'arrow', cx, petY - 60, 40));

    const barW = pw - 100;
    const barY = y0 + 320;
    const g = this.add.graphics();
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(cx - barW / 2 - 4, barY - 15, barW + 8, 30, 15);
    g.fillStyle(0xeee7cf, 1);
    g.fillRoundedRect(cx - barW / 2, barY - 11, barW, 22, 11);
    if (pet.progress > 0) {
      g.fillStyle(PALETTE.good, 1);
      g.fillRoundedRect(cx - barW / 2, barY - 11, Math.max(22, barW * pet.progress), 22, 11);
    }
    layer.add(g);
    layer.add(
      this.add.text(cx, barY, maxed ? '已经长到最大啦' : `成长 ${pet.points} / ${pet.points + pet.toNext}`, textStyle(16, PALETTE.ink, FONT_EN)).setOrigin(0.5),
    );

    const desc = maxed
      ? `${pet.name}已经是传说伙伴了！`
      : pet.stage === 0
        ? `再认识 ${pet.toNext} 个词，蛋就孵出来了`
        : `再点亮 ${pet.toNext} 张图鉴卡，就长成「${pet.nextTitle}」`;
    layer.add(this.add.text(cx, barY + 36, desc, textStyle(20, PALETTE.ink)).setOrigin(0.5));

    const curPerk = petPerk(pet.stage);
    const nextPerk = maxed ? curPerk : petPerk(pet.stage + 1);
    const perkLine = curPerk.text
      ? `本领：${curPerk.text}`
      : nextPerk.text
        ? `长大后的本领：${nextPerk.text}`
        : '认得一个词点亮一张卡 +1，会拼了变金卡再 +1';
    layer.add(
      this.add
        .text(cx, barY + 68, perkLine, textStyle(17, curPerk.text ? PALETTE.good : PALETTE.inkSoft, undefined, { wordWrap: { width: pw - 50 }, align: 'center' }))
        .setOrigin(0.5),
    );

    const btnY = y0 + 520 - 42;
    if (pet.stage > 0) {
      layer.add(
        makeButton(this, cx - 84, btnY, 150, 48, pet.named ? '改名字' : '起名字', () => openPetNameDialog(() => this.scene.restart()), {
          fill: PALETTE.sun,
          textColor: PALETTE.ink,
          fontSize: 21,
        }),
      );
      layer.add(makeButton(this, cx + 84, btnY, 150, 48, '关闭', () => layer.destroy(), { fill: PALETTE.carrot, fontSize: 21 }));
    } else {
      layer.add(makeButton(this, cx, btnY, 150, 48, '关闭', () => layer.destroy(), { fill: PALETTE.carrot, fontSize: 21 }));
    }
  }

  private makeBadge(cx: number, y: number): void {
    const engine = ctx().engine;
    const now = ctx().platform.now();
    const st = streakInfo(engine, now);
    const daily = dailyStatus(engine, now);
    const doneCount = daily.tasks.filter((t) => t.done).length;
    const rank = rankForXp(engine.xp);
    const outfits = unlockedOutfitCount(knownWordCount(engine));
    const canClaim = daily.allDone && !daily.claimed;
    const dailyLabel = canClaim ? '开宝箱！' : st.days > 0 ? `${st.days}天 · 任务 ${doneCount}/3` : `今日任务 ${doneCount}/3`;
    const dailyIcon: IconName = canClaim ? 'chest' : st.days > 0 ? 'fire' : 'tasks';

    const dailyBtn = makeButton(this, cx - 216 - 10, y, 216, 54, dailyLabel, () => this.showDaily(), {
      fill: canClaim ? PALETTE.sun : 0xfff4dc,
      textColor: PALETTE.ink,
      fontSize: 21,
      icon: dailyIcon,
    });
    if (canClaim) {
      this.tweens.add({ targets: dailyBtn, scale: 1.07, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    makeButton(this, cx, y, 216, 54, rank.title, () => this.showRank(), {
      fill: 0xfff4dc,
      textColor: PALETTE.ink,
      fontSize: 21,
      icon: 'castle',
    });
    makeButton(this, cx + 216 + 10, y, 216, 54, `装扮 ${outfits}/${OUTFITS.length}`, () => this.showOutfits(), {
      fill: 0xfff4dc,
      textColor: PALETTE.ink,
      fontSize: 21,
      icon: 'bow',
    });
  }

  private openPanel(w: number, h: number, title: string) {
    const W = viewW(this);
    const H = viewH(this);
    const layer = this.add.container(0, 0).setDepth(1000);
    layer.add(this.add.rectangle(W / 2, H / 2, W, H, 0, 0.4).setInteractive());
    const g = this.add.graphics();
    const x0 = W / 2 - w / 2;
    const y0 = H / 2 - h / 2;
    drawBoard(g, x0, y0, w, h, 24);
    layer.add(g);
    layer.add(this.add.text(W / 2, y0 + 40, title, textStyle(32)).setOrigin(0.5));
    return { layer, x0, y0, cx: W / 2 };
  }

  private showDaily(): void {
    const engine = ctx().engine;
    const now = ctx().platform.now();
    const daily = dailyStatus(engine, now);
    const st = streakInfo(engine, now);
    const pw = Math.min(viewW(this) - 32, 540);
    const { layer, x0, y0, cx } = this.openPanel(pw, 470, '今日任务');

    const streakText = st.days > 0 ? `已经连续学习 ${st.days} 天${st.today ? '' : '，今天还没学哦'}` : '今天开始，每天来守一会儿家';
    layer.add(this.add.text(cx, y0 + 78, streakText, textStyle(19, PALETTE.inkSoft)).setOrigin(0.5));

    daily.tasks.forEach((task, i) => {
      const ty = y0 + 132 + i * 68;
      const g = this.add.graphics();
      g.fillStyle(task.done ? 0xd8f5d9 : PALETTE.white, 1);
      g.fillRoundedRect(x0 + 24, ty - 28, pw - 48, 56, 14);
      g.lineStyle(3, task.done ? PALETTE.good : 0xc9b99c, 1);
      g.strokeRoundedRect(x0 + 24, ty - 28, pw - 48, 56, 14);
      g.fillStyle(task.done ? PALETTE.good : 0xe6dccb, 1);
      g.fillCircle(x0 + 56, ty, 16);
      layer.add(g);
      if (task.done) layer.add(makeIcon(this, 'check', x0 + 56, ty, 22));
      layer.add(this.add.text(x0 + 86, ty, task.label, textStyle(23, PALETTE.ink)).setOrigin(0, 0.5));
      layer.add(
        this.add.text(x0 + pw - 42, ty, `${task.have}/${task.goal}`, textStyle(22, task.done ? PALETTE.good : PALETTE.inkSoft, FONT_EN)).setOrigin(1, 0.5),
      );
    });

    const chestY = y0 + 132 + 204 + 14;
    const canClaim = daily.allDone && !daily.claimed;
    const chestLabel = daily.claimed
      ? '今天的宝箱开过啦，明天再来'
      : canClaim
        ? '开宝箱  +300 经验'
        : '三个都完成，开宝箱 +300 经验';
    const chestBtn = makeButton(
      this,
      cx,
      chestY,
      pw - 80,
      66,
      chestLabel,
      () => {
        const before = rankForXp(engine.xp);
        const gain = claimDailyChest(engine, ctx().platform.now());
        if (!gain) return;
        track('chest_open', { streak: st.days });
        ctx().save();
        ctx().platform.sfx.play('win');
        const after = rankForXp(engine.xp);
        const msg = after.index > before.index ? `+${gain} 经验！升级为「${after.title}」` : `+${gain} 经验！`;
        const pop = this.add
          .text(cx, chestY - 20, msg, textStyle(34, PALETTE.carrotDark, undefined, { stroke: '#ffffff', strokeThickness: 8 }))
          .setOrigin(0.5)
          .setDepth(1100);
        this.tweens.add({ targets: pop, y: chestY - 120, scale: 1.2, duration: 900, ease: 'Cubic.easeOut' });
        this.time.delayedCall(1300, () => this.scene.restart());
      },
      {
        fill: canClaim ? PALETTE.sun : 0xe6dccb,
        textColor: canClaim ? PALETTE.ink : PALETTE.inkSoft,
        fontSize: 23,
        disabled: !canClaim,
        icon: canClaim ? 'chest' : undefined,
      },
    );
    layer.add(chestBtn);
    if (canClaim) {
      this.tweens.add({ targets: chestBtn, scale: 1.04, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    layer.add(makeButton(this, cx, y0 + 470 - 40, 140, 48, '关闭', () => layer.destroy(), { fill: PALETTE.carrot, fontSize: 22 }));
  }

  private showRank(): void {
    const engine = ctx().engine;
    const rank = rankForXp(engine.xp);
    const tier = castleTier(rank.index);
    const pw = Math.min(viewW(this) - 32, 560);
    const { layer, y0, cx } = this.openPanel(pw, 500, rank.title);

    layer.add(
      this.add.text(cx, y0 + 78, `第 ${rank.index + 1} 级 / 共 ${RANKS.length} 级 · 总经验 ${engine.xp}`, textStyle(19, PALETTE.inkSoft)).setOrigin(0.5),
    );

    const barW = pw - 100;
    const barY = y0 + 122;
    const g = this.add.graphics();
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(cx - barW / 2 - 4, barY - 16, barW + 8, 32, 16);
    g.fillStyle(0xeee7cf, 1);
    g.fillRoundedRect(cx - barW / 2, barY - 12, barW, 24, 12);
    if (rank.progress > 0) {
      g.fillStyle(PALETTE.carrot, 1);
      g.fillRoundedRect(cx - barW / 2, barY - 12, Math.max(24, barW * rank.progress), 24, 12);
    }
    layer.add(g);
    layer.add(this.add.text(cx, barY, rank.need ? `${rank.have} / ${rank.need}` : '满级啦', textStyle(18, PALETTE.ink, FONT_EN)).setOrigin(0.5));
    layer.add(
      this.add
        .text(cx, barY + 36, rank.nextTitle ? `再攒 ${rank.need - rank.have} 经验，升级为「${rank.nextTitle}」` : '你已经是守卫之王！', textStyle(19, PALETTE.inkSoft))
        .setOrigin(0.5),
    );

    const cy = y0 + 280;
    const nextTier = Math.min(CASTLE_NAMES.length - 1, tier + 1);
    const tiers = tier === nextTier ? [tier] : [tier, nextTier];
    tiers.forEach((tr, idx) => {
      const px = tiers.length === 1 ? cx : cx + (idx === 0 ? -pw / 4 : pw / 4);
      const castle = makeCastle(this, px, cy, 0.95, tr);
      if (idx === 1) castle.setAlpha(0.4);
      layer.add(castle);
      layer.add(
        this.add
          .text(px, cy + 96, idx === 0 ? `现在：${CASTLE_NAMES[tr]}` : `下一个：${CASTLE_NAMES[tr]}`, textStyle(19, idx === 0 ? PALETTE.ink : PALETTE.inkSoft))
          .setOrigin(0.5),
      );
    });
    if (tiers.length === 2) layer.add(makeIcon(this, 'arrow', cx, cy + 20, 40));

    layer.add(
      this.add
        .text(
          cx,
          y0 + 500 - 84,
          '守住关卡、连击、开宝箱都能拿经验；每升两级，家会变得更气派',
          textStyle(16, PALETTE.inkSoft, undefined, { wordWrap: { width: pw - 60 }, align: 'center' }),
        )
        .setOrigin(0.5),
    );
    layer.add(makeButton(this, cx, y0 + 500 - 40, 140, 48, '关闭', () => layer.destroy(), { fill: PALETTE.carrot, fontSize: 22 }));
  }

  private showOutfits(): void {
    const W = viewW(this);
    const H = viewH(this);
    const portrait = isPortrait(this);
    const known = knownWordCount(ctx().engine);
    const unlocked = unlockedOutfitCount(known);
    const layer = this.add.container(0, 0).setDepth(1000);
    layer.add(this.add.rectangle(W / 2, H / 2, W, H, 0, 0.35).setInteractive());

    const cols = portrait ? 2 : 5;
    const rows = Math.ceil(OUTFITS.length / cols);
    const cellW = portrait ? 300 : 210;
    const pw = cols * cellW + 40;
    const ph = rows * 190 + 150;
    const g = this.add.graphics();
    drawBoard(g, W / 2 - pw / 2, H / 2 - ph / 2, pw, ph, 24);
    layer.add(g);
    layer.add(this.add.text(W / 2, H / 2 - ph / 2 + 36, '小怪装扮', textStyle(32)).setOrigin(0.5));

    const toNext = wordsToNextOutfit(known);
    layer.add(
      this.add
        .text(
          W / 2,
          H / 2 - ph / 2 + 72,
          toNext ? `已认识 ${known} 个词 · 再认识 ${toNext} 个解锁下一个` : `已认识 ${known} 个词 · 全部解锁啦！`,
          textStyle(19, PALETTE.inkSoft),
        )
        .setOrigin(0.5),
    );

    OUTFITS.forEach((name, idx) => {
      const mx = W / 2 - pw / 2 + 20 + cellW / 2 + (idx % cols) * cellW;
      const my = H / 2 - ph / 2 + 110 + Math.floor(idx / cols) * 190 + 95;
      const m = new MonsterView(this, mx, my - 6, -200 - idx, 'apple', idx, 0.8, 'hidden', idx < unlocked ? idx : -1);
      m.disableInteractive();
      if (idx >= unlocked) m.setAlpha(0.35);
      layer.add(m);
      layer.add(
        this.add
          .text(mx, my + 74, idx < unlocked ? name : `${(idx + 1) * 50} 词解锁`, textStyle(17, idx < unlocked ? PALETTE.ink : PALETTE.inkSoft))
          .setOrigin(0.5),
      );
    });

    layer.add(makeButton(this, W / 2, H / 2 + ph / 2 - 4, 140, 48, '关闭', () => layer.destroy(), { fill: PALETTE.carrot, fontSize: 22 }));
  }

  private makeToggles(W: number, y: number): void {
    const c = ctx();
    let musicBtn: Phaser.GameObjects.Container | undefined;
    let sfxBtn: Phaser.GameObjects.Container | undefined;
    const render = () => {
      musicBtn?.destroy();
      sfxBtn?.destroy();
      musicBtn = makeButton(
        this,
        W - 192,
        y,
        112,
        52,
        c.platform.music.muted ? '音乐 关' : '音乐 开',
        () => {
          c.setMusicMuted(!c.platform.music.muted);
          render();
        },
        { fill: c.platform.music.muted ? 0xe6dccb : PALETTE.board, textColor: PALETTE.ink, fontSize: 20 },
      );
      sfxBtn = makeButton(
        this,
        W - 70,
        y,
        112,
        52,
        c.platform.sfx.muted ? '音效 关' : '音效 开',
        () => {
          c.setSfxMuted(!c.platform.sfx.muted);
          render();
        },
        { fill: c.platform.sfx.muted ? 0xe6dccb : PALETTE.board, textColor: PALETTE.ink, fontSize: 20 },
      );
    };
    render();
  }
}
