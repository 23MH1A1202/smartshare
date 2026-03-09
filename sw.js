const CACHE_NAME = 'instant-share-v5';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/main.js',
    '/manifest.json',
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
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

    // 🌟 AGGRESSIVE POST INTERCEPT
    if (event.request.method === 'POST') {
        event.respondWith((async () => {
            try {
                const formData = await event.request.formData();
                const file = formData.get('file');

                if (file) {
                    const cache = await caches.open('shared-file-cache');
                    await cache.put('/shared-file', new Response(file, {
                        headers: {
                            'Content-Type': file.type || 'application/octet-stream',
                            'Content-Length': file.size,
                            'X-File-Name': encodeURIComponent(file.name)
                        }
                    }));
                }
                
                return Response.redirect('/?shared=true', 303);
                
            } catch (error) {
                console.error('SW Share Error:', error);
                return Response.redirect('/?error=share_failed', 303);
            }
        })());
        return;
    }

    // Standard Offline Caching
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request);
        }).catch(() => {
            return new Response('App is offline.');
        })
    );
});
