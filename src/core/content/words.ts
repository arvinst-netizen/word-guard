import { CONTEXT_SENTENCES, PET_HOMOGRAPHS } from './contexts';
import { COURSE_WORDS, WORD_FIRST_COURSE, type WordTuple } from './courses';
import { KET_WORDS } from './ket';
import { KET_SENTENCES } from './ket-sentences';
import { PET_SENTENCES, PET_WORDS } from './pet';
import type { ArtStage } from './art';

export interface Word {
  id: string;
  en: string;
  zh: string;
  meanings: string[];
  short: string;
  picture: string;
  basePicture?: string;
  art?: Partial<Record<ArtStage, string>>;
  set: string;
  spellable: boolean;
  sentence?: string;
  context?: string;
}

const isSpellable = (en: string): boolean => /^[a-z]{2,8}$/.test(en);

export function splitMeanings(zh: string): string[] {
  return zh
    .split(/[；;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function shortMeaning(zh: string): string {
  const parts = splitMeanings(zh);
  let out = parts[0] ?? zh;
  for (const part of parts.slice(1)) {
    if ((out + part).length > 7) break;
    out += '；' + part;
  }
  return out;
}

const makeWord =
  (set: string) =>
  ([en, zh, picture]: WordTuple): Word => ({
    id: en,
    en,
    zh,
    meanings: splitMeanings(zh),
    short: shortMeaning(zh),
    picture,
    set,
    spellable: isSpellable(en),
  });

const courseWords: Word[] = COURSE_WORDS.map((tuple) =>
  makeWord(WORD_FIRST_COURSE[tuple[0]] ?? 'yle-starters')(tuple),
);
const courseWordSet = new Set(courseWords.map((w) => w.id));

const ketWords: Word[] = KET_WORDS.filter(([en]) => !courseWordSet.has(en)).map(makeWord('ket'));
const ketWordSet = new Set(KET_WORDS.map(([en]) => en));

const petWords: Word[] = PET_WORDS.filter(([en]) => !courseWordSet.has(en) && !ketWordSet.has(en)).map(
  (tuple) => ({
    ...makeWord('pet')(tuple),
    sentence: PET_SENTENCES[tuple[0]],
  }),
);

export const WORDS: Word[] = [...courseWords, ...ketWords, ...petWords];

for (const word of WORDS) {
  if (!word.sentence && KET_SENTENCES[word.id]) {
    word.sentence = KET_SENTENCES[word.id];
  }
  if (CONTEXT_SENTENCES[word.id]) {
    word.context = CONTEXT_SENTENCES[word.id];
  } else if (word.sentence && PET_HOMOGRAPHS.includes(word.id)) {
    word.context = word.sentence.replace(/___/g, word.en);
  }
}

export function speakTexts(word: Word): string[] {
  return word.context ? [word.en, word.context] : [word.en];
}

const wordMap = new Map<string, Word>(WORDS.map((w) => [w.id, w]));

const stripVS16 = (s: string): string => s.replace(/\uFE0F/g, '');

export const LOOKALIKE: string[][] = [
  ['🌍', '🌏', '🌐', '🗺️', '🧭'],
  ['💵', '💶', '💷', '💸', '💰'],
  ['❤️', '💕', '💗', '🩷', '💔'],
  ['⌛', '⏳', '⏱️', '⏰', '🕐'],
  ['🎵', '🎶', '🎤', 'icon:mdi:microphone-variant'],
  ['😢', '😭', '😞', '☹️', '😟'],
  ['😨', '😱', '😬', '😮'],
  ['😀', '😊', '😆', '😂', '🥰', '😍', '😋', '🤩'],
  ['😫', '😴', '🥱', '😩'],
  ['📧', '📬', '✉️', '💌', '📮'],
  ['🏢', '🏬', '🏨', '🏦', '🏤', '🏪'],
  ['☀️', '🌞', '🔆', 'icon:mdi:weather-sunny'],
  ['🏆', '🥇', '🏅'],
  ['📖', '📚', '📓', '📔', '🗒️'],
  ['📄', '📃', '📝', '📋', '🧾'],
  ['📱', '📲', '☎️', '📞'],
  ['🐶', '🐕'],
  ['🐱', '🐈'],
  ['🔒', '🔓', '🔐', '🔑'],
  ['📷', '📸'],
  ['🚦', '🚥'],
  ['🌥️', '☁️', '🌤️', '🌦️'],
  ['🍬', '🍭', '🍫'],
  ['🍋', '🍋‍🟩'],
  ['🍖', '🥩', '🍗', 'icon:game-icons:steak'],
  ['🧑‍⚕️', '🩺'],
  ['🚿', 'icon:mdi:shower-head'],
  ['🛏️', 'icon:material-symbols:bedroom-parent', 'icon:game-icons:pillow'],
  ['⛽', 'icon:mdi:gas-station'],
  ['💻', 'icon:mdi:laptop', '🖥️', 'icon:mdi:tablet'],
  ['🧳', 'icon:mdi:bag-suitcase', '💼', 'icon:mdi:toolbox'],
  ['👖', 'icon:game-icons:trousers'],
  ['👂', '🦻', 'icon:mdi:ear-hearing'],
  ['💬', 'icon:mdi:message-text'],
  ['🌫️', 'icon:mdi:weather-fog'],
  ['🌬️', 'icon:mdi:weather-windy'],
  ['🛞', 'icon:mdi:tire'],
  ['🏊', 'icon:mdi:pool'],
  ['⚽', 'icon:mdi:soccer-field'],
  ['🪪', 'icon:mdi:card-account-details'],
  ['📚', 'icon:mdi:bookshelf'],
  ['🛋️', 'icon:mdi:sofa-single'],
  ['🛣️', 'icon:mdi:road-variant'],
  ['🚗', 'icon:mdi:car-multiple'],
  ['🔥', 'icon:mdi:campfire'],
  ['🧊', 'icon:mdi:fridge'],
].map((g) => g.map(stripVS16));

const lookalikeMap = new Map<string, string>();
LOOKALIKE.forEach((group, idx) => {
  group.forEach((pic) => lookalikeMap.set(pic, `group${idx}`));
});

export function pictureGroup(pic: string): string {
  const norm = stripVS16(pic);
  return lookalikeMap.get(norm) ?? norm;
}

export function clearPicturesWhere(predicate: (pic: string) => boolean): number {
  let count = 0;
  for (const w of WORDS) {
    if (w.picture && predicate(w.picture)) {
      w.picture = '';
      count++;
    }
  }
  return count;
}

export function wordById(id: string): Word {
  const w = wordMap.get(id);
  if (!w) throw new Error(`未知单词：${id}`);
  return w;
}
