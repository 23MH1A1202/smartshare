const CACHE_NAME = 'instant-share-v2';
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './manifest.json',
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    
    // --- 🌟 NEW: Catch Mobile Native "Share To" Requests ---
    if (event.request.method === 'POST' && event.request.url.endsWith('/share')) {
        event.respondWith((async () => {
            try {
                const formData = await event.request.formData();
                const file = formData.get('file');

                if (file) {
                    const cache = await caches.open('shared-file-cache');
                    // Temporarily hold the file in cache so the frontend can grab it
                    await cache.put('/shared-file', new Response(file, {
                        headers: {
                            'Content-Type': file.type || 'application/octet-stream',
                            'Content-Length': file.size,
                            'X-File-Name': encodeURIComponent(file.name)
                        }
                    }));
                }
                // Redirect the app to the homepage and tell it a file is waiting
                return Response.redirect('/?shared=true', 303);
            } catch (error) {
                console.error('Share target error:', error);
                return Response.redirect('/', 303);
            }
        })());
        return;
    }

    // --- STANDARD OFFLINE CACHING ---
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request);
        }).catch(() => {
            return new Response('App is offline.');
        })
    );
});
