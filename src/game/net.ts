const CACHE_NAME = 'word-guard-v1';

async function readCacheJson<T>(url: string): Promise<T | null> {
  try {
    if (typeof caches === 'undefined') return null;
    const match = await (await caches.open(CACHE_NAME)).match(new URL(url, location.href).href);
    return match ? ((await match.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function fetchJsonFast<T = unknown>(path: string, timeoutMs = 1500): Promise<T | null> {
  const fullUrl = new URL(path, location.href).href;
  const net = (async (): Promise<T | null> => {
    const res = await fetch(fullUrl, { cache: 'no-cache' });
    if (!res.ok) return null;
    try {
      if (typeof caches !== 'undefined') {
        await (await caches.open(CACHE_NAME)).put(fullUrl, res.clone());
      }
    } catch {
      // ignore cache write error
    }
    return (await res.json()) as T;
  })().catch(() => null);

  const race = await Promise.race([
    net,
    new Promise<'late'>((resolve) => setTimeout(() => resolve('late'), timeoutMs)),
  ]);
  if (race && race !== 'late') return race;
  const cached = await readCacheJson<T>(fullUrl);
  if (cached) return cached;
  if (race === 'late') {
    return Promise.race([
      net,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  }
  return null;
}

export function warmCacheUrls(urls: string[]): void {
  if (typeof caches === 'undefined' || location.protocol === 'file:' || !urls.length) return;
  const run = async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      for (const u of urls) {
        const full = new URL(u, location.href).href;
        if (await cache.match(full)) continue;
        const res = await fetch(full).catch(() => null);
        if (res?.ok) await cache.put(full, res).catch(() => undefined);
      }
    } catch {
      // ignore
    }
  };
  setTimeout(() => void run(), 4000);
}
