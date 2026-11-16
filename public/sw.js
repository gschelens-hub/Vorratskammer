// 552 service worker: offline shell + morning reminder notifications.
const CACHE = '552-v1';
const SHELL = ['/', '/buero-552.webp', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // network first, cache as fallback (keeps the app usable offline, always fresh online)
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/'))),
  );
});

self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { body: e.data && e.data.text() };
  }
  e.waitUntil(
    self.registration.showNotification(data.title || '552', {
      body: data.body || 'Bist du heute im Büro?',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: 'morning-' + (data.date || ''),
      data,
      actions: [
        { action: 'office', title: 'Im Büro' },
        { action: 'mobile', title: 'Mobil' },
        { action: 'away', title: 'Nicht da' },
      ],
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const status = e.action;
  e.waitUntil(
    (async () => {
      if (['office', 'mobile', 'away'].includes(status)) {
        const sub = await self.registration.pushManager.getSubscription();
        if (sub) {
          await fetch('/api/push/answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint, status }),
          }).catch(() => {});
          return;
        }
      }
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (all.length) return all[0].focus();
      return self.clients.openWindow('/');
    })(),
  );
});
