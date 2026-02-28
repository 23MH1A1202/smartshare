const CACHE_NAME = 'instant-share-v1';
const ASSETS = [
  './',
  './index.html',
  './main.js',
  './style.css',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js'
];

// Install: Cache everything
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    })
  );
});

// Fetch: Offline-First strategy
self.addEventListener('fetch', (event) => {
  // Special handling for Web Share Target (POST requests)
  if (event.request.method === 'POST' && event.request.url.includes('/share')) {
    event.respondWith(Response.redirect('./?shared=true'));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
