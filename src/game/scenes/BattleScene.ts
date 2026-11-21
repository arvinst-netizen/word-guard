import Phaser from 'phaser';
import {
  SPELL_STUN,
  TAP_STUN,
  type Battle,
  type BattleEvent,
  type DefeatGain,
  type MonsterState,
} from '../../core/battle/battle';
import { courseArtStage, setArtStage } from '../../core/content/art';
import { COURSES, getLevel, type LevelDef } from '../../core/content/levels';
import { wordById } from '../../core/content/words';
import { limitStatus } from '../../core/parent';
import {
  castleTier,
  collectionCounts,
  isUnitCompleted,
  knownWordCount,
  OUTFITS,
  petState,
  rankForXp,
  unlockedOutfitCount,
} from '../../core/rewards';
import { createRng } from '../../core/rng';
import { createBattleSession } from '../../core/session';
import { track } from '../analytics';
import { ctx } from '../context';
import { computeLayout, type BattleLayout } from '../layout';
import { prefetchArtPictures } from '../pictures';
import {
  drawBackdrop,
  drawBoard,
  FIELD_THEMES,
  FONT_EN,
  FONT_EN_PLAIN,
  FONT_PLAIN,
  hex,
  PALETTE,
  setupCamera,
  textStyle,
  viewH,
  viewW,
  type FieldTheme,
} from '../theme';
import { uiArtKey } from '../ui-art';
import { drawCastleVector, makeCastle } from '../ui/castle';
import { makeIcon } from '../ui/icons';
import { MonsterView, type MonsterLabelMode } from '../ui/monster';
import { PetView } from '../ui/pet';
import { drawHeart, makeButton, makePicture, makeSpeakerButton } from '../ui/widgets';
import type { ResultSceneData } from './ResultScene';

const STREAK_CALLOUTS: [number, string][] = [
  [3, '三连击！'],
  [5, '五连击！太棒了'],
  [8, '八连击！势不可挡'],
  [12, '十二连击！超神'],
  [16, '十六连击！无人能挡'],
  [20, '二十连击！传说'],
];

interface BossVisual {
  c: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Graphics;
  bar: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  img?: Phaser.GameObjects.Image;
}

export interface BattleSceneData {
  levelId: string;
  shield?: boolean;
  resume?: { battle: Battle };
}

export class BattleScene extends Phaser.Scene {
  private level!: LevelDef;
  private battle!: Battle;
  private L!: BattleLayout;
  private views = new Map<number, MonsterView>();
  private running = false;
  private ended = false;
  private introduced = new Set<string>();
  private card?: Phaser.GameObjects.Container;
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private chanceG?: Phaser.GameObjects.Graphics;
  private hintBtn?: Phaser.GameObjects.Container;
  private knownAtStart = 0;
  private albumAtStart = { lit: 0, gold: 0 };
  private petStageAtStart = 0;
  private pet?: PetView;
  private withShield = false;
  private skillUses = 0;
  private skillBtn?: Phaser.GameObjects.Container;
  private skillG?: Phaser.GameObjects.Graphics;
  private shieldIcon?: Phaser.GameObjects.Container;
  private boss?: BossVisual;
  private unitDoneAtStart = false;
  private heartsG!: Phaser.GameObjects.Graphics;
  private hpBar!: Phaser.GameObjects.Container;
  private hpG!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private panel!: Phaser.GameObjects.Container;
  private tiles: Phaser.GameObjects.Container[] = [];
  private overlay?: Phaser.GameObjects.Container;
  private resumeData?: { battle: Battle };
  private hpPulsing = false;

  constructor() {
    super('battle');
  }

  init(data: BattleSceneData): void {
    this.level = getLevel(data.levelId);
    setArtStage(courseArtStage(this.level.course));
    this.resumeData = data.resume;
    this.withShield = !!data.shield;
    this.skillUses = 0;
  }

