const CACHE_NAME = 'instant-share-v6';
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
    // 🌟 AGGRESSIVE POST INTERCEPT FOR NATIVE SHARING
    if (event.request.method === 'POST') {
        event.respondWith((async () => {
            try {
                const formData = await event.request.formData();
                const files = formData.getAll('file');

                if (files && files.length > 0) {
                    const cache = await caches.open('shared-file-cache');
                    await cache.put('/shared-file-count', new Response(files.length.toString()));

                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        await cache.put('/shared-file-' + i, new Response(file, {
                            headers: {
                                'Content-Type': file.type || 'application/octet-stream',
                                'Content-Length': file.size,
                                'X-File-Name': encodeURIComponent(file.name || `Shared_File_${i}`)
                            }
                        }));
                    }
                }

                // Safely construct the absolute URL for the redirect
                const redirectUrl = new URL('index.html?shared=true', event.request.url).href;
                return Response.redirect(redirectUrl, 303);

            } catch (error) {
                console.error('SW Share Error:', error);
                const errorUrl = new URL('index.html?error=share_failed', event.request.url).href;
                return Response.redirect(errorUrl, 303);
            }
        })());
        return; 
    }

    // Standard Offline Caching for GET requests
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request);
        }).catch(() => {
            return new Response('App is offline.');
        })
    );
});
