const CACHE_NAME = 'plant-tracker-v3';
const ASSETS = [
  './index.html',
  './script.js',
  './style.css',
  './favicon.svg',
  './manifest.json',
  './screenshot.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method === 'GET' && req.url.includes('/api/')) {
    event.respondWith(
      caches.open('api-cache').then(cache =>
        fetch(req).then(res => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cache.match(req))
      )
    );
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(resp => resp || fetch(req))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(response => response || fetch(req))
  );
});
