import { COURSES_DATA, type CourseUnitDef } from './courses';
import { KET_UNITS } from './ket';
import { PET_UNITS } from './pet';
import { wordById } from './words';

export type LevelMode = 'listen' | 'reverse' | 'spell';
export type RouteId = 'cambridge' | 'shanghai';

export interface StageTemplate {
  stage: number;
  label: string;
  mode: LevelMode;
  showText: boolean;
  tip: string;
  blanks?: number;
  cloze?: boolean;
  dictation?: boolean;
  monsters: number;
  maxOnScreen: number;
  crossSeconds: number;
  spawnGap: [number, number];
}

export interface CourseInfo {
  id: string;
  title: string;
  short: string;
  route: RouteId;
  edition: string;
  source: string;
  units: CourseUnitDef[];
  stages: StageTemplate[];
  hearts: number;
}

export interface LevelDef {
  id: string;
  course: string;
  chapter: string;
  unit?: number;
  stage: number;
  theme: 'unit' | 'mixed';
  title: string;
  tip: string;
  mode: LevelMode;
  showText: boolean;
  blanks?: number;
  cloze?: boolean;
  dictation?: boolean;
  eachOnce?: boolean;
  boss?: boolean;
  hearts?: number;
  monsters: number;
  maxOnScreen: number;
  crossSeconds: number;
  spawnGap: [number, number];
  wordIds: string[];
}

export interface ChapterDef {
  id: string;
  course: string;
  route: RouteId;
  title: string;
  units: number[];
  levels: LevelDef[];
}

export function maxSpellWrongs(blanks: number): number {
  return blanks <= 1 ? 1 : Math.min(5, Math.max(2, Math.ceil(blanks / 2) + 1));
}

export function nextBlankIndex(blanks: boolean[], from: number): number {
  let i = from;
  while (i < blanks.length && !blanks[i]) i++;
  return i;
}

const listenStage = (
  showText: boolean,
  monsters: number,
  maxOnScreen: number,
  crossSeconds: number,
  spawnGap: [number, number],
): Omit<StageTemplate, 'stage'> => ({
  label: showText ? '听+看' : '纯听',
  mode: 'listen',
  showText,
  tip: showText ? '听单词、看单词，点举着它的小怪！' : '只听声音，找到它！',
  monsters,
  maxOnScreen,
  crossSeconds,
  spawnGap,
});

const STARTER_STAGES: StageTemplate[] = [
  { stage: 1, ...listenStage(true, 8, 3, 26, [3, 4.5]) },
  { stage: 2, ...listenStage(false, 10, 3, 25, [2.8, 4.2]) },
  {
    stage: 3,
    label: '看图选',
    mode: 'reverse',
    showText: false,
    tip: '看图，点举着对应英文的小怪！',
    monsters: 8,
    maxOnScreen: 3,
    crossSeconds: 26,
    spawnGap: [3, 4.5],
  },
  {
    stage: 4,
    label: '补字母',
    mode: 'spell',
    showText: false,
    tip: '把缺的字母补上！',
    blanks: 0.34,
    monsters: 6,
    maxOnScreen: 2,
    crossSeconds: 42,
    spawnGap: [7, 10],
  },
];

const MOVER_STAGES: StageTemplate[] = [
  { stage: 1, ...listenStage(true, 10, 4, 24, [2.8, 4]) },
  { stage: 2, ...listenStage(false, 12, 4, 25, [2.6, 3.8]) },
  {
    stage: 3,
    label: '认英文',
    mode: 'reverse',
    showText: false,
    tip: '看图或中文，点举着对应英文的小怪！',
    monsters: 10,
    maxOnScreen: 4,
    crossSeconds: 24,
    spawnGap: [2.8, 4],
  },
  {
    stage: 4,
    label: '补字母',
    mode: 'spell',
    showText: false,
    tip: '把缺的字母补上！',
    blanks: 0.5,
    monsters: 6,
    maxOnScreen: 3,
    crossSeconds: 40,
    spawnGap: [6, 9],
  },
  {
    stage: 5,
    label: '听写',
    mode: 'spell',
    showText: false,
    dictation: true,
    tip: '只听发音，把缺的字母补上！',
    blanks: 0.5,
    monsters: 6,
    maxOnScreen: 3,
    crossSeconds: 44,
    spawnGap: [7, 10],
  },
];

const UPPER_STAGES: StageTemplate[] = [
  {
    stage: 1,
    ...listenStage(true, 10, 4, 23, [2.8, 4]),
    tip: '听单词、看单词，点举着它意思的小怪！',
  },
  {
    stage: 2,
    ...listenStage(false, 12, 4, 24, [2.6, 3.8]),
    tip: '只听声音，找到它的意思！',
  },
  {
    stage: 3,
    label: '认英文',
    mode: 'reverse',
    showText: false,
    tip: '看中文意思，点举着对应英文的小怪！',
    monsters: 10,
    maxOnScreen: 4,
    crossSeconds: 23,
    spawnGap: [2.8, 4],
  },
  {
    stage: 4,
    label: '拼写',
    mode: 'spell',
    showText: false,
    tip: '拼出最前面小怪举着的词！',
    monsters: 6,
    maxOnScreen: 3,
    crossSeconds: 38,
    spawnGap: [6, 9],
  },
  {
    stage: 5,
    label: '听写',
    mode: 'spell',
    showText: false,
    dictation: true,
    tip: '只听发音，拼出这个词！',
    monsters: 6,
    maxOnScreen: 3,
    crossSeconds: 42,
    spawnGap: [7, 10],
  },
];

