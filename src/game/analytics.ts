const ANALYTICS_KEY = 'phc_pXbMQ3veLCS3ULZgJGorFnXbN56b7zachURAcjyT3VrN';
const ANALYTICS_HOST = 'https://us.i.posthog.com';
const TESTER_KEY = 'word-guard:tester';
const OPT_OUT_KEY = 'word-guard:stats-off';
const QUEUE_KEY = 'word-guard:stats-queue';
const FIRST_DAY_KEY = 'word-guard:first-day';
export const BUILD_ID = '20261116-1501';

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLS(key: string, val: string | null): void {
  try {
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, val);
  } catch {
    // ignore storage errors
  }
}

export function testerId(): string {
  let id = readLS(TESTER_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2, 8);
    writeLS(TESTER_KEY, id);
  }
  return readLS(TESTER_KEY) ?? 'unknown';
}

export function isAnalyticsOff(): boolean {
  return readLS(OPT_OUT_KEY) === '1';
}

export function setAnalyticsOff(off: boolean): void {
  writeLS(OPT_OUT_KEY, off ? '1' : null);
  if (off) writeLS(QUEUE_KEY, null);
}

function isProdOrigin(): boolean {
  try {
    return location.protocol === 'https:' && window.top === window.self;
  } catch {
    return false;
  }
}

function enabled(): boolean {
  return isProdOrigin() && !isAnalyticsOff();
}

function localDay(ts: number): number {
  const d = new Date(ts);
  return Math.floor((ts - d.getTimezoneOffset() * 60_000) / 86_400_000);
}

function dayIndex(): number {
  const today = localDay(Date.now());
  const first = Number(readLS(FIRST_DAY_KEY));
  if (first) return Math.max(0, today - first);
  writeLS(FIRST_DAY_KEY, String(today));
  return 0;
}

interface QueuedEvent {
  event: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

function readQueue(): QueuedEvent[] {
  try {
    const parsed = JSON.parse(readLS(QUEUE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let flushing = false;
let flushTimer: number | undefined;

async function flush(): Promise<void> {
  if (flushing || !enabled()) return;
  const batch = readQueue();
  if (!batch.length) return;
  flushing = true;
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(`${ANALYTICS_HOST}/batch/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: ANALYTICS_KEY, batch }),
      keepalive: true,
      signal: ctrl.signal,
    });
    window.clearTimeout(timer);
    if (res.ok) writeLS(QUEUE_KEY, JSON.stringify(readQueue().slice(batch.length)));
  } catch {
    // keep in queue for retry
  } finally {
    flushing = false;
  }
}

export function track(event: string, props: Record<string, unknown> = {}): void {
  if (!enabled()) return;
  const queue = readQueue();
  queue.push({
    event,
    timestamp: new Date().toISOString(),
    properties: {
      ...props,
      distinct_id: testerId(),
      day_n: dayIndex(),
      build: BUILD_ID,
      $process_person_profile: false,
      $geoip_disable: true,
    },
  });
  writeLS(QUEUE_KEY, JSON.stringify(queue.slice(-200)));
  window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => void flush(), 3000);
}

export function trackAppOpen(extra: Record<string, unknown> = {}): void {
  if (!enabled()) return;
  const ua = navigator.userAgent;
  track('app_open', {
    ...extra,
    os: /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X/.test(ua)
            ? 'Mac'
            : 'other',
    wechat: /MicroMessenger/.test(ua),
    portrait: window.innerHeight > window.innerWidth,
    installed: !!window.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches,
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  void flush();
}
