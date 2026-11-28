const CACHE_VERSION = 'v12';
const PRECACHE_NAME = `instant-share-precache-${CACHE_VERSION}`;
const RUNTIME_NAME = `instant-share-runtime-${CACHE_VERSION}`;
const SHARED_FILE_CACHE = 'shared-file-cache';
const STATIC_ASSETS = [
    './',
    './index.html',
    './offline.html',
    './style.css',
    './tailwind.css',
    './motion.css',
    './motion.js',
    './main.js',
    './ui.js',
    './customizer.js',
    './firebase.js',
    './vendor/firebase-bundle.js',
    './vendor/peerjs.min.js',
    './vendor/qrcode.min.js',
    './vendor/jsQR.min.js',
    './vendor/jszip.min.js',
    './vendor/purify.min.js',
    './manifest.json',
    './appicon.png',
    './favicon.png',
    './icon.png',
    './appicon-192.png',
    './appicon-512.png'
];

// Scope-relative base (e.g. https://23mh1a1202.github.io/smartshare/) so the app works under a sub-path
const SCOPE_URL = self.registration.scope;
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

// 🌟 UPDATED: Serve the beautifully styled HTML page instead of plain text
async function offlineResponse() {
    const offlinePage = await caches.match('./offline.html');
    if (offlinePage) return offlinePage;
    
    // Failsafe if the offline page somehow didn't cache
    return new Response('App is offline. Please check your connection.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
}

async function networkFirst(request, { cacheName = RUNTIME_NAME, fallbackUrl } = {}) {
    const cache = await caches.open(cacheName);
    try {
        const response = await fetch(request, { cache: 'no-cache' });
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
        return await offlineResponse(); // 🌟 UPDATED to await the new async function
    }
}

async function staleWhileRevalidate(request, cacheName = RUNTIME_NAME) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    const networkPromise = fetch(request)
        .then((response) => {
            if (response && response.status === 200) {
                cache.put(request, response.clone());
            }
            return response;
        })
        .catch((error) => {
            console.debug('SW cache update failed:', error);
            return null;
        });

    if (cachedResponse) {
        return cachedResponse;
    }

    const networkResponse = await networkPromise;
    return networkResponse || await offlineResponse(); // 🌟 UPDATED to await the new async function
}

self.addEventListener('fetch', (event) => {
    // 🌟 NATIVE SHARE INTERCEPTOR (scope-relative so it works on /smartshare/)
    if (event.request.method === 'POST' && new URL(event.request.url).pathname.endsWith('/share-receive/')) {
        event.respondWith((async () => {
            try {
                const formData = await event.request.formData();
                const files = formData.getAll('file').filter(f => f && typeof f !== 'string');
                const sharedText = [formData.get('title'), formData.get('text'), formData.get('url')]
                    .filter(v => typeof v === 'string' && v.trim())
                    .map(v => v.trim());

                // Clear any stale leftovers first
                await caches.delete(SHARED_FILE_CACHE);
                const cache = await caches.open(SHARED_FILE_CACHE);

                if (files.length > 0) {
                    await cache.put(SCOPE_URL + 'shared-file-count', new Response(files.length.toString()));
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        await cache.put(SCOPE_URL + 'shared-file-' + i, new Response(file, {
                            headers: {
                                'Content-Type': file.type || 'application/octet-stream',
                                'Content-Length': file.size.toString(),
                                'X-File-Name': encodeURIComponent(file.name || `Shared_File_${i}`)
                            }
                        }));
                    }
                }
                if (sharedText.length > 0) {
                    // De-duplicate (Android often repeats the URL inside "text")
                    const unique = [...new Set(sharedText)].join('\n');
                    await cache.put(SCOPE_URL + 'shared-text', new Response(unique, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
                }
                return Response.redirect(SCOPE_URL + '?shared=true', 303);
            } catch (error) {
                console.error('SW Share Error:', error);
                return Response.redirect(SCOPE_URL + '?error=share_failed', 303);
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