const CLOZE_STAGES: StageTemplate[] = UPPER_STAGES.map((s) =>
  s.stage === 3
    ? {
        ...s,
        label: '例句填空',
        cloze: true,
        tip: '看句子和意思，点能填进空格的英文！',
        crossSeconds: 26,
      }
    : s,
);

const MIN_SPELLABLE = 4;
const CN_GRADES = ['一', '二', '三', '四', '五'];

function buildCourseFromDef(id: string): CourseInfo {
  const def = COURSES_DATA.find((c) => c.id === id);
  if (!def) throw new Error(`未知课程定义：${id}`);
  if (id.startsWith('sh-')) {
    const grade = Number(id[3]);
    const stages = grade <= 2 ? STARTER_STAGES : grade <= 4 ? MOVER_STAGES : UPPER_STAGES;
    return {
      ...def,
      short: `${CN_GRADES[grade - 1]}年级${id[4] === 'a' ? '上' : '下'}`,
      stages,
      hearts: grade <= 2 ? 4 : 3,
    };
  }
  if (id === 'yle-starters') {
    return { ...def, short: 'Starters', stages: STARTER_STAGES, hearts: 4 };
  }
  return { ...def, short: 'Movers', stages: MOVER_STAGES, hearts: 3 };
}

const KET_COURSE: CourseInfo = {
  id: 'ket',
  title: '剑桥 A2 Key（KET）',
  short: 'KET',
  route: 'cambridge',
  edition: '',
  source: 'Cambridge A2 Key 词表',
  units: KET_UNITS.map((words, i) => ({ title: `第 ${i + 1} 单元`, words: [...words] })),
  stages: CLOZE_STAGES,
  hearts: 3,
};

const PET_COURSE: CourseInfo = {
  id: 'pet',
  title: '剑桥 B1 Preliminary（PET）',
  short: 'PET',
  route: 'cambridge',
  edition: '',
  source: 'Cambridge B1 Preliminary 词表',
  units: PET_UNITS.map((words, i) => ({ title: `第 ${i + 1} 单元`, words: [...words] })),
  stages: CLOZE_STAGES,
  hearts: 3,
};

export const COURSES: CourseInfo[] = [
  buildCourseFromDef('yle-starters'),
  buildCourseFromDef('yle-movers'),
  KET_COURSE,
  PET_COURSE,
  ...COURSES_DATA.filter((c) => c.route === 'shanghai').map((c) => buildCourseFromDef(c.id)),
];

const courseMap = new Map<string, CourseInfo>(COURSES.map((c) => [c.id, c]));

export function getCourse(id: string): CourseInfo {
  const c = courseMap.get(id);
  if (!c) throw new Error(`未知课程：${id}`);
  return c;
}

export function coursesForRoute(route: RouteId): CourseInfo[] {
  return COURSES.filter((c) => c.route === route);
}

export function unitLevelId(courseId: string, unit: number, stage: number): string {
  return `${courseId}-u${unit + 1}-${stage}`;
}

export function bossLevelId(courseId: string, unit: number): string {
  return `${courseId}-u${unit + 1}-boss`;
}

export function unitDisplayTitle(course: CourseInfo, unit: number): string {
  return course.id === 'ket' || course.id === 'pet' || course.route === 'cambridge'
    ? `${course.short} 第 ${unit + 1} 单元`
    : `${course.short} ${course.units[unit].title}`;
}

function buildUnitLevels(course: CourseInfo, unit: number, chapterId: string): LevelDef[] {
  const words = course.units[unit].words;
  const titleBase = unitDisplayTitle(course, unit);
  const levels: LevelDef[] = [];

  for (const st of course.stages) {
    let wordIds = words;
    if (st.mode === 'spell') {
      wordIds = words.filter((id) => wordById(id).spellable);
      if (wordIds.length < MIN_SPELLABLE) continue;
    }
    levels.push({
      id: unitLevelId(course.id, unit, st.stage),
      course: course.id,
      chapter: chapterId,
      unit,
      stage: st.stage,
      theme: 'unit',
      title: `${titleBase} · ${st.label}`,
      tip: st.tip,
      mode: st.mode,
      showText: st.showText,
      blanks: st.blanks,
      cloze: st.cloze,
      dictation: st.dictation,
      hearts: course.hearts,
      monsters: st.monsters,
      maxOnScreen: Math.max(2, Math.min(st.maxOnScreen, wordIds.length - 2)),
      crossSeconds: st.crossSeconds,
      spawnGap: st.spawnGap,
      wordIds,
    });
  }

  const refStage = course.stages.find((s) => s.stage === 2) ?? course.stages[0];
  levels.push({
    id: bossLevelId(course.id, unit),
    course: course.id,
    chapter: chapterId,
    unit,
    stage: 9,
    theme: 'unit',
    title: `${titleBase} · Boss 战`,
    tip: '只听声音！每打倒一只小怪，Boss 掉一格血',
    mode: 'listen',
    showText: false,
    boss: true,
    hearts: course.hearts,
    monsters: refStage.monsters,
    maxOnScreen: Math.max(2, Math.min(refStage.maxOnScreen, words.length - 2)),
    crossSeconds: refStage.crossSeconds,
    spawnGap: refStage.spawnGap,
    wordIds: words,
  });

  return levels;
}

