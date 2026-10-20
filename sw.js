const CACHE = 'hustlecity-v14.0';

self.addEventListener('install', e => {
  self.skipWaiting(); // Force the new service worker to take over immediately
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k)) // Delete all old caches
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // For every request, try the network FIRST.
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        // If it works, save a copy to the cache for offline use
        if (resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      })
      .catch(() => {
        // If the network fails (offline), fall back to the cache
        return caches.match(e.request);
      })
  );
});
