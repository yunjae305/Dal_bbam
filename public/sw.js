const cacheName = 'gyeongju-travel-public-v6';
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

async function matchCached(request) {
  const current = await caches.open(cacheName);
  return (await current.match(request)) || caches.match(request);
}

function isCacheable(request, response) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !response || !response.ok) return false;
  if (/private|no-store/i.test(response.headers.get('cache-control') || '')) return false;

  if (url.pathname.startsWith('/_next/static/') || assets.includes(url.pathname)) return true;
  if (isPublicPlaceApi(url.pathname)) {
    return !request.headers.has('authorization') && /\bpublic\b/i.test(response.headers.get('cache-control') || '');
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
  // A replacement waits for the user to save their work and accept the update.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = (await caches.keys()).filter(key => key.startsWith('gyeongju-travel-public-') && key !== cacheName);
    // Keep one previous build for offline places and tabs still using its chunks.
    await Promise.all(keys.slice(0, -1).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.headers.has('authorization')) {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await matchCached('/offline')) || new Response(
      '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>달밤 · 오프라인</title><body><main><h1>인터넷 연결을 확인해 주세요</h1><p>You are offline. Reconnect and try again.</p><a href="/">다시 시도 · Retry</a></main></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    )));
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
      event.waitUntil(caches.open(cacheName).then(async cache => {
        await cache.put(event.request, copy);
        if (isPublicPlaceApi(url.pathname)) {
          const entries = (await cache.keys()).filter(request => isPublicPlaceApi(new URL(request.url).pathname));
          await Promise.all(entries.slice(0, -100).map(request => cache.delete(request)));
        }
      }).catch(() => undefined)); // Storage quota failure must not break a successful network response.
    }
    return response;
  }).catch(() => matchCached(event.request).then(response => response || Response.error())));
});
