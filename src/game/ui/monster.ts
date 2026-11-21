import Phaser from 'phaser';
import type { MonsterVariant } from '../../core/battle/battle';
import { wordById } from '../../core/content/words';
import { addPicture } from '../pictures';
import { FONT_EN, FONT_PLAIN, PALETTE, textStyle } from '../theme';
import { makeIcon } from './icons';

export type MonsterLabelMode = 'auto' | 'en' | 'hidden';
export type MonsterHighlight = 'none' | 'lock' | 'hint';

export class MonsterView extends Phaser.GameObjects.Container {
  monsterId: number;
  private ring: Phaser.GameObjects.Graphics;
  private body_: Phaser.GameObjects.Container;
  private highlight: MonsterHighlight = 'none';
  private ringTween?: Phaser.Tweens.Tween;
  private signW = 72;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    monsterId: number,
    wordId: string,
    kind: number,
    scale = 1,
    labelMode: MonsterLabelMode = 'auto',
    outfit = -1,
    variant: MonsterVariant = 'normal',
  ) {
    super(scene, x, y);
    this.monsterId = monsterId;
    const isGold = variant === 'gold';
    const bodyColor = isGold ? 0xffd84a : PALETTE.monster[kind % PALETTE.monster.length];
    const darkColor = isGold ? 0xe0a41c : PALETTE.monsterDark[kind % PALETTE.monsterDark.length];

    this.ring = scene.add.graphics();
    this.add(this.ring);

    const shadow = scene.add.graphics();
    shadow.fillStyle(PALETTE.shadow, 0.22);
    shadow.fillEllipse(0, 62, 82, 16);
    this.add(shadow);

    if (isGold) {
      const aura = scene.add.graphics();
      aura.fillStyle(0xfff3a8, 0.55);
      aura.fillCircle(0, 30, 58);
      aura.fillStyle(0xffffff, 0.35);
      aura.fillCircle(0, 30, 44);
      this.add(aura);
      scene.tweens.add({
        targets: aura,
        alpha: 0.45,
        scale: 1.12,
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    if (variant === 'fast') {
      const lines = scene.add.graphics();
      lines.lineStyle(5, 0xffffff, 0.9);
      for (const [lx, ly, len] of [
        [46, 22, 26],
        [52, 40, 34],
        [44, 58, 22],
      ]) {
        lines.lineBetween(lx, ly, lx + len, ly);
        lines.lineBetween(-lx, ly, -lx - len, ly);
      }
      this.add(lines);
      scene.tweens.add({
        targets: lines,
        alpha: 0.25,
        duration: 220,
        yoyo: true,
        repeat: -1,
      });
    }

    this.body_ = scene.add.container(0, 0);
    this.add(this.body_);

    const stick = scene.add.graphics();
    stick.fillStyle(PALETTE.ink, 1);
    stick.fillRoundedRect(-4, -8, 8, 34, 3);
    stick.fillStyle(PALETTE.soilDark, 1);
    stick.fillRoundedRect(-2, -6, 4, 30, 2);

    const blob = scene.add.graphics();
    blob.fillStyle(PALETTE.ink, 1);
    blob.fillEllipse(0, 32, 84, 70);
    blob.fillStyle(bodyColor, 1);
    blob.fillEllipse(0, 32, 76, 62);
    blob.fillStyle(darkColor, 1);
    blob.fillEllipse(0, 50, 64, 22);
    blob.fillStyle(bodyColor, 1);
    blob.fillEllipse(0, 44, 66, 22);
    blob.fillStyle(0xffffff, 0.35);
    blob.fillEllipse(-18, 16, 18, 10);
    blob.fillStyle(PALETTE.ink, 1);
    blob.fillEllipse(-18, 62, 22, 12);
    blob.fillEllipse(18, 62, 22, 12);
    blob.fillStyle(darkColor, 1);
    blob.fillEllipse(-18, 61, 16, 8);
    blob.fillEllipse(18, 61, 16, 8);

    for (const ex of [-14, 14]) {
      blob.fillStyle(0xffffff, 1);
      blob.fillCircle(ex, 28, 10);
      blob.lineStyle(2.5, PALETTE.ink, 1);
      blob.strokeCircle(ex, 28, 10);
      blob.fillStyle(PALETTE.ink, 1);
      blob.fillCircle(ex - 3, 29, 5);
      blob.fillStyle(0xffffff, 1);
      blob.fillCircle(ex - 5, 26, 2);
    }

    blob.lineStyle(3, PALETTE.ink, 1);
    blob.beginPath();
    blob.arc(0, 40, 7, 0.2, Math.PI - 0.2);
    blob.strokePath();

    if (outfit >= 0) drawOutfit(blob, outfit);

    blob.fillStyle(PALETTE.ink, 1);
    blob.fillCircle(0, 6, 8);
    blob.fillStyle(bodyColor, 1);
    blob.fillCircle(0, 6, 5.5);

    const word = wordById(wordId);
    let labelObj: Phaser.GameObjects.GameObject;
    if (labelMode === 'auto' && word.picture) {
      labelObj = addPicture(scene, 0, -43, word.picture, 48);
    } else {
      const txt = labelMode === 'en' ? word.en : labelMode === 'hidden' ? '?' : word.short;
      const fam = labelMode === 'auto' ? FONT_PLAIN : FONT_EN;
      let fs = 30;
      const t = scene.add.text(0, -43, txt, textStyle(fs, PALETTE.ink, fam)).setOrigin(0.5);
      while (t.width > 176 && fs > 16) {
        fs -= 2;
        t.setFontSize(fs);
      }
      labelObj = t;
      this.signW = Math.max(72, Math.ceil(t.width) + 22);
    }

    const sw = this.signW;
    const sign = scene.add.graphics();
    sign.fillStyle(PALETTE.shadow, 0.2);
    sign.fillRoundedRect(-sw / 2, -73, sw, 68, 14);
    sign.fillStyle(PALETTE.board, 1);
    sign.fillRoundedRect(-sw / 2, -77, sw, 68, 14);
    sign.lineStyle(4, PALETTE.ink, 1);
    sign.strokeRoundedRect(-sw / 2, -77, sw, 68, 14);

    this.body_.add([stick, blob, sign, labelObj]);

    if (isGold) {
      for (const [sx, sy, delay] of [
        [-40, 6, 0],
        [42, 20, 260],
        [-30, 58, 520],
      ]) {
        const st = scene.add.star(sx, sy, 4, 3, 9, 0xffffff).setStrokeStyle(2, 0xe0a41c);
        this.body_.add(st);
        scene.tweens.add({
          targets: st,
          scale: 0.2,
          angle: 90,
          duration: 480,
          delay,
          yoyo: true,
          repeat: -1,
        });
      }
    }

    if (variant === 'fast') {
      const bolt = makeIcon(scene, 'bolt', 34, 2, 26);
      this.body_.add(bolt);
    }

    this.setScale(scale);
    this.setSize(118, 160);
    this.setInteractive({ useHandCursor: true });

    scene.tweens.add({
      targets: this.body_,
      y: -5,
      duration: 260 + kind * 30,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    scene.add.existing(this);
  }

  setHighlight(mode: MonsterHighlight): void {
    if (mode === this.highlight) return;
    this.highlight = mode;
    this.ringTween?.stop();
    this.ring.clear();
    this.ring.setAlpha(1).setScale(1);
    if (mode === 'none') return;
    const col = mode === 'hint' ? PALETTE.sun : PALETTE.carrot;
    this.ring.lineStyle(6, col, 1);
    this.ring.strokeEllipse(0, 60, 104, 30);
    this.ring.lineStyle(5, col, 0.9);
    this.ring.strokeRoundedRect(-this.signW / 2 - 8, -85, this.signW + 16, 84, 18);
    this.ringTween = this.scene.tweens.add({
      targets: this.ring,
      alpha: 0.35,
      duration: 380,
      yoyo: true,
      repeat: -1,
    });
  }

  flashWrong(): void {
    const sx = this.scaleX;
    const g = this.scene.add.graphics();
    g.fillStyle(PALETTE.bad, 0.35);
    g.fillEllipse(0, 32, 80, 66);
    this.add(g);
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: 450,
      onComplete: () => g.destroy(),
    });
    this.scene.tweens.add({
      targets: this,
      scaleX: sx * 1.15,
      scaleY: sx * 0.88,
      duration: 90,
      yoyo: true,
      repeat: 1,
    });
  }

  pop(onDone?: () => void): void {
    this.disableInteractive();
    this.setHighlight('none');
    const sx = this.scaleX;
    this.scene.tweens.add({
      targets: this,
      scaleX: sx * 1.35,
      scaleY: sx * 1.35,
      alpha: 0,
      angle: Phaser.Math.Between(-20, 20),
      duration: 260,
      ease: 'Back.easeIn',
      onComplete: () => {
        this.destroy();
        onDone?.();
      },
    });
  }
}

function drawOutfit(g: Phaser.GameObjects.Graphics, id: number): void {
  const ink = PALETTE.ink;
  const stroke = (w = 3) => g.lineStyle(w, ink, 1);

  switch (id) {
    case 0:
      g.fillStyle(0xe2553a, 1);
      g.fillTriangle(-40, 12, -14, 4, -32, -18);
      stroke();
      g.strokeTriangle(-40, 12, -14, 4, -32, -18);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(-32, -18, 5);
      break;
    case 1:
      g.fillStyle(0xff7e96, 1);
      g.fillTriangle(24, 6, 12, -4, 12, 16);
      g.fillTriangle(24, 6, 36, -4, 36, 16);
      stroke(2.5);
      g.strokeTriangle(24, 6, 12, -4, 12, 16);
      g.strokeTriangle(24, 6, 36, -4, 36, 16);
      g.fillStyle(0xd94c6c, 1);
      g.fillCircle(24, 6, 4);
      break;
    case 2:
      g.fillStyle(0xffffff, 1);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.fillCircle(-26 + Math.cos(a) * 7, 6 + Math.sin(a) * 7, 5.5);
      }
      g.fillStyle(0xffc93c, 1);
      g.fillCircle(-26, 6, 5);
      break;
    case 3:
      g.fillStyle(0x222222, 1);
      g.fillRoundedRect(-25, 21, 22, 14, 5);
      g.fillRoundedRect(3, 21, 22, 14, 5);
      g.fillRect(-3, 25, 6, 3);
      g.fillStyle(0xffffff, 0.35);
      g.fillRect(-21, 24, 6, 3);
      g.fillRect(7, 24, 6, 3);
      break;
    case 4:
      g.fillStyle(0x7b5be9, 1);
      g.fillTriangle(10, 8, 42, 8, 34, -30);
      stroke();
      g.strokeTriangle(10, 8, 42, 8, 34, -30);
      g.fillStyle(0xffd54a, 1);
      g.fillCircle(28, -6, 3.5);
      g.fillCircle(34, -18, 2.5);
      break;
    case 5:
      stroke(4);
      g.beginPath();
      g.arc(0, 30, 40, Math.PI * 1.05, Math.PI * 1.32);
      g.strokePath();
      g.beginPath();
      g.arc(0, 30, 40, Math.PI * 1.68, Math.PI * 1.95);
      g.strokePath();
      g.fillStyle(0x3a7bd5, 1);
      g.fillRoundedRect(-46, 20, 12, 22, 5);
      g.fillRoundedRect(34, 20, 12, 22, 5);
      stroke(2.5);
      g.strokeRoundedRect(-46, 20, 12, 22, 5);
      g.strokeRoundedRect(34, 20, 12, 22, 5);
      break;
    case 6: {
      g.fillStyle(0xffc93c, 1);
      const pts = [-40, 10, -38, -8, -31, 2, -26, -12, -21, 2, -14, -8, -12, 10];
      g.beginPath();
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.closePath();
      g.fillPath();
      stroke(2.5);
      g.strokePath();
      g.fillStyle(0xe2553a, 1);
      g.fillCircle(-26, 4, 3);
      break;
    }
    case 7:
      g.fillStyle(0xe2553a, 1);
      g.fillRoundedRect(-34, 46, 68, 12, 6);
      g.fillRoundedRect(14, 50, 12, 22, 4);
      g.fillStyle(0xffffff, 1);
      for (const sx of [-22, -6, 10]) g.fillRect(sx, 46, 5, 12);
      stroke(2.5);
      g.strokeRoundedRect(-34, 46, 68, 12, 6);
      break;
    case 8:
      g.fillStyle(0xfff4dc, 1);
      g.fillTriangle(-30, 10, -18, 4, -32, -12);
      g.fillTriangle(30, 10, 18, 4, 32, -12);
      stroke(2.5);
      g.strokeTriangle(-30, 10, -18, 4, -32, -12);
      g.strokeTriangle(30, 10, 18, 4, 32, -12);
      break;
    case 9:
      g.fillStyle(0xbfeaff, 0.28);
      g.fillCircle(0, 28, 46);
      g.lineStyle(3, 0x8fb8d0, 1);
      g.strokeCircle(0, 28, 46);
      g.fillStyle(0xffffff, 0.6);
      g.fillEllipse(-24, 6, 12, 7);
      break;
  }
}
