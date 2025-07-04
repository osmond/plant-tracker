
const CACHE_NAME = 'plant-tracker-v5';



const ASSETS = [
  './index.html',
  './analytics.html',
  './script.js',
  './analytics.js',
  './style.css',
  './css/tailwind.css',
  './favicon.svg',
  './manifest.json',
  './screenshot.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        ASSETS.map(asset => cache.add(asset).catch(() => {}))
      )
    )
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
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    return;
  }
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
      fetch(req).catch(() => {
        const fallback = req.url.includes('analytics') ?
          './analytics.html' : './index.html';
        return caches.match(fallback);
      })
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(response => response || fetch(req))
  );
});
