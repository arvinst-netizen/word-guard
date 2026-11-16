// 自动生成：python3 scripts/make-pwa.py（版本 6f567f0f5b）
// 离线缓存：网页和各种清单先联网取最新（网页 3 秒、清单 1 秒取不到就用缓存）；录音、图片文件名带哈希，取过就一直用缓存。
const CACHE = 'word-guard-v1';
const FRESH = ['index.html', 'audio/index.json', 'art/index.json', 'art/reject.json', 'art/ui/index.json', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'manifest.webmanifest', 'icon-192.png'])).catch(() => undefined));
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

function fresh(req) {
  return caches.open(CACHE).then((c) => {
    const net = fetch(req).then((r) => {
      if (r.ok) c.put(req, r.clone());
      return r;
    });
    // 清单类的小文件只等 1 秒：网慢时马上用上次存的，游戏开机不卡；新的取到后存下来，下次就用上
    const wait = /\.json$/.test(new URL(req.url).pathname) ? 1000 : 3000;
    const late = new Promise((res) => setTimeout(() => c.match(req).then((m) => m && res(m)), wait));
    return Promise.race([net.catch(() => c.match(req)), late]).then((r) => r || net);
  });
}

function cached(req) {
  return caches.open(CACHE).then((c) =>
    c.match(req).then((m) => m || fetch(req).then((r) => {
      if (r.ok) c.put(req, r.clone());
      return r;
    })),
  );
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (path === '' || FRESH.includes(path) || req.mode === 'navigate') e.respondWith(fresh(req));
  else e.respondWith(cached(req));
});
