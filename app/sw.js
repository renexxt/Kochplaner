// Offline-Modus (F17): die App-Dateien werden nach dem ersten Laden zwischengespeichert.
// Strategie: Netz zuerst (mit kurzer Wartezeit), sonst Zwischenspeicher. So kommen Updates an, und ohne Netz laeuft die App trotzdem.
// Anfragen an die Schnittstelle (andere Adresse) und alle Schreibzugriffe gehen unveraendert durch.
const VERSION = '1.2.0';
const CACHE = `kochplaner-${VERSION}`;
const DATEIEN = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'js/main.js', 'js/state.js', 'js/version.js',
  'js/adapters/api.js', 'js/adapters/clipboard.js', 'js/adapters/storage.js',
  'js/content/help.js', 'js/content/import_prompt.js',
  'js/core/dates.js', 'js/core/export.js', 'js/core/format.js', 'js/core/fraction.js', 'js/core/kcal.js', 'js/core/normalize.js', 'js/core/parse.js', 'js/core/parser.js',
  'js/core/plan.js', 'js/core/ratings.js', 'js/core/setupcode.js', 'js/core/shopping.js', 'js/core/shuffle.js',
  'js/ui/chooser.js', 'js/ui/dom.js', 'js/ui/tour.js',
  'js/ui/views/dishForm.js', 'js/ui/views/dishes.js', 'js/ui/views/help.js', 'js/ui/views/plan.js', 'js/ui/views/ranking.js', 'js/ui/views/settings.js', 'js/ui/views/shopping.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('kochplaner-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const mitZeitlimit = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('zeit')), ms))]);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/exec') || url.pathname.startsWith('/__mock')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await mitZeitlimit(fetch(req), 4000);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
      if (hit) return hit;
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