  create(): void {
    this.running = false;
    this.ended = false;
    if (!this.resumeData && limitStatus(ctx().engine, ctx().platform.now()).over) {
      this.ended = true;
      this.scene.start('menu', { rest: true });
      return;
    }

    setupCamera(this);
    this.views = new Map();
    this.tiles = [];
    this.overlay = undefined;
    this.card = undefined;
    this.introduced = new Set();
    this.hpPulsing = false;
    this.boss = undefined;
    this.skillBtn = undefined;
    this.skillG = undefined;
    this.shieldIcon = undefined;
    this.ended = false;

    this.L = computeLayout(viewW(this), viewH(this));
    prefetchArtPictures(this.level.wordIds.map((id) => wordById(id).picture));
    ctx().platform.speech.prefetch?.(
      this.level.wordIds.flatMap((id) => {
        const w = wordById(id);
        return this.level.cloze && w.sentence ? [w.en, w.sentence.replace(/___/g, w.en)] : [w.en];
      }),
    );

    if (this.resumeData) {
      this.battle = this.resumeData.battle;
    } else {
      this.knownAtStart = knownWordCount(ctx().engine);
      this.albumAtStart = collectionCounts(ctx().engine);
      this.petStageAtStart = petState(ctx().engine)?.stage ?? 0;
      this.unitDoneAtStart =
        this.level.unit !== undefined && isUnitCompleted(ctx().engine, this.level.course, this.level.unit);
      const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
      this.battle = createBattleSession(this.level, ctx().engine, createRng(seed), () => ctx().platform.now(), {
        shield: this.withShield ? 1 : 0,
      });
    }

    this.drawField();
    this.drawTopBar();
    this.panel = this.add.container(0, 0).setDepth(20);
    this.renderPanel();

    for (const m of this.battle.monsters) this.spawnView(m, false);
    this.refreshHighlights();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ctx().save();
      this.events.off('app-hidden');
    });
    this.events.on('app-hidden', () => {
      ctx().save();
      if (this.running) this.showPause();
    });

    if (this.resumeData) this.showPause();
    else this.showIntro();
  }

  getResumeData(): BattleSceneData {
    return {
      levelId: this.level.id,
      resume: this.ended ? undefined : { battle: this.battle },
    };
  }

  override update(_time: number, delta: number): void {
    if (!this.running || this.ended || this.card) return;
    this.battle.update(delta / 1000);
    for (const ev of this.battle.drainEvents()) this.handle(ev);

    for (const m of this.battle.monsters) {
      const view = this.views.get(m.id);
      if (!view) continue;
      const pos = this.L.pos(m.lane, m.x);
      view.x += (pos.x - view.x) * Math.min(1, delta / 70);
      view.y += (pos.y - view.y) * Math.min(1, delta / 70);
      view.setDepth(10 + (this.L.portrait ? pos.y / 2000 : pos.y / 1000));
    }
    this.updateMusic();
  }

  private updateMusic(): void {
    const danger = this.battle.monsters.some((m) => !m.decoy && m.x < 0.35);
    ctx().platform.music.setMood(danger ? 'danger' : 'battle');
  }

  private drawField(): void {
    const { field, base, portrait } = this.L;
    const theme = this.fieldTheme();
    drawBackdrop(this, { sky: false, theme });

    const g = this.add.graphics();
    for (let i = 0; i < 4; i++) {
      g.fillStyle(i % 2 === 0 ? theme.a : theme.b, 1);
      if (portrait) g.fillRect((field.w / 4) * i, field.y, field.w / 4 + 1, field.h);
      else g.fillRect(field.x - 30, field.y + (field.h / 4) * i, field.w + 60, field.h / 4 + 1);
    }
    g.lineStyle(4, theme.edge, 1);
    if (portrait) g.strokeRect(-4, field.y, field.w + 8, field.h);
    else g.strokeRect(field.x - 30, field.y, field.w + 60, field.h);

    const rnd = new Phaser.Math.RandomDataGenerator(['grass']);
    for (let i = 0; i < 46; i++) {
      const gx = field.x + rnd.between(0, field.w);
      const gy = field.y + rnd.between(10, field.h - 10);
      const big = i % 5 === 0;
      if (theme.deco === 'snow') {
        g.fillStyle(0xffffff, 0.95);
        g.fillEllipse(gx, gy, big ? 30 : 16, big ? 12 : 7);
        g.fillStyle(theme.edge, 0.5);
        g.fillEllipse(gx, gy + 3, big ? 26 : 12, 3);
      } else if (theme.deco === 'shell' && big) {
        g.fillStyle(i % 2 ? 0xffb3a1 : 0xfff3c0, 1);
        g.fillCircle(gx, gy, 6);
        g.lineStyle(2, theme.edge, 1);
        g.strokeCircle(gx, gy, 6);
      } else if (theme.deco === 'shell') {
        g.fillStyle(theme.edge, 0.55);
        g.fillCircle(gx, gy, 2.5);
        g.fillCircle(gx + 7, gy + 3, 2);
      } else {
        g.fillStyle(theme.edge, 0.8);
        g.fillTriangle(gx - 5, gy, gx, gy - 12, gx + 2, gy);
        g.fillTriangle(gx, gy, gx + 6, gy - 10, gx + 8, gy);
        if (big && theme.deco === 'flower') {
          g.fillStyle([0xff8fa3, 0xffffff, 0xffd34d][i % 3], 1);
          for (let k = 0; k < 5; k++) {
            g.fillCircle(gx + Math.cos((k / 5) * 6.283) * 5, gy - 16 + Math.sin((k / 5) * 6.283) * 5, 3.5);
          }
          g.fillStyle(0xffb020, 1);
          g.fillCircle(gx, gy - 16, 3);
        }
        if (big && theme.deco === 'mushroom') {
          g.fillStyle(0xfff4dc, 1);
          g.fillRoundedRect(gx - 3, gy - 12, 6, 12, 2);
          g.fillStyle(0xe0484d, 1);
          g.slice(gx, gy - 11, 10, Math.PI, 0, false);
          g.fillPath();
          g.fillStyle(0xffffff, 1);
          g.fillCircle(gx - 4, gy - 15, 2);
          g.fillCircle(gx + 3, gy - 17, 1.6);
        }
      }
    }

    g.fillStyle(PALETTE.soil, 1);
    g.fillRect(base.x, base.y, base.w, base.h);
    g.fillStyle(PALETTE.soilDark, 0.6);
    for (let i = 0; i < 18; i++) {
      g.fillCircle(base.x + rnd.between(8, base.w - 8), base.y + rnd.between(8, base.h - 8), rnd.between(2, 5));
    }

    this.drawHouse(g);
    this.drawFence(g);
  }

  private fieldTheme(): FieldTheme {
    const lvl = this.level;
    if (lvl.boss) return FIELD_THEMES[4];
    if (lvl.unit === undefined) return FIELD_THEMES[0];
    const courseIdx = Math.max(0, COURSES.findIndex((c) => c.id === lvl.course));
    return FIELD_THEMES[(Math.floor(lvl.unit / 2) + courseIdx) % FIELD_THEMES.length];
  }

  private drawHouse(g: Phaser.GameObjects.Graphics): void {
    const { x, y } = this.L.launcher;
    const sc = this.L.portrait ? 0.8 : 1;
    const tier = castleTier(rankForXp(ctx().engine.xp).index);
    if (uiArtKey('castle-' + tier)) {
      makeCastle(this, x, y, sc, tier).setDepth(g.depth + 0.5);
    } else {
      drawCastleVector(g, x, y, sc, tier);
    }
  }

  private drawFence(g: Phaser.GameObjects.Graphics): void {
    const { base, portrait } = this.L;
    g.fillStyle(0xf8ebb4, 1);
    g.lineStyle(3, PALETTE.ink, 1);
    if (portrait) {
      const fy = base.y + 4;
      for (let x = 10; x < base.w - 10; x += 34) {
        g.fillRoundedRect(x, fy - 14, 30, 14, 4);
        g.strokeRoundedRect(x, fy - 14, 30, 14, 4);
      }
    } else {
      const fx = base.x + base.w - 18;
      for (let y = base.y + 10; y < base.y + base.h - 10; y += 34) {
        g.fillRoundedRect(fx - 7, y, 14, 30, 4);
        g.strokeRoundedRect(fx - 7, y, 14, 30, 4);
      }
    }
  }

  private drawTopBar(): void {
    const { top, W, field, portrait } = this.L;
    makeButton(this, 66, top.y + top.h / 2, 104, 54, '暂停', () => this.showPause(), {
      fill: PALETTE.board,
      textColor: PALETTE.ink,
      fontSize: 24,
    }).setDepth(30);

    const title = this.add
      .text(W / 2, top.y + top.h / 2 - (portrait ? 12 : 0), this.level.title, textStyle(portrait ? 30 : 32))
      .setOrigin(0.5)
      .setDepth(30);
    const heartLeft = W - 54 - (this.battle.maxHearts - 1) * 48 - 30;
    const maxHalf = Math.min(W / 2 - 130, heartLeft - (portrait ? 0 : 140) - W / 2);
    if (title.width > maxHalf * 2) title.setScale((maxHalf * 2) / title.width);

    this.progressText = this.add
      .text(
        portrait ? W / 2 : W / 2 + title.displayWidth / 2 + 24,
        portrait ? top.y + top.h / 2 + 22 : top.y + top.h / 2 + 2,
        '',
        textStyle(20, PALETTE.inkSoft),
      )
      .setOrigin(portrait ? 0.5 : 0, 0.5)
      .setDepth(30);

    this.heartsG = this.add.graphics().setDepth(30);
    this.scoreText = this.add
      .text(
        W - 22,
        top.y + top.h - 13,
        '',
        textStyle(22, PALETTE.carrotDark, undefined, { stroke: '#fff4dc', strokeThickness: 5 }),
      )
      .setOrigin(1, 0.5)
      .setDepth(30);

    this.comboText = this.add
      .text(
        field.x + field.w / 2,
        field.y + 30,
        '',
        textStyle(34, PALETTE.carrot, undefined, { stroke: '#ffffff', strokeThickness: 8 }),
      )
      .setOrigin(0.5)
      .setDepth(60)
      .setVisible(false);

    this.makeCastleHp();
    this.makeSkillButton();
    this.makeShieldIcon();
    this.makePet();
    if (this.level.boss) this.makeBoss();
    this.redrawTop();
    this.refreshScore(false);
    this.refreshCombo(false);
  }

  private makePet(): void {
    this.pet = undefined;
    const pet = petState(ctx().engine);
    if (!pet) return;
    const { launcher, portrait, W, field, base } = this.L;
    const px = portrait ? W / 2 + 112 : launcher.x + 2;
    const py = portrait ? base.y + base.h - 6 : field.y + field.h - 8;
    this.pet = new PetView(this, px, py, pet.kind, pet.stage, portrait ? 0.56 : 0.6, {
      crack: pet.stage === 0 ? Math.min(2, pet.points) : 0,
    }).setDepth(15);
  }

  private makeSkillButton(): void {
    const { launcher, portrait, W, field } = this.L;
    const sx = portrait ? W / 2 + 214 : launcher.x - 4;
    const sy = portrait ? launcher.y + 20 : Math.min(field.y + field.h - (ctx().engine.data.pet ? 150 : 58), launcher.y + 150);
    const rad = portrait ? 46 : 36;
    const c = this.add.container(sx, sy).setDepth(16);
    this.skillG = this.add.graphics();
    c.add(this.skillG);
    if (uiArtKey('icon-snow')) {
      c.add(makeIcon(this, 'snow', 0, 0, rad * 1.3));
    } else {
      c.add(makeIcon(this, 'snow', 0, 0, rad * 1.35, PALETTE.ink));
      c.add(makeIcon(this, 'snow', 0, -1, rad * 1.2, 0xffffff));
    }
    c.add(
      this.add
        .text(0, rad + 14, '冰冻', textStyle(portrait ? 20 : 16, PALETTE.ink, undefined, { stroke: '#fff4dc', strokeThickness: 5 }))
        .setOrigin(0.5),
    );
    c.setSize(rad * 2 + 16, rad * 2 + 16);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => {
      if (!this.running || this.ended || this.card) return;
      if (this.battle.skillReady) {
        this.battle.useSkill();
        this.skillUses++;
      } else {
        this.tweens.add({ targets: c, x: c.x + 5, duration: 40, yoyo: true, repeat: 2 });
      }
    });
    this.skillBtn = c;
    this.refreshSkill();
  }

  private refreshSkill(): void {
    const g = this.skillG;
    const btn = this.skillBtn;
    if (!g || !btn) return;
    const rad = this.L.portrait ? 46 : 36;
    const energy = this.battle.energy;
    const ready = this.battle.skillReady;
    g.clear();
    g.fillStyle(PALETTE.ink, 1);
    g.fillCircle(0, 0, rad + 5);
    g.fillStyle(ready ? 0x48b8f2 : 0x9fb8c4, 1);
    g.fillCircle(0, 0, rad);
    for (let i = 0; i < 5; i++) {
      const a0 = -Math.PI / 2 + (i / 5) * Math.PI * 2 + 0.08;
      const a1 = -Math.PI / 2 + ((i + 1) / 5) * Math.PI * 2 - 0.08;
      g.lineStyle(7, i < energy ? PALETTE.sun : 0x5d6e7a, 1);
      g.beginPath();
      g.arc(0, 0, rad - 6, a0, a1);
      g.strokePath();
    }
    this.tweens.killTweensOf(btn);
    btn.setScale(1);
    if (ready) {
      this.tweens.add({ targets: btn, scale: 1.1, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  private freezeFx(seconds: number): void {
    const { field, W } = this.L;
    ctx().platform.sfx.play('streak', 1.5);
    ctx().platform.haptic?.(60);
    const tint = this.add.rectangle(field.x + field.w / 2, field.y + field.h / 2, field.w, field.h, 0x8fdcff, 0.34).setDepth(12);
    this.tweens.add({
      targets: tint,
      alpha: 0,
      delay: seconds * 1000 - 600,
      duration: 600,
      onComplete: () => tint.destroy(),
    });
    for (let i = 0; i < 16; i++) {
      const flake = makeIcon(this, 'snow', 0, 0, 18 + Math.random() * 22)
        .setPosition(field.x + Math.random() * field.w, field.y + Math.random() * field.h)
        .setDepth(13)
        .setAlpha(0.9);
      this.tweens.add({
        targets: flake,
        y: flake.y + 40,
        alpha: 0,
        angle: 120,
        duration: seconds * 1000,
        onComplete: () => flake.destroy(),
      });
    }
    this.floatText(W / 2, field.y + field.h * 0.4, '冰冻！小怪动不了啦', 0x2f8fd0, 40, 900);
    this.refreshSkill();
  }

  private makeShieldIcon(): void {
    if (this.battle.shield <= 0) return;
    const { W, top, field, portrait } = this.L;
    const maxH = this.battle.maxHearts;
    const c = portrait
      ? this.add.container(36, field.y + 70).setDepth(30)
      : this.add.container(W - 54 - maxH * 48 + 2, top.y + top.h / 2 - 12).setDepth(30);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(-17, -19, 34, 26, 6);
    g.fillTriangle(-17, 4, 17, 4, 0, 23);
    g.fillStyle(0x5b8def, 1);
    g.fillRoundedRect(-13, -15, 26, 20, 4);
    g.fillTriangle(-13, 3, 13, 3, 0, 17);
    g.fillStyle(0xffffff, 0.5);
    g.fillRect(-9, -11, 6, 12);
    c.add(g);
    this.shieldIcon = c;
  }

  private shieldFx(): void {
    ctx().platform.sfx.play('pop');
    const icon = this.shieldIcon;
    this.shieldIcon = undefined;
    if (!icon) return;
    this.floatText(icon.x - 30, icon.y + 70, '护盾挡住了！', 0x3a6fd8, 28, 900);
    this.tweens.add({ targets: icon, scale: 2.2, alpha: 0, duration: 420, onComplete: () => icon.destroy() });
  }

  private makeBoss(): void {
    const { field, portrait, W } = this.L;
    const bx = portrait ? W / 2 : field.x + field.w - 74;
    const by = portrait ? field.y + 96 : field.y + field.h / 2 + 10;
    const c = this.add.container(bx, by).setDepth(6);
    const body = this.add.graphics();
    c.add(body);
    const img = uiArtKey('boss') ? this.add.image(0, 0, 'ui:boss') : undefined;
    if (img) c.add(img);

    const barW = portrait ? 420 : 380;
    const cx = field.x + field.w / 2;
    const bar = this.add.graphics().setDepth(58);
    bar.setPosition(cx - barW / 2, field.y + 12);
    const label = this.add
      .text(cx - barW / 2 - 10, field.y + 23, 'Boss', textStyle(22, PALETTE.bad, FONT_EN, { stroke: '#ffffff', strokeThickness: 6 }))
      .setOrigin(1, 0.5)
      .setDepth(58);

    this.boss = { c, body, bar, label, img };
    this.comboText.setY(field.y + 66);
    this.tweens.add({ targets: c, y: by - 8, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.drawBoss();
  }

  private drawBoss(): void {
    const b = this.boss;
    if (!b) return;
    const enraged = this.battle.enraged;
    const s = this.L.portrait ? 1.25 : 1.5;
    const g = b.body;
    g.clear();
    if (b.img) {
      b.img.setTexture(enraged && uiArtKey('boss-angry') ? 'ui:boss-angry' : 'ui:boss').setDisplaySize(170 * s, 170 * s);
      this.drawBossBar();
      return;
    }
    const fill = enraged ? 0xd8433f : 0x7a53c9;
    g.fillStyle(PALETTE.ink, 1);
    g.fillTriangle(-46 * s, -34 * s, -22 * s, -46 * s, -40 * s, -78 * s);
    g.fillTriangle(46 * s, -34 * s, 22 * s, -46 * s, 40 * s, -78 * s);
    g.fillStyle(0xfff0d0, 1);
    g.fillTriangle(-42 * s, -40 * s, -28 * s, -46 * s, -39 * s, -68 * s);
    g.fillTriangle(42 * s, -40 * s, 28 * s, -46 * s, 39 * s, -68 * s);
    g.fillStyle(PALETTE.ink, 1);
    g.fillEllipse(0, 0, 124 * s, 110 * s);
    g.fillStyle(fill, 1);
    g.fillEllipse(0, 0, 114 * s, 100 * s);
    g.fillStyle(0xffffff, 0.18);
    g.fillEllipse(-22 * s, -24 * s, 40 * s, 22 * s);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(-22 * s, -6 * s, 15 * s);
    g.fillCircle(22 * s, -6 * s, 15 * s);
    g.fillStyle(enraged ? 0xffd23f : PALETTE.ink, 1);
    g.fillCircle(-19 * s, -4 * s, 7 * s);
    g.fillCircle(19 * s, -4 * s, 7 * s);
    g.lineStyle(7 * s, PALETTE.ink, 1);
    g.lineBetween(-40 * s, -30 * s, -8 * s, -18 * s);
    g.lineBetween(40 * s, -30 * s, 8 * s, -18 * s);
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(-26 * s, 18 * s, 52 * s, 18 * s, 8 * s);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(-18 * s, 18 * s, -8 * s, 18 * s, -13 * s, 30 * s);
    g.fillTriangle(8 * s, 18 * s, 18 * s, 18 * s, 13 * s, 30 * s);
    this.drawBossBar();
  }

  private drawBossBar(): void {
    const b = this.boss;
    if (!b) return;
    const enraged = this.battle.enraged;
    const total = this.level.monsters;
    const hp = this.battle.bossHp;
    const barW = this.L.portrait ? 420 : 380;
    const segW = (barW - (total - 1) * 4) / total;
    const g = b.bar;
    g.clear();
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(-6, -5, barW + 12, 32, 12);
    for (let i = 0; i < total; i++) {
      g.fillStyle(i < hp ? (enraged ? PALETTE.bad : 0x9b6be0) : 0x5a4a44, 1);
      g.fillRoundedRect(i * (segW + 4), 0, segW, 22, 5);
    }
  }

  private hitBoss(fromX: number, fromY: number): void {
    const b = this.boss;
    if (!b) return;
    const star = this.add.star(fromX, fromY, 5, 8, 18, PALETTE.sun).setStrokeStyle(3, PALETTE.ink).setDepth(46);
    this.tweens.add({
      targets: star,
      x: b.c.x,
      y: b.c.y,
      angle: 360,
      duration: 260,
      onComplete: () => {
        star.destroy();
        if (!b.c.active) return;
        this.drawBoss();
        ctx().platform.sfx.play('leak', 1.6);
        this.tweens.add({ targets: b.c, x: b.c.x + 10, duration: 45, yoyo: true, repeat: 3 });
        this.tweens.add({ targets: b.bar, scaleY: 1.3, duration: 80, yoyo: true });
      },
    });
  }

  private bossEnrage(): void {
    this.drawBoss();
    const { W, field } = this.L;
    ctx().platform.sfx.play('lose', 1.4);
    ctx().platform.haptic?.([60, 40, 60]);
    this.cameras.main.shake(300, 0.008);
    this.floatText(W / 2, field.y + field.h * 0.72, 'Boss 狂暴了！小怪变快了', PALETTE.bad, 40, 1100);
    if (this.boss) {
      this.tweens.add({ targets: this.boss.c, scale: 1.12, duration: 300, yoyo: true, repeat: 2 });
    }
  }

  private bossDown(): void {
    const b = this.boss;
    if (!b) return;
    this.boss = undefined;
    const { x, y } = b.c;
    this.tweens.killTweensOf(b.c);
    ctx().platform.sfx.play('record');
    ctx().platform.haptic?.([40, 30, 40, 30, 120]);
    this.cameras.main.shake(400, 0.01);
    this.tweens.add({ targets: b.c, scale: 1.6, alpha: 0, angle: 20, duration: 500, onComplete: () => b.c.destroy() });
    this.tweens.add({ targets: [b.bar, b.label], alpha: 0, duration: 400 });
    for (let i = 0; i < 46; i++) {
      const col = Phaser.Utils.Array.GetRandom([PALETTE.sun, PALETTE.carrot, 0x9b6be0, 0xffffff, PALETTE.good]);
      const p =
        i % 2
          ? this.add.star(x, y, 5, 6, 14, col).setDepth(88)
          : this.add.circle(x, y, Phaser.Math.Between(5, 11), col).setDepth(88);
      const a = Math.random() * Math.PI * 2;
      const dist = 80 + Math.random() * 240;
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist,
        alpha: 0,
        angle: 360,
        duration: 700 + Math.random() * 600,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  private refreshScore(pop: boolean): void {
    this.scoreText.setText(`${this.battle.score} 分`);
    if (pop) {
      this.tweens.killTweensOf(this.scoreText);
      this.scoreText.setScale(1.35);
      this.tweens.add({ targets: this.scoreText, scale: 1, duration: 260, ease: 'Back.easeOut' });
    }
  }

  private refreshCombo(pop: boolean): void {
    const combo = this.battle.combo;
    const t = this.comboText;
    this.tweens.killTweensOf(t);
    if (combo < 2) {
      if (t.visible) {
        this.tweens.add({ targets: t, alpha: 0, scale: 0.6, duration: 180, onComplete: () => t.setVisible(false) });
      }
      return;
    }
    t.setText(`连击 ×${combo}`).setVisible(true).setAlpha(1);
    t.setColor(hex(combo >= 8 ? PALETTE.bad : combo >= 5 ? PALETTE.carrotDark : PALETTE.carrot));
    const base = Math.min(1.35, 1 + combo * 0.03);
    if (pop) {
      t.setScale(base * 1.5);
      this.tweens.add({ targets: t, scale: base, duration: 240, ease: 'Back.easeOut' });
    } else {
      t.setScale(base);
    }
  }

  private redrawTop(): void {
    const { W, top } = this.L;
    this.heartsG.clear();
    const maxH = this.battle.maxHearts;
    for (let i = 0; i < maxH; i++) {
      drawHeart(
        this.heartsG,
        W - 54 - (maxH - 1 - i) * 48,
        top.y + top.h / 2 - 12,
        0.92,
        Math.max(0, Math.min(1, this.battle.hearts - i)),
      );
    }
    const defeated = this.battle.answers.filter((a) => a.outcome !== 'missed').length;
    this.progressText.setText(`击退 ${defeated} / ${this.level.monsters}`);
    this.drawCastleHp();
  }

  private makeCastleHp(): void {
    const { launcher, portrait, W } = this.L;
    const hx = portrait ? W / 2 - 210 : launcher.x - 20;
    const hy = portrait ? launcher.y + 14 : launcher.y - 104;
    this.hpBar = this.add.container(hx, hy).setDepth(15).setScale(portrait ? 1.5 : 1);
    this.hpG = this.add.graphics();
    this.hpText = this.add
      .text(0, -24, '', textStyle(18, PALETTE.ink, undefined, { stroke: '#fff4dc', strokeThickness: 5 }))
      .setOrigin(0.5);
    this.hpBar.add([this.hpG, this.hpText]);
  }

  private drawCastleHp(): void {
    const hp = Math.max(0, this.battle.hearts);
    const maxH = this.battle.maxHearts;
    const segW = maxH > 3 ? 32 : 40;
    const totalW = maxH * segW + (maxH - 1) * 6;
    const g = this.hpG;
    g.clear();
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(-totalW / 2 - 6, -15, totalW + 12, 30, 10);
    const fillCol = hp >= maxH ? PALETTE.good : hp <= 1 ? PALETTE.bad : 0xf2a93b;
    for (let i = 0; i < maxH; i++) {
      const sx = -totalW / 2 + i * (segW + 6);
      const frac = Math.max(0, Math.min(1, hp - i));
      g.fillStyle(0x6b5340, 1);
      g.fillRoundedRect(sx, -10, segW, 20, 6);
      if (frac > 0) {
        g.fillStyle(fillCol, 1);
        g.fillRoundedRect(sx, -10, segW * frac, 20, frac < 1 ? { tl: 6, bl: 6, tr: 0, br: 0 } : 6);
        g.fillStyle(0xffffff, 0.35);
        g.fillRoundedRect(sx + 4, -7, Math.max(4, segW * frac - 8), 5, 3);
      }
    }
    const numStr = Number.isInteger(hp) ? String(hp) : hp.toFixed(1);
    this.hpText.setText(hp > 0 ? `城堡血量 ${numStr}/${maxH}` : '城堡失守');
    this.hpText.setColor(hex(hp <= 1 ? PALETTE.bad : PALETTE.ink));
  }

  private hurtCastle(): void {
    this.pet?.flinch();
    const bar = this.hpBar;
    const bx = bar.x;
    this.tweens.add({ targets: bar, x: bx + 6, duration: 50, yoyo: true, repeat: 3, onComplete: () => bar.setX(bx) });
    const sc = bar.scaleX;
    const flash = this.add.graphics().setDepth(16);
    flash.fillStyle(PALETTE.bad, 0.5);
    flash.fillRoundedRect(bar.x - 80 * sc, bar.y - 16 * sc, 160 * sc, 32 * sc, 12);
    this.tweens.add({ targets: flash, alpha: 0, duration: 600, onComplete: () => flash.destroy() });
    if (this.battle.hearts > 0 && this.battle.hearts <= 1 && !this.hpPulsing) {
      this.hpPulsing = true;
      this.tweens.add({ targets: bar, scale: sc * 1.1, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  private renderPanel(): void {
    this.panel.removeAll(true);
    this.tiles = [];
    this.chanceG = undefined;
    this.hintBtn = undefined;
    const { panel, portrait } = this.L;
    const bg = this.add.graphics();
    drawBoard(bg, panel.x, panel.y, panel.w, panel.h, 22);
    this.panel.add(bg);

    const call = this.battle.call;
    if (this.battle.mode !== 'reverse') {
      const sz = portrait ? 96 : 84;
      const sx = panel.x + 24 + sz / 2;
      const sy = portrait ? panel.y + 26 + sz / 2 : panel.y + panel.h / 2 - 12;
      this.panel.add(makeSpeakerButton(this, sx, sy, sz, () => this.sayCurrent()));
      this.panel.add(this.add.text(sx, sy + sz / 2 + 14, '再听一遍', textStyle(16, PALETTE.inkSoft)).setOrigin(0.5));
    }

    if (call) {
      if (this.battle.mode === 'listen') this.renderListenPanel();
      else if (this.battle.mode === 'reverse') this.renderReversePanel();
      else this.renderSpellPanel();
    } else {
      const msg = this.battle.monsters.length === 0 ? '小怪要来啦……' : '准备……';
      this.panel.add(this.add.text(panel.x + panel.w / 2, panel.y + panel.h / 2, msg, textStyle(30, PALETTE.inkSoft)).setOrigin(0.5));
    }
  }

  private renderClozePanel(): void {
    const { panel, portrait } = this.L;
    const w = wordById(this.battle.call!.wordId);
    const cx = panel.x + panel.w / 2;
    const maxW = panel.w - (portrait ? 60 : 120);
    const cy = portrait ? panel.y + panel.h * 0.34 : panel.y + panel.h / 2 - 22;
    const sentence = w.sentence!.replace(/___/g, '______');
    const txt = this.add
      .text(cx, cy, sentence, textStyle(portrait ? 40 : 36, PALETTE.ink, FONT_EN, { align: 'center', wordWrap: { width: maxW } }))
      .setOrigin(0.5);
    const maxH = portrait ? panel.h * 0.48 : panel.h * 0.56;
    if (txt.height > maxH) txt.setScale(maxH / txt.height);
    this.panel.add(txt);
    this.panel.add(
      this.add
        .text(cx, cy + txt.displayHeight / 2 + (portrait ? 34 : 24), `意思：${w.short} · 点能填进空格的英文`, textStyle(portrait ? 24 : 20, PALETTE.inkSoft, FONT_PLAIN))
        .setOrigin(0.5),
    );
  }

  private renderReversePanel(): void {
    const { panel, portrait } = this.L;
    const w = wordById(this.battle.call!.wordId);
    if (this.level.cloze && w.sentence) {
      this.renderClozePanel();
      return;
    }
    const cx = panel.x + panel.w / 2;
    const cy = portrait ? panel.y + panel.h * 0.36 : panel.y + panel.h / 2 - 16;
    const zh = this.add.text(cx, cy, w.zh, textStyle(portrait ? 64 : 56, PALETTE.ink, FONT_PLAIN)).setOrigin(0.5);
    while (zh.width > panel.w - 260 && zh.style.fontSize && parseInt(String(zh.style.fontSize)) > 28) {
      zh.setFontSize(parseInt(String(zh.style.fontSize)) - 4);
    }
    this.panel.add(zh);
    if (w.picture) this.panel.add(makePicture(this, cx - zh.width / 2 - 56, cy, w.picture, portrait ? 60 : 50));
    this.panel.add(
      this.add.text(cx, cy + (portrait ? 70 : 52), '找到举着它英文的小怪，点它！', textStyle(20, PALETTE.inkSoft)).setOrigin(0.5),
    );
  }

  private renderListenPanel(): void {
    const { panel, portrait } = this.L;
    const call = this.battle.call!;
    const cx = panel.x + panel.w / 2 + (portrait ? 0 : 20);
    if (this.level.showText || !ctx().platform.speech.available) {
      const cy = portrait ? panel.y + panel.h * 0.42 : panel.y + panel.h / 2 - 14;
      this.panel.add(this.add.text(cx, cy, wordById(call.wordId).en, textStyle(portrait ? 78 : 70, PALETTE.ink, FONT_EN)).setOrigin(0.5));
      this.panel.add(this.add.text(cx, cy + (portrait ? 64 : 50), '找到举着它的小怪，点它！', textStyle(20, PALETTE.inkSoft)).setOrigin(0.5));
    } else {
      const cy = portrait ? panel.y + panel.h * 0.42 : panel.y + panel.h / 2 - 12;
      const wave = this.add.graphics();
      this.panel.add(wave);
      const drawWave = (t: number) => {
        wave.clear();
        wave.fillStyle(PALETTE.carrot, 1);
        for (let i = 0; i < 9; i++) {
          const h = 14 + Math.abs(Math.sin(t / 180 + i * 0.7)) * 40;
          wave.fillRoundedRect(cx - 110 + i * 26, cy - h / 2, 14, h, 7);
        }
      };
      drawWave(0);
      const timer = this.time.addEvent({ delay: 50, loop: true, callback: () => drawWave(this.time.now) });
      wave.once(Phaser.GameObjects.Events.DESTROY, () => timer.remove());
      this.panel.add(this.add.text(cx, cy + (portrait ? 64 : 48), '听一听，是哪一个？', textStyle(22, PALETTE.inkSoft)).setOrigin(0.5));
    }
  }

  private renderSpellPanel(): void {
    const { panel, portrait } = this.L;
    const call = this.battle.call!;
    const wordId = call.wordId;
    const masked = wordId
      .split('')
      .map((ch, i) => (!call.blank[i] || i < call.progress ? ch : '_'))
      .join(' ');
    const cx = panel.x + panel.w / 2;
    const maskY = portrait ? panel.y + 150 : panel.y + 34;
    const w = wordById(wordId);
    const clueX = portrait ? cx : panel.x + 190;
    const clueY = portrait ? panel.y + 74 : panel.y + 34;

    if (this.level.dictation && ctx().platform.speech.available) {
      this.panel.add(makeSpeakerButton(this, clueX, clueY, portrait ? 84 : 60, () => this.sayCurrent(true)));
    } else {
      const clue = w.picture
        ? makePicture(this, clueX, clueY, w.picture, portrait ? 64 : 40)
        : this.add.text(clueX, clueY, w.short, textStyle(portrait ? 40 : 28, PALETTE.ink, FONT_PLAIN)).setOrigin(0.5);
      const maxClueW = portrait ? 400 : 200;
      if ('width' in clue && typeof clue.width === 'number' && clue.width > maxClueW && 'setScale' in clue) {
        (clue as Phaser.GameObjects.Text).setScale(maxClueW / clue.width);
      }
      this.panel.add(clue);
    }

    this.panel.add(
      this.add.text(cx, maskY, masked, textStyle(portrait ? 56 : 44, PALETTE.ink, FONT_EN, { letterSpacing: 4 })).setOrigin(0.5),
    );

    const n = call.tiles.length;
    const tileSz = portrait ? 66 : 62;
    const gap = portrait ? 10 : 12;
    const perRow = n * tileSz + (n - 1) * gap > panel.w - (portrait ? 40 : 360) ? Math.ceil(n / 2) : n;
    const rows = Math.ceil(n / perRow);
    const y0 = portrait ? panel.y + 196 + tileSz / 2 : panel.y + 98;

    call.tiles.forEach((tile, i) => {
      const r = Math.floor(i / perRow);
      const rowCount = r === rows - 1 ? n - r * perRow : perRow;
      const col = i - r * perRow;
      const rowW = rowCount * tileSz + (rowCount - 1) * gap;
      const tx = cx - rowW / 2 + tileSz / 2 + col * (tileSz + gap);
      const ty = y0 + r * (tileSz + gap);
      const btn = makeButton(this, tx, ty, tileSz, tileSz, tile.ch, () => this.battle.tapTile(i), {
        fill: tile.used ? 0xd9cdb0 : PALETTE.white,
        textColor: tile.used ? 0xb7a88c : PALETTE.ink,
        fontSize: portrait ? 44 : 38,
        disabled: tile.used,
        radius: 14,
      });
      this.tiles.push(btn);
      this.panel.add(btn);
    });

    const hx = panel.x + panel.w - (portrait ? 90 : 84);
    const hy = portrait ? panel.y + 74 : panel.y + panel.h / 2;
    this.hintBtn = makeButton(this, hx, hy, portrait ? 130 : 120, 56, '提示', () => this.battle.hint(), {
      fill: PALETTE.sun,
      textColor: PALETTE.ink,
      fontSize: 24,
    });
    this.panel.add(this.hintBtn);

    const chY = portrait ? hy + 52 : hy - 46;
    this.panel.add(this.add.text(hx - 44, chY, '机会', textStyle(15, PALETTE.inkSoft)).setOrigin(0.5));
    this.chanceG = this.add.graphics().setPosition(hx + 18, chY);
    this.panel.add(this.chanceG);
    this.drawChances();
  }

  private drawChances(): void {
    const call = this.battle.call;
    const g = this.chanceG;
    if (!call || !g) return;
    g.clear();
    const total = call.maxWrongs;
    const left = Math.max(0, total - call.wrongs);
    for (let i = 0; i < total; i++) {
      const dx = (i - (total - 1) / 2) * 20;
      g.fillStyle(PALETTE.ink, 1);
      g.fillCircle(dx, 0, 8);
      g.fillStyle(i < left ? (left === 1 ? PALETTE.bad : PALETTE.carrot) : 0xd9cdb0, 1);
      g.fillCircle(dx, 0, 5.5);
    }
    this.hintBtn?.setAlpha(this.battle.canHint ? 1 : 0.4);
  }

  private showFailBanner(wordId: string, seconds: number, isSpell: boolean, shielded = false): void {
    const { panel, portrait } = this.L;
    const w = wordById(wordId);
    const x = panel.x + 10;
    const y = panel.y + 8;
    const bw = panel.w - 20;
    const bh = panel.h - 16;
    const cx = panel.x + panel.w / 2;
    const cy = panel.y + panel.h / 2;

    const g = this.add.graphics();
    g.fillStyle(PALETTE.board, 0.97);
    g.fillRoundedRect(x, y, bw, bh, 18);
    this.panel.add(g);

    const sub = `${shielded ? '护盾挡住了，没扣心' : '扣半颗心'} · 它溜走了，等会儿还会回来`;
    this.panel.add(
      this.add.text(cx, cy - (portrait ? 96 : 46), isSpell ? '没拼出来，正确的拼法是' : '点错啦，正确的是', textStyle(portrait ? 24 : 18, PALETTE.bad)).setOrigin(0.5),
    );
    const en = this.add
      .text(cx, cy - (portrait ? 30 : 10), isSpell ? w.en.split('').join(' ') : w.en, textStyle(portrait ? 64 : 42, PALETTE.ink, FONT_EN))
      .setOrigin(0.5);
    if (en.width > bw - 60) en.setScale((bw - 60) / en.width);
    this.panel.add(en);

    const zh = this.add
      .text(cx + (w.picture ? 22 : 0), cy + (portrait ? 40 : 30), portrait ? w.zh : `${w.short} · ${sub}`, textStyle(portrait ? 28 : 18, PALETTE.inkSoft, FONT_EN_PLAIN))
      .setOrigin(0.5);
    if (zh.width > bw - 140) zh.setScale((bw - 140) / zh.width);
    this.panel.add(zh);
    if (w.picture) this.panel.add(makePicture(this, zh.x - zh.displayWidth / 2 - 26, zh.y, w.picture, portrait ? 40 : 30));
    if (portrait) this.panel.add(this.add.text(cx, cy + 96, sub, textStyle(18, PALETTE.inkSoft)).setOrigin(0.5));

    const bar = this.add.rectangle(x + 30, y + bh - 10, bw - 60, 6, PALETTE.bad).setOrigin(0, 0.5);
    this.panel.add(bar);
    this.tweens.add({ targets: bar, scaleX: 0, duration: seconds * 1000 });
  }

  private sayCurrent(interrupt = true): void {
    const call = this.battle.call;
    if (call) ctx().platform.speech.say(wordById(call.wordId).en, { interrupt });
  }

  private handle(ev: BattleEvent): void {
    const { sfx, speech } = ctx().platform;
    const haptic = (p: number | number[]) => ctx().platform.haptic?.(p);

    switch (ev.type) {
      case 'spawn':
        this.spawnView(ev.monster, true);
        if (
          this.battle.mode !== 'spell' &&
          !ev.monster.decoy &&
          !this.introduced.has(ev.monster.wordId) &&
          !ctx().engine.stat(ev.monster.wordId, 'recognize')
        ) {
          this.showWordCard(ev.monster);
        }
        break;
      case 'call':
        this.renderPanel();
        this.refreshHighlights();
        if (this.battle.mode !== 'reverse') this.sayCurrent(false);
        break;
      case 'defeat': {
        const view = this.views.get(ev.monsterId);
        this.views.delete(ev.monsterId);
        sfx.play('correct', 1 + Math.min(8, Math.max(0, ev.gain.combo - 1)) * 0.06);
        haptic(12);
        if (view) {
          this.shootStar(view, () => {
            this.popWithLabel(view, ev.wordId, ev.gain);
            this.hitBoss(view.x, view.y);
          });
        } else {
          this.refreshScore(true);
        }
        this.refreshSkill();
        if (this.battle.mode === 'reverse') {
          const w = wordById(ev.wordId);
          const speak = this.level.cloze && w.sentence ? w.sentence.replace(/___/g, w.en) : w.en;
          speech.say(speak, { interrupt: false });
        }
        this.renderPanel();
        this.redrawTop();
        this.refreshCombo(ev.gain.combo >= 2);
        this.pet?.cheer(ev.gain.combo >= 3 ? 34 : 18);
        break;
      }
      case 'wrongTap': {
        sfx.play('wrong');
        haptic([30, 40, 30]);
        const tapped = this.views.get(ev.monsterId);
        if (tapped) {
          tapped.flashWrong();
          const tw = wordById(ev.tappedWordId);
          this.floatText(tapped.x, tapped.y - 96 * tapped.scaleY, `不对，这是 ${tw.en} ${tw.short}`, PALETTE.bad, 26, 1300);
        }
        const target = this.views.get(ev.targetId);
        this.views.delete(ev.targetId);
        if (target) {
          target.disableInteractive();
          target.setHighlight('hint');
          const rw = wordById(ev.wordId);
          this.floatText(target.x, target.y - 100 * target.scaleY, `是它：${rw.en} ${rw.short}`, PALETTE.good, 32, TAP_STUN * 1000 - 200);
          this.time.delayedCall(TAP_STUN * 1000 - 350, () => this.runAway(target, true));
        }
        speech.say(wordById(ev.wordId).en);
        if (ev.shielded) this.shieldFx();
        else this.loseHeartFx();
        this.renderPanel();
        this.showFailBanner(ev.wordId, TAP_STUN, false, !!ev.shielded);
        this.refreshCombo(false);
        break;
      }
      case 'hint':
        if (ev.tileIndex !== undefined) {
          const tile = this.tiles[ev.tileIndex];
          if (tile) this.tweens.add({ targets: tile, scale: 1.18, duration: 160, yoyo: true, repeat: 3 });
        }
        this.sayCurrent();
        this.drawChances();
        this.refreshCombo(false);
        break;
      case 'leak': {
        sfx.play('leak');
        haptic(80);
        this.cameras.main.shake(220, 0.006);
        const view = this.views.get(ev.monsterId);
        this.views.delete(ev.monsterId);
        view?.pop();
        if (ev.shielded) this.shieldFx();
        else this.loseHeartFx();
        if (ev.wasTarget) this.revealMissed(ev.wordId);
        this.renderPanel();
        this.refreshCombo(false);
        break;
      }
      case 'flee': {
        const view = this.views.get(ev.monsterId);
        this.views.delete(ev.monsterId);
        if (view) this.runAway(view, false);
        break;
      }
      case 'spellLetter':
        sfx.play('letter', 1 + Math.min(10, ev.progress) * 0.04);
        this.renderPanel();
        break;
      case 'spellWrong': {
        sfx.play('wrong');
        haptic(25);
        const tile = this.tiles[ev.tileIndex];
        if (tile) this.tweens.add({ targets: tile, x: tile.x + 8, duration: 50, yoyo: true, repeat: 3 });
        this.drawChances();
        this.refreshCombo(false);
        break;
      }
      case 'spellFail': {
        haptic([30, 40, 30]);
        const view = this.views.get(ev.monsterId);
        this.views.delete(ev.monsterId);
        if (view) {
          view.disableInteractive();
          this.time.delayedCall(SPELL_STUN * 1000 - 500, () => this.runAway(view, true));
        }
        speech.say(wordById(ev.wordId).en);
        if (ev.shielded) this.shieldFx();
        else this.loseHeartFx();
        this.renderPanel();
        this.showFailBanner(ev.wordId, SPELL_STUN, true, !!ev.shielded);
        break;
      }
      case 'freeze':
        this.freezeFx(ev.seconds);
        break;
      case 'enrage':
        this.bossEnrage();
        break;
      case 'end':
        this.finish();
        break;
    }
  }

  private loseHeartFx(): void {
    ctx().platform.sfx.play('heart');
    this.redrawTop();
    this.hurtCastle();
    const { W, H } = this.L;
    const tint = this.add.rectangle(W / 2, H / 2, W, H, PALETTE.bad, 0.22).setDepth(80);
    this.tweens.add({ targets: tint, alpha: 0, duration: 380, onComplete: () => tint.destroy() });
    this.heartsG.setScale(1);
    this.tweens.add({
      targets: this.heartsG,
      y: 5,
      duration: 60,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.heartsG.setY(0),
    });
  }

  private floatText(x: number, y: number, text: string, color: number, size: number, duration: number): Phaser.GameObjects.Text {
    const { W, field } = this.L;
    y = Math.max(field.y + 44, y);
    const t = this.add
      .text(x, y, text, textStyle(size, color, FONT_EN_PLAIN, { stroke: '#ffffff', strokeThickness: 7 }))
      .setOrigin(0.5)
      .setDepth(55);
    if (t.width > W - 20) t.setScale((W - 20) / t.width);
    t.setX(Math.max(t.displayWidth / 2 + 8, Math.min(W - t.displayWidth / 2 - 8, x)));
    this.tweens.add({ targets: t, y: y - 26, duration, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: duration, duration: 260, onComplete: () => t.destroy() });
    return t;
  }

  private runAway(view: MonsterView, taunt: boolean): void {
    if (!view.active) return;
    view.disableInteractive();
    view.setHighlight('none');
    const { field, portrait } = this.L;
    if (taunt) {
      ctx().platform.sfx.play('escape');
      this.floatText(view.x, view.y - 104 * view.scaleY, '我还会回来的！', PALETTE.inkSoft, 20, 500);
    }
    const target = portrait ? { y: field.y - 140 } : { x: field.x + field.w + 140 };
    this.tweens.add({
      targets: view,
      ...target,
      alpha: 0.2,
      duration: 520,
      ease: 'Quad.easeIn',
      onComplete: () => view.destroy(),
    });
  }

  private showWordCard(m: MonsterState): void {
    const w = wordById(m.wordId);
    this.introduced.add(m.wordId);
    const { W, H, field } = this.L;
    const layer = this.add.container(0, 0).setDepth(95);
    this.card = layer;
    const shade = this.add.rectangle(W / 2, H / 2, W, H, PALETTE.ink, 0.28).setInteractive();
    layer.add(shade);

    const cw = Math.min(460, W - 60);
    const ch = w.picture ? 340 : 240;
    const box = this.add.container(W / 2, field.y + field.h / 2);
    layer.add(box);

    const g = this.add.graphics();
    drawBoard(g, -cw / 2, -ch / 2, cw, ch, 26);
    g.fillStyle(PALETTE.ink, 1);
    g.fillRoundedRect(-cw / 2 + 18, -ch / 2 - 18, 96, 40, 14);
    g.fillStyle(PALETTE.carrot, 1);
    g.fillRoundedRect(-cw / 2 + 21, -ch / 2 - 15, 90, 34, 11);
    box.add(g);
    box.add(this.add.text(-cw / 2 + 66, -ch / 2 + 2, '新词', textStyle(22, PALETTE.white)).setOrigin(0.5));

    let py = -ch / 2 + 40;
    if (w.picture) {
      box.add(makePicture(this, 0, py + 64, w.picture, 120));
      py += 140;
    }
    const en = this.add.text(0, py + 36, w.en, textStyle(64, PALETTE.ink, FONT_EN)).setOrigin(0.5);
    if (en.width > cw - 50) en.setScale((cw - 50) / en.width);
    box.add(en);
    const zh = this.add.text(0, py + 96, w.zh, textStyle(30, PALETTE.inkSoft, FONT_EN_PLAIN)).setOrigin(0.5);
    if (zh.width > cw - 40) zh.setScale((cw - 40) / zh.width);
    box.add(zh);
    box.add(this.add.text(0, ch / 2 - 26, '记住它，马上考你 · 点一下继续', textStyle(17, PALETTE.inkSoft)).setOrigin(0.5));

    box.setScale(0.5);
    this.tweens.add({ targets: box, scale: 1, duration: 220, ease: 'Back.easeOut' });
    ctx().platform.sfx.play('card');
    ctx().platform.speech.say(w.en, { interrupt: false });

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      this.tweens.add({
        targets: layer,
        alpha: 0,
        duration: 120,
        onComplete: () => {
          layer.destroy();
          if (this.card === layer) this.card = undefined;
          const view = this.views.get(m.id);
          if (view?.active) {
            this.tweens.add({ targets: view, y: view.y - 14, duration: 120, yoyo: true, repeat: 1 });
          }
        },
      });
    };
    this.time.delayedCall(500, () => shade.once('pointerup', close));
    this.time.delayedCall(2100, close);
  }

  private spawnView(m: MonsterState, animate: boolean): void {
    const pos = this.L.pos(m.lane, m.x);
    const labelMode: MonsterLabelMode =
      this.battle.mode === 'reverse'
        ? 'en'
        : this.level.dictation && ctx().platform.speech.available
          ? 'hidden'
          : 'auto';
    const outfits = unlockedOutfitCount(this.knownAtStart);
    const outfit = outfits > 0 ? ((m.id * 7 + m.kind * 3) % (outfits + 1)) - 1 : -1;
    const variant = m.variant ?? 'normal';
    const sc = this.L.monsterScale * (variant === 'big' ? 1.16 : variant === 'fast' ? 0.88 : 1);
    const view = new MonsterView(this, pos.x, pos.y, m.id, m.wordId, m.kind, sc, labelMode, outfit, variant);
    view.setDepth(10);
    view.on('pointerdown', () => this.battle.tapMonster(m.id));
    this.views.set(m.id, view);
    if (animate) {
      view.setScale(0.1);
      this.tweens.add({ targets: view, scale: sc, duration: 260, ease: 'Back.easeOut' });
    }
  }

  private refreshHighlights(): void {
    const call = this.battle.call;
    for (const [id, view] of this.views) {
      if (call && id === call.monsterId) {
        view.setHighlight(this.battle.mode === 'spell' ? (call.hinted ? 'hint' : 'lock') : call.hinted ? 'hint' : 'none');
      } else {
        view.setHighlight('none');
      }
    }
  }

  private shootStar(target: MonsterView, onHit: () => void): void {
    const l = this.L.launcher;
    const sy = l.y - (this.L.portrait ? 37 : 46);
    const star = this.add.star(l.x, sy, 5, 8, 18, PALETTE.sun).setStrokeStyle(3, PALETTE.ink).setDepth(40);
    this.tweens.add({
      targets: star,
      x: target.x,
      y: target.y - 10,
      angle: 360,
      duration: 220,
      ease: 'Quad.easeIn',
      onComplete: () => {
        star.destroy();
        onHit();
      },
    });
  }

  private popWithLabel(view: MonsterView, wordId: string, gain: DefeatGain): void {
    const x = view.x;
    const y = view.y;
    view.pop();
    const { sfx } = ctx().platform;
    sfx.play('pop');
    this.cameras.main.shake(90, 0.0035);

    const w = wordById(wordId);
    const ly = Math.max(this.L.field.y + 110, y - 40);
    const lbl = this.add
      .text(x, ly, `${w.en}  ${w.zh}`, textStyle(36, PALETTE.good, FONT_EN_PLAIN, { stroke: '#ffffff', strokeThickness: 8 }))
      .setOrigin(0.5)
      .setDepth(50);
    if (lbl.width > this.L.W - 20) lbl.setScale((this.L.W - 20) / lbl.width);
    lbl.setX(Math.max(lbl.displayWidth / 2 + 8, Math.min(this.L.W - lbl.displayWidth / 2 - 8, x)));
    this.tweens.add({ targets: lbl, y: ly - 70, alpha: 0, duration: 1100, ease: 'Quad.easeOut', onComplete: () => lbl.destroy() });

    const ring = this.add.circle(x, y, 30).setStrokeStyle(8, PALETTE.sun, 1).setDepth(44);
    this.tweens.add({ targets: ring, scale: 2.6, alpha: 0, duration: 320, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });

    const count = 10 + Math.min(10, gain.combo * 2);
    for (let i = 0; i < count; i++) {
      const col = Phaser.Utils.Array.GetRandom([PALETTE.sun, PALETTE.carrot, PALETTE.good, 0xffffff]);
      const p =
        i % 3 === 0
          ? this.add.star(x, y, 5, 4, 9, col).setDepth(45)
          : this.add.circle(x, y, Phaser.Math.Between(4, 8), col).setDepth(45);
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 60 + Math.random() * 50;
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist,
        alpha: 0,
        angle: 180,
        duration: 480 + Math.random() * 200,
        onComplete: () => p.destroy(),
      });
    }

    const pts = this.add
      .text(x, y + 14, `+${gain.points}`, textStyle(gain.combo >= 5 ? 44 : 36, PALETTE.sun, FONT_EN, { stroke: hex(PALETTE.ink), strokeThickness: 7 }))
      .setOrigin(0.5)
      .setDepth(97)
      .setScale(0.3);
    this.tweens.add({ targets: pts, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: pts,
      x: this.scoreText.x - this.scoreText.width / 2,
      y: this.scoreText.y,
      scale: 0.5,
      delay: 520,
      duration: 340,
      ease: 'Quad.easeIn',
      onComplete: () => {
        pts.destroy();
        sfx.play('coin', 1 + Math.min(8, gain.combo) * 0.04);
        this.refreshScore(true);
      },
    });

    if (gain.fast) {
      sfx.play('fast');
      this.floatText(x + 86, y + 14, '快！', PALETTE.carrotDark, 24, 500);
    }
    if (gain.bonus) {
      this.floatText(
        x,
        y - 30,
        gain.bonus >= 100 ? `金色小怪 +${gain.bonus}` : `抓住快跑怪 +${gain.bonus}`,
        gain.bonus >= 100 ? 0xe0a41c : PALETTE.carrotDark,
        gain.bonus >= 100 ? 30 : 22,
        700,
      );
    }
    const callout = STREAK_CALLOUTS.find(([n]) => n === gain.combo);
    if (callout) this.streakBanner(callout[1], STREAK_CALLOUTS.indexOf(callout));
  }

  private streakBanner(label: string, tier: number): void {
    const { W, H, field } = this.L;
    ctx().platform.sfx.play('streak', 1 + tier * 0.1);
    ctx().platform.haptic?.([20, 30, 20, 30, 40]);

    const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0.3).setDepth(96);
    this.tweens.add({ targets: flash, alpha: 0, duration: 260, onComplete: () => flash.destroy() });

    const txt = this.add
      .text(
        W / 2,
        field.y + field.h * 0.38,
        label,
        textStyle(Math.min(68, 52 + tier * 4), tier >= 2 ? PALETTE.bad : PALETTE.carrot, undefined, { stroke: '#ffffff', strokeThickness: 12 }),
      )
      .setOrigin(0.5)
      .setDepth(98)
      .setScale(2.4)
      .setAlpha(0);
    if (txt.width > W - 30) txt.setFontSize(Math.floor((parseInt(String(txt.style.fontSize)) * (W - 30)) / txt.width));
    this.tweens.add({ targets: txt, scale: 1, alpha: 1, duration: 200, ease: 'Quad.easeIn' });
    this.tweens.add({ targets: txt, scale: 1.08, delay: 200, duration: 130, yoyo: true });
    this.tweens.add({ targets: txt, alpha: 0, y: txt.y - 30, delay: 1000, duration: 320, onComplete: () => txt.destroy() });

    for (let i = 0; i < 18 + tier * 6; i++) {
      const piece = this.add
        .rectangle(
          W / 2 + (Math.random() - 0.5) * 260,
          txt.y,
          9,
          14,
          Phaser.Utils.Array.GetRandom([PALETTE.sun, PALETTE.carrot, PALETTE.good, PALETTE.bad, 0x5b8def]),
        )
        .setDepth(97)
        .setAngle(Math.random() * 360);
      this.tweens.add({
        targets: piece,
        x: piece.x + (Math.random() - 0.5) * 320,
        y: piece.y + 120 + Math.random() * 160,
        angle: piece.angle + 360,
        alpha: 0,
        duration: 800 + Math.random() * 500,
        ease: 'Quad.easeOut',
        onComplete: () => piece.destroy(),
      });
    }
  }

  private revealMissed(wordId: string): void {
    const w = wordById(wordId);
    const { field, W } = this.L;
    const c = this.add.container(W / 2, field.y + field.h / 2).setDepth(70);
    const g = this.add.graphics();
    drawBoard(g, -190, -70, 380, 140, 20);
    c.add(g);
    c.add(this.add.text(0, -44, '刚才那个是', textStyle(22, PALETTE.inkSoft)).setOrigin(0.5));
    const en = this.add.text(0, 6, w.en, textStyle(44, PALETTE.ink, FONT_EN)).setOrigin(0.5);
    if (en.width > 300) en.setScale(300 / en.width);
    c.add(en);
    const zh = this.add.text(w.picture ? 22 : 0, 48, w.zh, textStyle(24, PALETTE.inkSoft, FONT_EN_PLAIN)).setOrigin(0.5);
    if (zh.width > 300) zh.setScale(300 / zh.width);
    c.add(zh);
    if (w.picture) c.add(makePicture(this, -zh.displayWidth / 2 - 6, 48, w.picture, 28));
    ctx().platform.speech.say(w.en, { interrupt: false });
    c.setScale(0.5);
    this.tweens.add({ targets: c, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: 1700, duration: 300, onComplete: () => c.destroy() });
  }

  private showIntro(): void {
    this.running = false;
    ctx().platform.music.setMood('calm');
    const layer = this.makeOverlay();
    const { W, H } = this.L;
    const g = this.add.graphics();
    const pw = Math.min(560, W - 60);
    drawBoard(g, W / 2 - pw / 2, H / 2 - 170, pw, 340, 26);
    layer.add(g);
    layer.add(this.add.text(W / 2, H / 2 - 112, this.level.title, textStyle(42)).setOrigin(0.5));
    layer.add(
      this.add
        .text(W / 2, H / 2 - 50, this.level.tip, textStyle(26, PALETTE.inkSoft, undefined, { wordWrap: { width: pw - 60 }, align: 'center' }))
        .setOrigin(0.5),
    );
    const rule =
      this.level.mode === 'spell'
        ? '每个词只有几次机会，点错字母、用"提示"都算一次'
        : '一题只有一次机会：点错扣半颗心，小怪溜走还会回来';
    layer.add(this.add.text(W / 2, H / 2 + 6, rule, textStyle(20, PALETTE.inkSoft)).setOrigin(0.5));
    layer.add(
      makeButton(
        this,
        W / 2,
        H / 2 + 92,
        240,
        80,
        '开始！',
        () => {
          this.closeOverlay();
          this.running = true;
        },
        { fontSize: 36 },
      ),
    );
  }

  private showPause(): void {
    if (this.overlay || this.ended) return;
    this.running = false;
    ctx().platform.music.setMood('calm');
    const layer = this.makeOverlay();
    const { W, H } = this.L;
    const g = this.add.graphics();
    drawBoard(g, W / 2 - 220, H / 2 - 150, 440, 300, 26);
    layer.add(g);
    layer.add(this.add.text(W / 2, H / 2 - 96, '休息一下', textStyle(40)).setOrigin(0.5));
    layer.add(
      makeButton(
        this,
        W / 2,
        H / 2 - 6,
        260,
        72,
        '继续',
        () => {
          this.closeOverlay();
          this.running = true;
        },
        { fontSize: 32 },
      ),
    );
    layer.add(
      makeButton(
        this,
        W / 2,
        H / 2 + 88,
        260,
        64,
        '回到选关',
        () => {
          if (this.battle.time > 8 || this.battle.answers.length > 0) this.logSession('quit');
          ctx().save();
          this.scene.start('levels');
        },
        { fill: PALETTE.board, textColor: PALETTE.ink, fontSize: 26 },
      ),
    );
  }

  private makeOverlay(): Phaser.GameObjects.Container {
    const { W, H } = this.L;
    const c = this.add.container(0, 0).setDepth(100);
    c.add(this.add.rectangle(W / 2, H / 2, W, H, PALETTE.ink, 0.45).setInteractive());
    this.overlay = c;
    return c;
  }

  private closeOverlay(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
  }

  private logSession(result: 'win' | 'lose' | 'quit', score = 0): void {
    const b = this.battle;
    const reacts = b.reactions;
    ctx().engine.logSession({
      level: this.level.id,
      at: ctx().platform.now(),
      result,
      stars: result === 'win' ? b.stars : 0,
      secs: Math.round(b.time),
      answers: b.answers.length,
      perfect: b.answers.filter((a) => a.outcome === 'perfect').length,
      missed: b.answers.filter((a) => a.outcome === 'missed').length,
      wrong: b.wrongTaps,
      reactMs: reacts.length ? Math.round((reacts.reduce((a, c) => a + c, 0) / reacts.length) * 1000) : 0,
      combo: b.bestCombo,
      score,
    });
    const lvl = this.level;
    track('level_end', {
      level: lvl.id,
      course: lvl.course,
      unit: (lvl.unit ?? -1) + 1,
      stage: lvl.boss ? 'boss' : lvl.course === 'review' ? 'review' : lvl.stage,
      mode: lvl.mode,
      result,
      stars: result === 'win' ? b.stars : 0,
      secs: Math.round(b.time),
      answers: b.answers.length,
      first_try: b.answers.filter((a) => a.outcome === 'perfect').length,
      wrong: b.wrongTaps,
      combo: b.bestCombo,
      score,
      shield: this.withShield,
      skill_used: this.skillUses,
    });
  }

  private finish(): void {
    this.ended = true;
    this.running = false;
    ctx().platform.music.setMood('off');
    const b = this.battle;
    const win = b.result === 'win';
    ctx().platform.sfx.play(win ? 'win' : 'lose');

    const summary = b.summary;
    const { improved, record, prevBest } = ctx().engine.saveLevel(this.level.id, b.stars, win ? summary.total : 0);
    const xpGain = win ? summary.total : summary.battle;
    const xpBefore = ctx().engine.xp;
    ctx().engine.addXp(xpGain);
    this.logSession(win ? 'win' : 'lose', xpGain);
    if (win && this.boss) this.bossDown();
    ctx().save();

    const banner = this.add
      .text(
        this.L.W / 2,
        this.L.field.y + this.L.field.h / 2,
        win ? '守住啦！' : '小怪闯进来了',
        textStyle(64, win ? PALETTE.good : PALETTE.bad, undefined, { stroke: hex(PALETTE.white), strokeThickness: 10 }),
      )
      .setOrigin(0.5)
      .setDepth(90)
      .setScale(0.3);
    this.tweens.add({ targets: banner, scale: 1, duration: 300, ease: 'Back.easeOut' });

    const engine = ctx().engine;
    const unitCompleted =
      !this.unitDoneAtStart && this.level.unit !== undefined && isUnitCompleted(engine, this.level.course, this.level.unit);
    const outfitsBefore = unlockedOutfitCount(this.knownAtStart);
    const outfitsAfter = unlockedOutfitCount(knownWordCount(engine));
    const resultData: ResultSceneData = {
      levelId: this.level.id,
      result: b.result as 'win' | 'lose',
      stars: b.stars,
      hearts: b.hearts,
      answers: b.answers,
      improved,
      unitCompleted,
      newOutfit: outfitsAfter > outfitsBefore ? OUTFITS[outfitsAfter - 1] : undefined,
      score: summary,
      record,
      prevBest,
      xpBefore,
      xpGain,
      newCards: Math.max(0, collectionCounts(engine).lit - this.albumAtStart.lit),
      newGold: Math.max(0, collectionCounts(engine).gold - this.albumAtStart.gold),
    };

    const pet = petState(engine);
    if (pet && pet.stage > this.petStageAtStart) {
      resultData.petGrew = { from: this.petStageAtStart, to: pet.stage };
      track('pet_grow', { kind: pet.kind, stage: pet.stage });
    }

    this.time.delayedCall(win && this.boss ? 2000 : 1300, () => this.scene.start('result', resultData));
  }
}
