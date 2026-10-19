const CACHE = 'hustlecity-v0.7.0';
const ASSETS = ['./', './manifest.webmanifest', './terms.html', './privacy.html', './faq.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('supabase')) return;
  if (url.pathname.includes('admin')) return;

  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return resp;
        })
        .catch(() => caches.match(e.request) || caches.match('./'))
    );
    return;
  }

  if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(resp => {
          if (resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return resp;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(r =>
      r || fetch(e.request).then(resp => {
        if (resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => caches.match('./'))
    )
  );
});
