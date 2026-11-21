import Phaser from 'phaser';
import { fetchJsonFast } from './net';

const UI_ART_BASE = 'art/ui/';
let gameRef: Phaser.Game | undefined;
const loadedImages = new Map<string, HTMLImageElement>();

export function uiArtKey(name: string): string | null {
  const key = 'ui:' + name;
  return gameRef?.textures.exists(key) ? key : null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(url));
    img.src = url;
  });
}

function registerTexture(name: string): void {
  const img = loadedImages.get(name);
  if (gameRef && img) {
    try {
      if (!gameRef.textures.exists('ui:' + name)) {
        gameRef.textures.addImage('ui:' + name, img);
      }
    } catch {
      // ignore
    }
  }
}

export async function preloadUiArt(timeoutMs = 3000): Promise<number> {
  if (location.protocol === 'file:') return 0;
  const task = (async () => {
    const files = (await fetchJsonFast<{ files?: Record<string, string> }>(UI_ART_BASE + 'index.json'))?.files ?? {};
    await Promise.all(
      Object.entries(files).map(async ([name, file]) => {
        if (name === 'app-icon') return;
        try {
          loadedImages.set(name, await loadImage(UI_ART_BASE + file));
          registerTexture(name);
        } catch {
          // ignore
        }
      }),
    );
  })().catch(() => undefined);

  await Promise.race([task, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  return loadedImages.size;
}

export function bindUiArtGame(game: Phaser.Game): void {
  gameRef = game;
  const sync = () => loadedImages.forEach((_, name) => registerTexture(name));
  sync();
  game.events.once('ready', sync);
}
