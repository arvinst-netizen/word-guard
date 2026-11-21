import Phaser from 'phaser';
import { ICON_DATA } from './icon-data';
import { fetchJsonFast, warmCacheUrls } from './net';
import { FONT_EMOJI, FONT_EN, hex, PALETTE, textStyle } from './theme';

export const ICON_CREDITS = [
  'game-icons.net（CC BY 3.0）',
  'Material Symbols（Apache 2.0）',
  'Material Design Icons（Apache 2.0）',
] as const;

export const isIconPic = (pic: string): boolean => pic.startsWith('icon:');
export const isTextPic = (pic: string): boolean => pic.startsWith('txt:');
export const isArtPic = (pic: string): boolean => pic.startsWith('art:');

const ICON_COLORS = [0xe05a5a, 0x3a7bd5, 0x7b5ba9, 0xd24a7a, 0x1f8e76, 0xc97b24];

function colorForKey(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ICON_COLORS[h % ICON_COLORS.length];
}

const ICON_SIZE = 128;
const iconImages = new Map<string, HTMLImageElement>();

export function preloadIcons(): Promise<void> {
  const tasks = Object.entries(ICON_DATA).map(
    ([name, def]) =>
      new Promise<void>((resolve) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${def.box}" width="${ICON_SIZE}" height="${ICON_SIZE}" style="color:${hex(colorForKey(name))}">${def.body}</svg>`;
        const img = new Image();
        img.onload = () => {
          iconImages.set(name, img);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      }),
  );
  return Promise.all(tasks).then(() => undefined);
}

export function hasIconLoaded(pic: string): boolean {
  return iconImages.has(pic.slice(5));
}

const ART_BASE = 'art/';
const ART_SIZE = 256;
const artPromises = new Map<string, Promise<HTMLImageElement>>();

export async function loadArtManifest(
  apply: (files: Record<string, string>, rejected: Set<string>, complete: boolean) => number,
): Promise<number> {
  if (typeof fetch === 'undefined' || location.protocol === 'file:') return 0;
  try {
    const [index, reject] = await Promise.all([
      fetchJsonFast<{ files?: Record<string, string>; complete?: boolean }>('art/index.json'),
      fetchJsonFast<string[]>('art/reject.json'),
    ]);
    return index?.files ? apply(index.files, new Set(reject ?? []), index.complete === true) : 0;
  } catch {
    return 0;
  }
}

function loadArtImage(file: string): Promise<HTMLImageElement> {
  let p = artPromises.get(file);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(file));
      img.src = ART_BASE + file;
    });
    p.catch(() => artPromises.delete(file));
    artPromises.set(file, p);
  }
  return p;
}

export function prefetchArtPictures(pictures: string[]): void {
  for (const pic of pictures) {
    if (isArtPic(pic)) loadArtImage(pic.slice(4)).catch(() => undefined);
  }
}

export function addPicture(
  scene: Phaser.Scene,
  x: number,
  y: number,
  pic: string,
  size: number,
): Phaser.GameObjects.GameObject {
  if (isIconPic(pic)) {
    const name = pic.slice(5);
    const key = 'icon:' + name;
    const img = iconImages.get(name);
    if (img && !scene.textures.exists(key)) scene.textures.addImage(key, img);
    if (scene.textures.exists(key)) {
      return scene.add.image(x, y, key).setScale((size * 1.05) / ICON_SIZE);
    }
  }

  if (isArtPic(pic)) {
    const file = pic.slice(4);
    const key = 'art:' + file;
    const scale = (size * 1.2) / ART_SIZE;
    if (scene.textures.exists(key)) {
      return scene.add.image(x, y, key).setScale(scale);
    }
    if (!scene.textures.exists('__art_blank')) {
      const c = document.createElement('canvas');
      c.width = c.height = 2;
      scene.textures.addCanvas('__art_blank', c);
    }
    const placeholder = scene.add.image(x, y, '__art_blank');
    loadArtImage(file)
      .then((img) => {
        if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
        if (placeholder.active) placeholder.setTexture(key).setScale(scale);
      })
      .catch(() => undefined);
    return placeholder;
  }

  if (isTextPic(pic)) {
    const text = pic.slice(4);
    const fontSize = Math.round(size * (text.length <= 2 ? 1 : text.length === 3 ? 0.8 : 0.66));
    return scene.add
      .text(
        x,
        y,
        text,
        textStyle(fontSize, colorForKey(text), FONT_EN, {
          stroke: '#ffffff',
          strokeThickness: Math.max(3, fontSize / 8),
        }),
      )
      .setOrigin(0.5);
  }

  return scene.add
    .text(x, y, pic, textStyle(size, PALETTE.ink, FONT_EMOJI, { padding: { x: 4, y: 8 } }))
    .setOrigin(0.5);
}

export function warmArtFiles(files: string[]): void {
  warmCacheUrls(files.map((f) => ART_BASE + f));
}
