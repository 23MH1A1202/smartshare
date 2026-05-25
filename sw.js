const CACHE_NAME = 'instant-share-v9';
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
    const requestUrl = new URL(event.request.url);
    const scopeUrl = new URL(self.registration.scope);
    const scopePath = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
    const scopePathNoSlash = scopePath.length > 1 ? scopePath.slice(0, -1) : scopePath;
    const isShareTargetPath = requestUrl.origin === scopeUrl.origin && (
        requestUrl.pathname === scopePath ||
        requestUrl.pathname === scopePathNoSlash ||
        requestUrl.pathname === `${scopePath}index.html`
    );
    const isShareTargetPost = event.request.method === 'POST' && isShareTargetPath;

    // Intercept share-target POST requests to capture shared files
    if (isShareTargetPost) {
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

                // Return a safe HTML page that redirects to the sharing UI
                const htmlResponse = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1">
                        <meta http-equiv="refresh" content="0;url=./?shared=true">
                        <script>window.location.replace('./?shared=true');</script>
                        <style>
                            body { background: #020617; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                            .loader { border: 4px solid rgba(255,255,255,0.1); border-left-color: #8b5cf6; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; }
                            @keyframes spin { 100% { transform: rotate(360deg); } }
                        </style>
                    </head>
                    <body>
                        <div class="loader"></div>
                    </body>
                    </html>
                `;

                return new Response(htmlResponse, {
                    status: 200,
                    headers: { 'Content-Type': 'text/html' }
                });

            } catch (error) {
                console.error('SW Share Error:', error);
                return new Response(`<script>window.location.replace('./?error=share_failed');</script>`, {
                    status: 200,
                    headers: { 'Content-Type': 'text/html' }
                });
            }
        })());
        return; 
    }

    if (event.request.method !== 'GET') {
        event.respondWith(fetch(event.request));
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
