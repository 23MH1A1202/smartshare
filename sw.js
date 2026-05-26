const CACHE_VERSION = 'v2';
const PRECACHE_NAME = `instant-share-precache-${CACHE_VERSION}`;
const RUNTIME_NAME = `instant-share-runtime-${CACHE_VERSION}`;
const SHARED_FILE_CACHE = 'shared-file-cache';
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './icon.svg'
];
const NETWORK_FIRST_DESTINATIONS = new Set(['document', 'script', 'style', 'manifest']);
const STATIC_EXTENSIONS = ['.js', '.css', '.json', '.png', '.svg', '.ico', '.webp', '.jpg', '.jpeg', '.gif', '.woff', '.woff2'];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(PRECACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter(key => ![PRECACHE_NAME, RUNTIME_NAME, SHARED_FILE_CACHE].includes(key))
                    .map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

async function networkFirst(request, { cacheName, fallbackUrl } = {}) {
    const cache = await caches.open(cacheName);
    try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response && response.status === 200) {
            await cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        if (fallbackUrl) {
            const fallbackResponse = await caches.match(fallbackUrl);
            if (fallbackResponse) return fallbackResponse;
        }
        return new Response('App is offline.');
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    const networkPromise = fetch(request)
        .then((response) => {
            if (response && response.status === 200) {
                cache.put(request, response.clone());
            }
            return response;
        })
        .catch(() => null);

    if (cachedResponse) {
        networkPromise.catch(() => {});
        return cachedResponse;
    }

    const networkResponse = await networkPromise;
    return networkResponse || new Response('App is offline.');
}

self.addEventListener('fetch', (event) => {
    // 🌟 NATIVE SHARE INTERCEPTOR
    if (event.request.method === 'POST' && event.request.url.includes('/share-receive/')) {
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
                                'Content-Length': file.size.toString(),
                                'X-File-Name': encodeURIComponent(file.name || `Shared_File_${i}`)
                            }
                        }));
                    }
                }

                // 🌟 FIX: Use Absolute Path (/) instead of Relative Path (./)
                const htmlResponse = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1">
                        <meta http-equiv="refresh" content="0;url=/?shared=true">
                        <script>window.location.replace('/?shared=true');</script>
                        <style>
                            body { background: #020617; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: sans-serif; color: white;}
                            .loader { border: 4px solid rgba(255,255,255,0.1); border-left-color: #8b5cf6; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 20px;}
                            @keyframes spin { 100% { transform: rotate(360deg); } }
                        </style>
                    </head>
                    <body>
                        <div class="loader"></div>
                        <h3>Loading file...</h3>
                    </body>
                    </html>
                `;

                return new Response(htmlResponse, {
                    status: 200,
                    headers: { 'Content-Type': 'text/html' }
                });

            } catch (error) {
                console.error('SW Share Error:', error);
                // 🌟 FIX: Use Absolute Path (/)
                return new Response(`<script>window.location.replace('/?error=share_failed');</script>`, {
                    status: 200,
                    headers: { 'Content-Type': 'text/html' }
                });
            }
        })());
        return; 
    }

    // Let external POSTs (Firebase/Cloudinary API calls) pass through untouched
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    const isSameOrigin = url.origin === self.location.origin;

    if (!isSameOrigin) return;

    if (event.request.mode === 'navigate' || event.request.destination === 'document') {
        event.respondWith(networkFirst(event.request, { cacheName: RUNTIME_NAME, fallbackUrl: './index.html' }));
        return;
    }

    if (NETWORK_FIRST_DESTINATIONS.has(event.request.destination) || STATIC_EXTENSIONS.some(ext => url.pathname.endsWith(ext))) {
        event.respondWith(networkFirst(event.request, { cacheName: RUNTIME_NAME }));
        return;
    }

    event.respondWith(staleWhileRevalidate(event.request, RUNTIME_NAME));
});
