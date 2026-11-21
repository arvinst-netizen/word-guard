import { WORDS } from './words';

export type ArtStage = 'starters' | 'movers' | 'ket' | 'pet';

export const ART_STAGES: readonly ArtStage[] = ['starters', 'movers', 'ket', 'pet'];

export const COURSE_ART_STAGE: Readonly<Record<string, ArtStage>> = {
  'yle-starters': 'starters',
  'sh-1a': 'starters',
  'sh-1b': 'starters',
  'sh-2a': 'starters',
  'sh-2b': 'starters',
  'yle-movers': 'movers',
  'sh-3a': 'movers',
  'sh-3b': 'movers',
  'sh-4a': 'movers',
  'sh-4b': 'movers',
  ket: 'ket',
  'sh-5a': 'ket',
  'sh-5b': 'ket',
  pet: 'pet',
};

export function courseArtStage(courseId?: string): ArtStage | null {
  return (courseId && COURSE_ART_STAGE[courseId]) || null;
}

export function pickArtForStage(
  art: Partial<Record<ArtStage, string>>,
  stage: ArtStage | null,
): string {
  const idx = stage ? ART_STAGES.indexOf(stage) : 0;
  for (let i = idx; i >= 0; i--) {
    const file = art[ART_STAGES[i]];
    if (file) return file;
  }
  for (let i = idx + 1; i < ART_STAGES.length; i++) {
    const file = art[ART_STAGES[i]];
    if (file) return file;
  }
  return '';
}

export function applyArtIndex(
  files: Record<string, string>,
  rejected: Set<string>,
  complete = false,
): number {
  const byWord = new Map<string, Partial<Record<ArtStage, string>>>();
  for (const [key, file] of Object.entries(files)) {
    if (rejected.has(key)) continue;
    const at = key.lastIndexOf('@');
    const wordId = at > 0 ? key.slice(0, at) : key;
    if (rejected.has(wordId)) continue;
    const stageStr = at > 0 ? key.slice(at + 1) : '';
    const map = byWord.get(wordId) ?? {};
    if ((ART_STAGES as readonly string[]).includes(stageStr)) {
      map[stageStr as ArtStage] = file;
    } else {
      for (const s of ART_STAGES) {
        map[s] ??= file;
      }
    }
    byWord.set(wordId, map);
  }

  let applied = 0;
  for (const w of WORDS) {
    if (w.picture.startsWith('txt:')) continue;
    const art = byWord.get(w.id);
    if (art) {
      if (!w.picture.startsWith('art:')) w.basePicture = w.picture;
      w.art = art;
      w.picture = 'art:' + pickArtForStage(art, null);
      applied++;
    } else if (complete && w.picture && !w.picture.startsWith('art:')) {
      w.basePicture = w.picture;
      w.picture = '';
    }
  }
  return applied;
}

let activeStage: ArtStage | null = null;

export function setArtStage(stage: ArtStage | null): void {
  if (stage === activeStage) return;
  activeStage = stage;
  for (const w of WORDS) {
    if (w.art) {
      w.picture = 'art:' + pickArtForStage(w.art, stage);
    }
  }
}
