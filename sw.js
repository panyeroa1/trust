const CACHE_NAME = 'orbit-v3';
const ASSETS = ['./', './index.html', './pwa_icon.png'];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
    // Network First, fallback to Cache (Development Mode)
    e.respondWith(
        fetch(e.request)
            .then(res => res)
            .catch(() => caches.match(e.request))
    );
});
