const cacheName = 'gyeongju-travel-public-v5';
const assets = [
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/manifest.webmanifest',
  '/login-spring-bg.webp',
  '/offline'
];
function isPublicPlaceApi(path) {
  return path === '/api/home' || path === '/api/places' || /^\/api\/places\/[^/]+$/.test(path);
}

function isCacheable(request, response) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !response || !response.ok) return false;
  if (/private|no-store/i.test(response.headers.get('cache-control') || '')) return false;

  if (url.pathname.startsWith('/_next/static/') || assets.includes(url.pathname)) return true;
  if (isPublicPlaceApi(url.pathname)) {
    return !request.headers.has('authorization');
  }

  return false;
}

// Precache each asset independently so one missing file cannot block the
// whole service worker from installing (cache.addAll is all-or-nothing).
async function precache() {
  const cache = await caches.open(cacheName);
  await Promise.allSettled(assets.map(asset => cache.add(asset)));
  // Offline is a client view. Warm its emitted JS/CSS as well as HTML so the
  // very first offline visit can display public place data without a prior visit.
  const offline = await cache.match('/offline');
  if (offline) {
    const html = await offline.text();
    const chunks = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"<>]+)"/g)].map(match => match[1]))];
    await Promise.allSettled(chunks.map(chunk => cache.add(chunk)));
  }
}

self.addEventListener('install', event => {
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('gyeongju-travel-public-') && key !== cacheName).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline')));
    return;
  }

  const eligible = url.origin === self.location.origin && (
    url.pathname.startsWith('/_next/static/') ||
    assets.includes(url.pathname) ||
    isPublicPlaceApi(url.pathname)
  );

  if (!eligible) return;

  event.respondWith(fetch(event.request).then(response => {
    if (isCacheable(event.request, response)) {
      const copy = response.clone();
      event.waitUntil(caches.open(cacheName).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(() => caches.match(event.request).then(response => response || Response.error())));
});