const unitLevelMap = new Map<string, LevelDef[]>();
export const CHAPTERS: ChapterDef[] = [];

for (const course of COURSES) {
  const pages = Math.ceil(course.units.length / 10);
  for (let p = 0; p < pages; p++) {
    const chapterId = `${course.id}-p${p + 1}`;
    const units: number[] = [];
    for (let u = p * 10; u < Math.min(course.units.length, (p + 1) * 10); u++) {
      units.push(u);
    }
    const levels = units.flatMap((u) => {
      const lvls = buildUnitLevels(course, u, chapterId);
      unitLevelMap.set(`${course.id}:${u}`, lvls);
      return lvls;
    });
    const title =
      course.route === 'cambridge'
        ? `${course.short} ${p + 1}`
        : pages > 1
          ? `${course.title}（${p + 1}）`
          : course.title;
    CHAPTERS.push({
      id: chapterId,
      course: course.id,
      route: course.route,
      title,
      units,
      levels,
    });
  }
}

export function chaptersForRoute(route: RouteId): ChapterDef[] {
  return CHAPTERS.filter((c) => c.route === route);
}

export const LEVELS: LevelDef[] = CHAPTERS.flatMap((c) => c.levels);

export function unitLevels(courseId: string, unit: number): LevelDef[] {
  return unitLevelMap.get(`${courseId}:${unit}`) ?? [];
}

export function cambridgeUnitIndex(courseId: string, unit: number): number {
  let offset = 0;
  for (const c of coursesForRoute('cambridge')) {
    if (c.id === courseId) return offset + unit;
    offset += c.units.length;
  }
  return -1;
}

export function dictationLevelId(courseId: string, unit: number): string {
  return `${courseId}-u${unit + 1}-dict`;
}

export function unitSpellableWords(courseId: string, unit: number): string[] {
  return (getCourse(courseId).units[unit]?.words ?? []).filter((id) => wordById(id).spellable);
}

const tempLevels = new Map<string, LevelDef>();

export function registerTempLevel(level: LevelDef): void {
  tempLevels.set(level.id, level);
}

export function dictationLevel(courseId: string, unit: number, only?: string[]): LevelDef | null {
  const course = getCourse(courseId);
  if (!course.units[unit]) return null;
  const all = unitSpellableWords(courseId, unit);
  const picked = only ? all.filter((id) => only.includes(id)) : [];
  const words = picked.length ? picked : all.slice(0, 14);
  if (all.length < 3 || words.length < 1) return null;
  const lvl: LevelDef = {
    id: dictationLevelId(courseId, unit),
    course: courseId,
    chapter: 'dictation',
    unit,
    stage: 8,
    theme: 'unit',
    title: `${unitDisplayTitle(course, unit)} · 听写练习`,
    tip: '只听发音，把整个词拼出来。每个词考一次，可以点喇叭再听',
    mode: 'spell',
    showText: false,
    dictation: true,
    eachOnce: true,
    hearts: 5,
    monsters: words.length,
    maxOnScreen: Math.min(2, words.length),
    crossSeconds: 48,
    spawnGap: [6, 8],
    wordIds: words,
  };
  registerTempLevel(lvl);
  return lvl;
}

const levelMap = new Map<string, LevelDef>(LEVELS.map((l) => [l.id, l]));

export function getLevel(id: string): LevelDef {
  let lvl = levelMap.get(id) ?? tempLevels.get(id);
  const m = !lvl && /^(.+)-u(\d+)-dict$/.exec(id);
  if (m && courseMap.has(m[1])) {
    lvl = dictationLevel(m[1], Number(m[2]) - 1) ?? undefined;
  }
  if (!lvl) throw new Error(`未知关卡：${id}`);
  return lvl;
}

export function nextLevel(id: string): LevelDef | undefined {
  const idx = LEVELS.findIndex((l) => l.id === id);
  const nxt = idx >= 0 ? LEVELS[idx + 1] : undefined;
  if (!nxt) return undefined;
  const cur = LEVELS[idx];
  if (
    (nxt.course === cur.course || getCourse(cur.course).route === 'cambridge') &&
    getCourse(nxt.course).route === getCourse(cur.course).route
  ) {
    return nxt;
  }
  return undefined;
}
