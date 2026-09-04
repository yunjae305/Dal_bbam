const cacheName = 'gyeongju-travel-public-v4';
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
const publicApiPaths = ['/api/home', '/api/places'];

function isCacheable(request, response) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !response || !response.ok) return false;

  if (url.pathname.startsWith('/_next/static/') || assets.includes(url.pathname)) return true;
  if (publicApiPaths.some(path => url.pathname === path || url.pathname.startsWith(`${path}/`))) {
    return !request.headers.has('authorization');
  }

  return false;
}

// Precache each asset independently so one missing file cannot block the
// whole service worker from installing (cache.addAll is all-or-nothing).
async function precache() {
  const cache = await caches.open(cacheName);
  await Promise.allSettled(assets.map(asset => cache.add(asset)));
}

self.addEventListener('install', event => {
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== cacheName).map(key => caches.delete(key)))));
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
    publicApiPaths.some(path => url.pathname === path || url.pathname.startsWith(`${path}/`))
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
