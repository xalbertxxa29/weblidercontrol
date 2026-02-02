const CACHE_NAME = 'weblider-cache-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './menu.html',
    './menu.css',
    './login.css',
    './logo_liberman.png',
    './menu.js',
    './script.js',
    './access-control.js',
    './firebase-config.js',
    './favicon.ico'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching static assets');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[SW] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Estrategia: Stale-While-Revalidate para archivos estáticos locales
    // Network-First para todo lo demás (especialmente llamadas a API/Firebase)

    if (event.request.url.includes(self.location.origin)) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                    });
                    return networkResponse;
                });
                return cachedResponse || fetchPromise;
            })
        );
    } else {
        // Para CDN y otros externos, intentar fetch, si falla buscar en cache (si existiera)
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
    }
});
