const prefix = 'onda:' + self.registration.scope + ':';
const cacheName = prefix + 'v2';
const shell = ['./', './index.html', './style.css', './app.js', './data.js', './cast.js', './manifest.webmanifest', './vendor/hls.min.js', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable.png', './assets/onda.webp', './assets/demo.m3u', './assets/demo.mp4'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
const allowed = new Set(shell.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  url.hash = '';
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate' && url.origin === self.location.origin
      && (url.pathname === new URL('./', self.registration.scope).pathname
          || url.pathname === new URL('./index.html', self.registration.scope).pathname)) {
    const entry = new URL('./index.html', self.registration.scope);
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(cacheName);
      return await cache.match(entry.href) || Response.error();
    }));
    return;
  }
  if (!allowed.has(url.href) || request.headers.has('range')) return;
  event.respondWith(caches.open(cacheName).then(cache => cache.match(request)).then(response => response || fetch(request)));
});
