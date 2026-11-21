import Phaser from 'phaser';
import { applyArtIndex } from './core/content/art';
import { clearPicturesWhere } from './core/content/words';
import { trackAppOpen } from './game/analytics';
import { ctx, initContext } from './game/context';
import { makeEmojiUnsupportedChecker } from './game/emoji';
import { FONT_CSS, UI_GLYPHS } from './game/fonts';
import { hasIconLoaded, isArtPic, isIconPic, isTextPic, loadArtManifest, preloadIcons } from './game/pictures';
import { BattleScene } from './game/scenes/BattleScene';
import { LevelsScene } from './game/scenes/LevelsScene';
import { MenuScene } from './game/scenes/MenuScene';
import { PlacementScene } from './game/scenes/PlacementScene';
import { ResultScene } from './game/scenes/ResultScene';
import { StatsScene } from './game/scenes/StatsScene';
import { WordBookScene } from './game/scenes/WordBookScene';
import { hex, PALETTE, setRenderScale } from './game/theme';
import { bindUiArtGame, preloadUiArt } from './game/ui-art';
import { PetView } from './game/ui/pet';
import { createWebPlatform } from './platform/web';

function pickViewport(): { portrait: boolean; w: number; h: number } {
  const iw = window.innerWidth;
  const ih = window.innerHeight;
  if (ih > iw * 1.1) {
    return { portrait: true, w: 720, h: Math.round(Math.min(1560, Math.max(1280, (720 * ih) / iw))) };
  }
  return { portrait: false, w: Math.round(Math.min(1560, Math.max(1280, (720 * iw) / ih))), h: 720 };
}

async function loadFonts(): Promise<void> {
  const style = document.createElement('style');
  style.textContent = FONT_CSS;
  document.head.appendChild(style);
  const done = Promise.all([
    document.fonts.load('500 40px "Baloo 2"', 'Word'),
    document.fonts.load('700 40px "Baloo 2"', 'Word'),
    document.fonts.load('40px "ZCOOL KuaiLe"', UI_GLYPHS),
  ]).catch(() => undefined);
  await Promise.race([done, new Promise((r) => setTimeout(r, 1500))]);
}

function registerServiceWorker(): void {
  if (
    !('serviceWorker' in navigator) ||
    (location.protocol !== 'https:' && location.hostname !== 'localhost') ||
    window.top !== window.self
  ) {
    return;
  }
  navigator.serviceWorker.register('sw.js').catch(() => undefined);
}

async function boot(): Promise<void> {
  const platform = createWebPlatform();
  await Promise.all([initContext(platform), loadFonts()]);
  await Promise.all([preloadIcons(), loadArtManifest(applyArtIndex), preloadUiArt()]);

  trackAppOpen({
    sessions: (ctx().engine.data.sessions ?? []).length,
    xp: ctx().engine.xp,
  });

  const isUnsupportedEmoji = makeEmojiUnsupportedChecker();
  const cleared = clearPicturesWhere((pic) =>
    isTextPic(pic) || isArtPic(pic) ? false : isIconPic(pic) ? !hasIconLoaded(pic) : isUnsupportedEmoji(pic),
  );
  if (cleared > 0) console.info(`这台设备有 ${cleared} 个图显示不出来，已改为显示文字`);

  let vp = pickViewport();
  const fit = Math.min(window.innerWidth / vp.w, window.innerHeight / vp.h);
  const dpr = Math.min(2, Math.max(1, Math.round(fit * (window.devicePixelRatio || 1) * 4) / 4));
  setRenderScale(dpr);
  document.getElementById('loading')?.remove();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    backgroundColor: hex(PALETTE.skyTop),
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: vp.w * dpr,
      height: vp.h * dpr,
    },
    input: { activePointers: 3 },
    audio: { noAudio: true },
    scene: [MenuScene, LevelsScene, BattleScene, ResultScene, WordBookScene, PlacementScene, StatsScene],
  });

  bindUiArtGame(game);
  (window as unknown as Record<string, unknown>).__wordGuard = game;
  (window as unknown as Record<string, unknown>).__wgPet = PetView;

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const next = pickViewport();
      if (next.portrait === vp.portrait && Math.abs(next.w - vp.w) < 40 && Math.abs(next.h - vp.h) < 40) return;
      vp = next;
      game.scale.setGameSize(vp.w * dpr, vp.h * dpr);
      for (const sc of game.scene.getScenes(true)) {
        const resume = (sc as Phaser.Scene & { getResumeData?: () => unknown }).getResumeData?.();
        sc.scene.restart((resume ?? sc.sys.settings.data) as object);
      }
    }, 250);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      for (const sc of game.scene.getScenes(true)) {
        if (sc instanceof BattleScene) sc.events.emit('app-hidden');
      }
    }
  });
}

boot();
registerServiceWorker();
