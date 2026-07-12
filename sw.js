const CACHE_NAME = 'taskshoot-mvp-v2';
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(['./', './index.html', './styles.css', './app.js', './manifest.json']))));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request))));
