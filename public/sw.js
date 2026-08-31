// Minimal service worker for issue #74's PWA install support.
//
// Deliberately trivial: an active service worker with a fetch handler is
// what most browsers require for installability, not functional offline
// support - this is an always-online multiplayer game, so no caching
// strategy is implemented here (see the issue's Out of Scope). Do not add
// a CACHE_NAME/caches.open() strategy without a fresh issue for it.

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
    event.respondWith(fetch(event.request));
});
