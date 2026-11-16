// 552 – Service Worker (gleiches Muster wie der Abwesenheitsplaner).
// Bei jeder neuen Version CACHE hochzählen und version.txt anpassen.
// Später: Push-Mitteilungen (Morgen-Erinnerung) kommen hier mit 'push'/'notificationclick' dazu.
const CACHE = '552-v4';
const ASSETS = [
  './index.html', './styles.css', './app.js', './data.js', './logic.js', './config.js',
  './icon-192.png', './icon-512.png', './icon-512-maskable.png', './icon-180.png', './favicon-32.png', './manifest.json', './version.txt',
];
// Datenbank-Bibliothek: nach dem ersten Laden aus dem Cache, damit die App auch startet, wenn das CDN hakt
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all([
        c.addAll(ASSETS).catch(() => {}),
        fetch(new Request(LIB, { mode: 'no-cors' })).then((r) => c.put(LIB, r)).catch(() => {}),
      ]),
    ),
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const u = e.request.url;
  if (e.request.method !== 'GET') return;
  if (u === LIB) {
    e.respondWith(
      caches.match(LIB).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const c = res.clone();
            caches.open(CACHE).then((cache) => cache.put(LIB, c));
            return res;
          }),
      ),
    );
    return;
  }
  if (u.includes('supabase.co') || u.includes('cdn.') || u.endsWith('version.txt')) return;
  // Alles andere: erst Netz (damit Änderungen sofort ankommen), offline aus dem Cache
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && new URL(u).origin === location.origin) {
          const c = res.clone();
          const key = e.request.mode === 'navigate' ? './index.html' : e.request;
          caches.open(CACHE).then((cache) => cache.put(key, c));
        }
        return res;
      })
      .catch(() => caches.match(e.request.mode === 'navigate' ? './index.html' : e.request)),
  );
});
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
