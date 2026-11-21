import { KET_UNITS } from './content/ket';
import { getCourse } from './content/levels';
import { PET_UNITS } from './content/pet';
import { wordById } from './content/words';
import { shuffle, type Rng } from './rng';

const START_BAND = 1;
const P_KNOWN = 0.85;
const P_GUESS = 0.2;
const FAST_STEPS = 8;

const courseWordsFlat = (id: string): string[] => getCourse(id).units.flatMap((u) => u.words);

const BANDS: string[][] = (() => {
  const starters = [...new Set(courseWordsFlat('yle-starters'))];
  const seen = new Set(starters);
  const movers = [...new Set(courseWordsFlat('yle-movers'))].filter((w) => !seen.has(w));
  movers.forEach((w) => seen.add(w));

  const ket = KET_UNITS.flat().filter((w) => !seen.has(w));
  const out: string[][] = [starters, movers];
  const ketStep = Math.ceil(ket.length / 5);
  for (let i = 0; i < 5; i++) out.push(ket.slice(i * ketStep, (i + 1) * ketStep));

  const pet = PET_UNITS.flat();
  const petStep = Math.ceil(pet.length / 3);
  for (let i = 0; i < 3; i++) out.push(pet.slice(i * petStep, (i + 1) * petStep));

  return out;
})();

export function placementStart(band: number): { course: string; unit: number } {
  if (band <= 0) return { course: 'yle-starters', unit: 0 };
  if (band === 1) return { course: 'yle-movers', unit: 0 };
  if (band <= 6) return { course: 'ket', unit: Math.floor(((band - 2) / 5) * KET_UNITS.length) };
  return { course: 'pet', unit: Math.floor(((band - 7) / 3) * PET_UNITS.length) };
}

export function placementLabel(band: number): string {
  return (
    [
      '剑桥 Starters',
      '剑桥 Movers',
      'KET 入门',
      'KET 基础',
      'KET 进阶',
      'KET 提高',
      'KET 冲刺',
      'PET 入门',
      'PET 进阶',
      'PET 冲刺',
    ][band] ?? ''
  );
}

export interface PlacementItem {
  wordId: string;
  band: number;
  options: string[];
  answer: number;
}

export interface PlacementAnswer {
  item: PlacementItem;
  choice: number | null;
  correct: boolean;
}

export interface PlacementResult {
  band: number;
  course: string;
  unit: number;
  at: number;
  correct: number;
  total: number;
  label: string;
}

export class PlacementTest {
  private rng: Rng;
  band = START_BAND;
  private streak = 0;
  answers: PlacementAnswer[] = [];
  current: PlacementItem;
  private used = new Set<string>();

  constructor(rng: Rng) {
    this.rng = rng;
    this.current = this.makeItem(this.band);
  }

  get done(): boolean {
    return this.answers.length >= 24;
  }

  get index(): number {
    return this.answers.length;
  }

  answer(choice: number | null): PlacementAnswer {
    const item = this.current;
    const correct = choice !== null && choice === item.answer;
    const rec: PlacementAnswer = { item, choice, correct };
    this.answers.push(rec);
    if (correct) {
      this.streak += 1;
      const need = this.answers.length <= FAST_STEPS ? 1 : 2;
      if (this.streak >= need && this.band < 9) {
        this.band += 1;
        this.streak = 0;
      }
    } else {
      this.streak = 0;
      if (this.band > 0) --this.band;
    }
    if (!this.done) this.current = this.makeItem(this.band);
    return rec;
  }

  result(now: number): PlacementResult {
    let bestBand = 0;
    let bestScore = -Infinity;
    for (let b = 0; b < 10; b++) {
      let score = 0;
      for (const ans of this.answers) {
        const p = ans.item.band <= b ? P_KNOWN : P_GUESS;
        score += Math.log(ans.correct ? p : 1 - p);
      }
      if (score > bestScore + 1e-9) {
        bestScore = score;
        bestBand = b;
      }
    }
    return {
      band: bestBand,
      ...placementStart(bestBand),
      at: now,
      correct: this.answers.filter((a) => a.correct).length,
      total: this.answers.length,
      label: placementLabel(bestBand),
    };
  }

  private makeItem(band: number): PlacementItem {
    const pool = BANDS[band].filter((w) => !this.used.has(w));
    const wordId = pool[Math.floor(this.rng() * pool.length)] ?? BANDS[band][0];
    this.used.add(wordId);
    const word = wordById(wordId);
    const correct = word.short;
    const others = shuffle(
      BANDS[band].filter((w) => w !== wordId),
      this.rng,
    );
    const usedMeanings = new Set(word.meanings);
    const distractors: string[] = [];
    for (const id of others) {
      const w = wordById(id);
      if (w.meanings.some((m) => usedMeanings.has(m)) || distractors.includes(w.short)) continue;
      distractors.push(w.short);
      for (const m of w.meanings) usedMeanings.add(m);
      if (distractors.length === 3) break;
    }
    const options = shuffle([correct, ...distractors], this.rng);
    return { wordId, band, options, answer: options.indexOf(correct) };
  }
}
