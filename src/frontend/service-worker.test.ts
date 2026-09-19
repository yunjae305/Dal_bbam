import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type WorkerEvent = { request?: Request; respondWith: ReturnType<typeof vi.fn>; waitUntil: ReturnType<typeof vi.fn> };
function worker(response = Response.json({ data: [] }, { headers: { 'Cache-Control': 'public' } })) {
  const listeners: Record<string, (event: WorkerEvent) => void> = {};
  const put = vi.fn();
  const remove = vi.fn();
  const network = vi.fn(async () => response);
  const cached = vi.fn(async () => undefined);
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    URL, Response, fetch: network,
    caches: { match: cached, keys: async () => ['other-app', 'gyeongju-travel-public-v4', 'gyeongju-travel-public-v5', 'gyeongju-travel-public-v6'], delete: remove, open: async () => ({ put, match: cached, keys: async () => [] }) },
    self: { location: { origin: 'https://example.com' }, addEventListener: (type: string, handler: (event: WorkerEvent) => void) => { listeners[type] = handler; }, clients: { claim: vi.fn() } }
  });
  return { listeners, put, network, remove, cached };
}

describe('public-only service worker cache', () => {
  it('precaches the offline route scripts and styles for the first offline visit', async () => {
    const listeners: Record<string, (event: WorkerEvent) => void> = {};
    const add = vi.fn(async () => undefined);
    runInNewContext(readFileSync('public/sw.js', 'utf8'), {
      URL, Response,
      caches: { open: async () => ({ add, match: async () => new Response('<script src="/_next/static/chunks/offline.js"></script><link href="/_next/static/css/main.css"><script src="https://untrusted.example/script.js"></script>') }) },
      self: { addEventListener: (type: string, handler: (event: WorkerEvent) => void) => { listeners[type] = handler; }, skipWaiting: vi.fn() }
    });
    const event = { respondWith: vi.fn(), waitUntil: vi.fn() };
    listeners.install(event);
    await event.waitUntil.mock.calls[0][0];
    expect(add).toHaveBeenCalledWith('/_next/static/chunks/offline.js');
    expect(add).toHaveBeenCalledWith('/_next/static/css/main.css');
    expect(add).not.toHaveBeenCalledWith('https://untrusted.example/script.js');
  });
  it('does not intercept any private or personalized API', () => {
    const { listeners, network } = worker();
    for (const path of ['/api/home/personalized', '/api/cart', '/api/stamps', '/api/schedules', '/api/places/1/events']) {
      const event = { request: new Request(`https://example.com${path}`), respondWith: vi.fn(), waitUntil: vi.fn() };
      listeners.fetch(event);
      expect(event.respondWith).not.toHaveBeenCalled();
    }
    expect(network).not.toHaveBeenCalled();
  });
  it('stores public place details but respects private and no-store responses', async () => {
    for (const control of ['public, max-age=60', 'private', 'no-store', '']) {
      const { listeners, put } = worker(Response.json({ data: {} }, { headers: { 'Cache-Control': control } }));
      const event = { request: new Request('https://example.com/api/places/123?lang=en'), respondWith: vi.fn(), waitUntil: vi.fn() };
      listeners.fetch(event);
      await event.respondWith.mock.calls[0][0];
      await Promise.all(event.waitUntil.mock.calls.map(call => call[0]));
      expect(put).toHaveBeenCalledTimes(control.startsWith('public') ? 1 : 0);
    }
  });
  it('removes only superseded caches belonging to this app', async () => {
    const { listeners, remove } = worker();
    const event = { respondWith: vi.fn(), waitUntil: vi.fn() };
    listeners.activate(event);
    await event.waitUntil.mock.calls[0][0];
    expect(remove).toHaveBeenCalledExactlyOnceWith('gyeongju-travel-public-v4');
  });

  it('never serves cached data to an authenticated request', () => {
    const { listeners } = worker();
    const event = { request: new Request('https://example.com/api/places', { headers: { Authorization: 'Bearer example' } }), respondWith: vi.fn(), waitUntil: vi.fn() };
    listeners.fetch(event);
    expect(event.respondWith).not.toHaveBeenCalled();
  });

  it('still returns a usable offline document if browser storage was evicted', async () => {
    const { listeners, network } = worker();
    network.mockRejectedValue(new Error('offline'));
    const event = { request: { url: 'https://example.com/schedule', method: 'GET', mode: 'navigate', headers: new Headers() }, respondWith: vi.fn(), waitUntil: vi.fn() };
    listeners.fetch(event as unknown as WorkerEvent);
    const response = await event.respondWith.mock.calls[0][0] as Response;
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('Retry');
  });

  it('does not activate a replacement worker without the user choosing to update', async () => {
    const skipWaiting = vi.fn();
    const listeners: Record<string, (event: WorkerEvent) => void> = {};
    runInNewContext(readFileSync('public/sw.js', 'utf8'), {
      caches: { open: async () => ({ add: async () => undefined, match: async () => undefined }) },
      self: { addEventListener: (type: string, handler: (event: WorkerEvent) => void) => { listeners[type] = handler; }, skipWaiting }
    });
    const event = { respondWith: vi.fn(), waitUntil: vi.fn() };
    listeners.install(event);
    await event.waitUntil.mock.calls[0][0];
    expect(skipWaiting).not.toHaveBeenCalled();
  });
});
