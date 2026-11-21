import { getCourse, getLevel, type LevelDef } from './content/levels';
import { wordById } from './content/words';
import type { LearningEngine, SessionLog } from './learning/engine';

const DAY_MS = 86_400_000;
const secsToMinutes = (secs: number): number => (secs > 0 ? Math.max(1, Math.round(secs / 60)) : 0);

function tryGetLevel(id: string): LevelDef | null {
  try {
    return getLevel(id);
  } catch {
    return null;
  }
}

function stageLabel(s: SessionLog): string {
  const lvl = tryGetLevel(s.level);
  if (!lvl) return s.level === 'daily-review' ? '今日复习' : '其他';
  if (lvl.unit === undefined) return lvl.title;
  if (lvl.boss) return 'Boss 战';
  if (lvl.eachOnce) return '听写练习';
  return getCourse(lvl.course).stages.find((st) => st.stage === lvl.stage)?.label ?? `第 ${lvl.stage} 步`;
}

function courseLabel(s: SessionLog): string {
  const lvl = tryGetLevel(s.level);
  if (!lvl || lvl.unit === undefined) return '复习';
  const course = getCourse(lvl.course);
  return course.route === 'shanghai' ? `上海${course.short}` : course.short;
}

export interface DayStat {
  date: string;
  minutes: number;
  sessions: number;
  answers: number;
  accuracy: number | null;
}

export interface GroupStat {
  label: string;
  sessions: number;
  winRate: number;
  accuracy: number;
  reactSec: number;
}

export interface HardLevel {
  id: string;
  title: string;
  plays: number;
  fails: number;
}

export interface WeakWord {
  id: string;
  en: string;
  zh: string;
  seen: number;
  missed: number;
}

export interface StatsSummary {
  totalMinutes: number;
  totalSessions: number;
  wordsSeen: number;
  wordsMastered: number;
  days: DayStat[];
  byStage: GroupStat[];
  byCourse: GroupStat[];
  hardLevels: HardLevel[];
  weakWords: WeakWord[];
}

export interface WeekReport {
  from: string;
  to: string;
  activeDays: number;
  minutes: number;
  sessions: number;
  accuracy: number | null;
  wordsPracticed: number;
  wordsNew: number;
  known: number;
  spellable: number;
  days: DayStat[];
  weak: WeakWord[];
  wins: number;
  bestCombo: number;
}

