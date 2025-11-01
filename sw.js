/* B-Frame service worker – v1.0 */
const CACHE = 'b-frame-v3.0';
const APP_SHELL = [
  '/b-frame/',
  '/b-frame/index.html',
  '/b-frame/manifest.webmanifest'
];

// During install, cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL);
    self.skipWaiting();
  })());
});

// Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k!==CACHE) && caches.delete(k)));
    self.clients.claim();
  })());
});

// Helper: detect video requests (avoid caching huge blobs)
function isVideoRequest(req) {
  const url = new URL(req.url);
  const ext = url.pathname.split('.').pop().toLowerCase();
  if (['mp4','webm','ogg','mov','mkv','m4v'].includes(ext)) return true;
  const accept = req.headers.get('accept') || '';
  return accept.includes('video/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Navigation requests: serve app shell for offline
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        // Put a copy of index if root navigation
        const copy = fresh.clone();
        // If we navigated to /b-frame/ or /b-frame, keep index cached
        if (new URL(request.url).pathname.replace(/\/+$/,'/') === '/b-frame/') {
          const cache = await caches.open(CACHE);
          cache.put('/b-frame/index.html', copy);
        }
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE);
        const cached = await cache.match('/b-frame/index.html');
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Never cache videos (network first; fallback to error)
  if (isVideoRequest(request)) {
    event.respondWith(fetch(request).catch(() => new Response('Video offline', { status: 503 })));
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const fetchPromise = fetch(request).then((resp) => {
      // Only cache OK, same-origin GET
      try {
        const url = new URL(request.url);
        if (request.method === 'GET' && url.origin === location.origin && resp.ok) {
          cache.put(request, resp.clone());
        }
      } catch {}
      return resp;
    }).catch(() => null);
    return cached || fetchPromise || new Response('Offline', { status: 503 });
  })());
});
