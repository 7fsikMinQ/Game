// 네트워크 우선, 실패하면 캐시. 온라인일 땐 항상 최신 코드를 받고, 오프라인에서도 열린다.
// 파일 목록이나 구조를 바꿀 때는 CACHE 이름의 숫자를 올린다.
const CACHE = 'baseball-v1';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'src/app.js', 'src/data.js', 'src/game.js', 'src/league.js', 'src/rng.js', 'src/sim.js', 'src/storage.js', 'src/util.js', 'src/views.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))),
  );
});