function groupSessions(sessions: SessionLog[], keyFn: (s: SessionLog) => string): GroupStat[] {
  const map = new Map<string, SessionLog[]>();
  for (const s of sessions) {
    const k = keyFn(s);
    map.set(k, [...(map.get(k) ?? []), s]);
  }
  return [...map.entries()].map(([label, list]) => {
    const answers = list.reduce((a, b) => a + b.answers, 0);
    const perfect = list.reduce((a, b) => a + b.perfect, 0);
    const withReact = list.filter((x) => x.reactMs > 0);
    return {
      label,
      sessions: list.length,
      winRate: list.filter((x) => x.result === 'win').length / list.length,
      accuracy: answers ? perfect / answers : 0,
      reactSec: withReact.length
        ? withReact.reduce((a, b) => a + b.reactMs, 0) / withReact.length / 1000
        : 0,
    };
  });
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const monthDay = (ms: number): string => {
  const d = new Date(ms);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export function computeStats(engine: LearningEngine, now: number, dayCount = 7): StatsSummary {
  const sessions = engine.data.sessions ?? [];
  const days: DayStat[] = [];
  for (let i = dayCount - 1; i >= 0; i--) {
    const date = monthDay(now - i * DAY_MS);
    const list = sessions.filter((s) => monthDay(s.at) === date && now - s.at < (dayCount + 1) * DAY_MS);
    const answers = list.reduce((a, b) => a + b.answers, 0);
    const perfect = list.reduce((a, b) => a + b.perfect, 0);
    days.push({
      date,
      minutes: secsToMinutes(list.reduce((a, b) => a + b.secs, 0)),
      sessions: list.length,
      answers,
      accuracy: answers ? perfect / answers : null,
    });
  }

  const byLevel = new Map<string, SessionLog[]>();
  for (const s of sessions) {
    byLevel.set(s.level, [...(byLevel.get(s.level) ?? []), s]);
  }
  const hardLevels: HardLevel[] = [];
  for (const [id, list] of byLevel) {
    const fails = list.filter((s) => s.result !== 'win').length;
    const lvl = tryGetLevel(id);
    if (lvl && (fails >= 2 || (list.length >= 3 && engine.levelStars(id) <= 1))) {
      hardLevels.push({ id, title: lvl.title, plays: list.length, fails });
    }
  }
  hardLevels.sort((a, b) => b.fails - a.fails || b.plays - a.plays);

  const weakWords: WeakWord[] = [];
  for (const id of engine.seenWordIds()) {
    const rec = engine.stat(id, 'recognize');
    const spl = engine.stat(id, 'spell');
    const seen = (rec?.seen ?? 0) + (spl?.seen ?? 0);
    const missed = seen - (rec?.perfect ?? 0) - (spl?.perfect ?? 0);
    if (missed < 2) continue;
    let w;
    try {
      w = wordById(id);
    } catch {
      continue;
    }
    weakWords.push({ id, en: w.en, zh: w.short, seen, missed });
  }
  weakWords.sort((a, b) => b.missed / b.seen - a.missed / a.seen || b.missed - a.missed);

  const seenIds = engine.seenWordIds();
  return {
    totalMinutes: secsToMinutes(sessions.reduce((a, b) => a + b.secs, 0)),
    totalSessions: sessions.length,
    wordsSeen: seenIds.length,
    wordsMastered: seenIds.filter((id) => engine.mastery(id, 'recognize') === 'mastered').length,
    days,
    byStage: groupSessions(sessions, stageLabel).sort((a, b) => b.sessions - a.sessions),
    byCourse: groupSessions(sessions, courseLabel).sort((a, b) => b.sessions - a.sessions),
    hardLevels: hardLevels.slice(0, 8),
    weakWords: weakWords.slice(0, 15),
  };
}

export function computeWeekReport(engine: LearningEngine, now: number): WeekReport {
  const stats = computeStats(engine, now, 7);
  const since = now - 7 * DAY_MS;
  const recent = (engine.data.sessions ?? []).filter((s) => s.at >= since);
  const answers = recent.reduce((a, b) => a + b.answers, 0);
  const perfect = recent.reduce((a, b) => a + b.perfect, 0);

  let wordsPracticed = 0;
  let wordsNew = 0;
  let known = 0;
  let spellable = 0;
  const weak: WeakWord[] = [];
  const isKnown = (m: string) => m === 'familiar' || m === 'mastered';

  for (const id of engine.seenWordIds()) {
    const rec = engine.stat(id, 'recognize');
    const spl = engine.stat(id, 'spell');
    const lastSeen = Math.max(rec?.lastSeen ?? 0, spl?.lastSeen ?? 0);
    if (isKnown(engine.mastery(id, 'recognize'))) known++;
    if (isKnown(engine.mastery(id, 'spell'))) spellable++;
    if (lastSeen < since) continue;

    wordsPracticed++;
    const first = Math.min(rec?.first ?? Infinity, spl?.first ?? Infinity);
    if (first >= since && first !== Infinity) wordsNew++;

    const seen = (rec?.seen ?? 0) + (spl?.seen ?? 0);
    const missed = seen - (rec?.perfect ?? 0) - (spl?.perfect ?? 0);
    const minBox = Math.min(rec?.box ?? 9, spl?.box ?? 9);
    if (missed >= 1 && minBox <= 1) {
      try {
        const w = wordById(id);
        weak.push({ id, en: w.en, zh: w.short, seen, missed });
      } catch {
        // ignore unknown word
      }
    }
  }
  weak.sort((a, b) => b.missed - a.missed || b.missed / b.seen - a.missed / a.seen);

  return {
    from: monthDay(now - 6 * DAY_MS),
    to: monthDay(now),
    activeDays: stats.days.filter((d) => d.answers > 0).length,
    minutes: stats.days.reduce((a, b) => a + b.minutes, 0),
    sessions: recent.length,
    accuracy: answers ? perfect / answers : null,
    wordsPracticed,
    wordsNew,
    known,
    spellable,
    days: stats.days,
    weak: weak.slice(0, 6),
    wins: recent.filter((s) => s.result === 'win').length,
    bestCombo: recent.reduce((a, b) => Math.max(a, b.combo ?? 0), 0),
  };
}

const fmtPct = (v: number | null): string => (v === null ? '-' : `${Math.round(v * 100)}%`);

export function formatStatsText(stats: StatsSummary, engine: LearningEngine, extra: string): string {
  const lines: string[] = [];
  lines.push(
    `【单词守卫 学习记录】累计 ${stats.totalMinutes} 分钟、${stats.totalSessions} 局；见过 ${stats.wordsSeen} 词，会了 ${stats.wordsMastered} 词`,
  );
  const pl = engine.data.placement;
  if (pl) {
    lines.push(`水平测试：第 ${pl.band} 段，起点 ${pl.course ?? 'ket'} 第 ${pl.unit + 1} 单元`);
  }
  lines.push(
    '最近 7 天（日期 分钟/局/答题/一次答对）：' +
      stats.days.map((d) => `${d.date} ${d.minutes}/${d.sessions}/${d.answers}/${fmtPct(d.accuracy)}`).join('；'),
  );
  lines.push(
    '按玩法（局数 过关率 一次答对 平均反应）：' +
      stats.byStage
        .map((g) => `${g.label} ${g.sessions} ${fmtPct(g.winRate)} ${fmtPct(g.accuracy)} ${g.reactSec.toFixed(1)}s`)
        .join('；'),
  );
  lines.push(
    '按课程：' +
      stats.byCourse
        .map((g) => `${g.label} ${g.sessions} ${fmtPct(g.winRate)} ${fmtPct(g.accuracy)} ${g.reactSec.toFixed(1)}s`)
        .join('；'),
  );
  if (stats.hardLevels.length) {
    lines.push(
      '卡住的关（玩/没过）：' + stats.hardLevels.map((h) => `${h.id} ${h.plays}/${h.fails}`).join('；'),
    );
  }
  if (stats.weakWords.length) {
    lines.push(
      '常错的词（错/见）：' + stats.weakWords.map((w) => `${w.en} ${w.missed}/${w.seen}`).join('；'),
    );
  }
  const recent = (engine.data.sessions ?? []).slice(-20);
  if (recent.length) {
    lines.push('最近 20 局（关卡 结果 秒 答题 一次对 漏 点错 反应ms）：');
    for (const s of recent) {
      lines.push(
        `${s.level} ${s.result}${s.stars ? s.stars + '★' : ''} ${s.secs} ${s.answers} ${s.perfect} ${s.missed} ${s.wrong} ${s.reactMs}`,
      );
    }
  }
  if (extra) lines.push(extra);
  return lines.join('\n');
}
