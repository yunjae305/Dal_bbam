// Loopback-only E2E proxy for browsers that upgrade HTTP localhost subresources.
// Production CSP and application code remain unchanged; only this test response
// removes upgrade-insecure-requests. All other CSP directives/cookies are kept.
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { isolatedTestEnv } from './test-environment.ts';
import { assertPortAvailable, monitorLocalServer, waitForLocalServer, stopLocalServer } from './local-test-server.mjs';

const hostname = '127.0.0.1';
const port = Number(process.env.E2E_PORT || 3200);
const upstreamPort = Number(process.env.E2E_UPSTREAM_PORT || 3201);
if (port === upstreamPort) throw new Error('E2E_PORT and E2E_UPSTREAM_PORT must be different.');
await Promise.all([assertPortAvailable(port, hostname), assertPortAvailable(upstreamPort, hostname)]);

const upstream = spawn(process.execPath, [
  'node_modules/next/dist/bin/next', 'start', '--hostname', hostname, '--port', String(upstreamPort)
], {
  cwd: new URL('../', import.meta.url), env: { ...process.env, ...isolatedTestEnv },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
});
const monitor = monitorLocalServer(upstream);

function localCsp(value) {
  if (Array.isArray(value)) return value.map(localCsp);
  if (typeof value !== 'string') return value;
  return value.split(';').filter(directive => !/^\s*upgrade-insecure-requests(?:\s|$)/i.test(directive)).join(';');
}

// Exercise real connection failures without WebKit's offline emulation, which
// aborts document loads before a service worker can return its cached response.
// This control endpoint exists only in the loopback test harness (workers: 1).
let networkOffline = false;
async function controlNetwork(incoming, outgoing) {
  const reply = (status, body) => {
    if (outgoing.destroyed) return;
    outgoing.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    outgoing.end(JSON.stringify(body));
  };
  if (incoming.method !== 'POST') {
    outgoing.setHeader('Allow', 'POST');
    reply(405, { error: 'POST required.' });
    return;
  }
  const deadline = setTimeout(() => incoming.destroy(), 3_000);
  try {
    let body = '';
    for await (const chunk of incoming) {
      body += chunk.toString('utf8');
      if (Buffer.byteLength(body) > 1_024) {
        reply(413, { error: 'Request body too large.' });
        return;
      }
    }
    const state = JSON.parse(body);
    if (!state || typeof state !== 'object' || typeof state.offline !== 'boolean' || Object.keys(state).length !== 1) {
      reply(400, { error: 'Expected { offline: boolean }.' });
      return;
    }
    networkOffline = state.offline;
    reply(200, { offline: networkOffline });
  } catch {
    reply(400, { error: 'Invalid network control request.' });
  } finally {
    clearTimeout(deadline);
  }
}

const proxy = createServer((incoming, outgoing) => {
  if (incoming.url?.split('?')[0] === '/__e2e/network') {
    void controlNetwork(incoming, outgoing);
    return;
  }
  if (networkOffline) {
    incoming.socket.destroy();
    return;
  }
  const forwardedHost = incoming.headers.host || `${hostname}:${port}`;
  const request = httpRequest({
    hostname, port: upstreamPort, path: incoming.url, method: incoming.method, agent: false,
    headers: {
      ...incoming.headers,
      host: forwardedHost,
      'x-forwarded-host': forwardedHost,
      'x-forwarded-proto': 'http',
      'x-forwarded-port': String(port),
      'x-forwarded-for': incoming.socket.remoteAddress || hostname
    }
  }, response => {
    const headers = { ...response.headers };
    for (const header of ['content-security-policy', 'content-security-policy-report-only']) {
      if (headers[header]) headers[header] = localCsp(headers[header]);
    }
    outgoing.writeHead(response.statusCode ?? 502, response.statusMessage, headers);
    response.on('error', error => outgoing.destroy(error));
    response.pipe(outgoing);
  });
  request.setTimeout(120_000, () => request.destroy(new Error('E2E upstream request timed out.')));
  request.on('error', () => {
    if (outgoing.destroyed) return;
    if (outgoing.headersSent) outgoing.destroy();
    else { outgoing.writeHead(502, { 'Content-Type': 'text/plain' }); outgoing.end('Local E2E upstream unavailable.'); }
  });
  incoming.on('aborted', () => request.destroy());
  incoming.on('error', () => request.destroy());
  outgoing.on('close', () => request.destroy());
  incoming.pipe(request);
});

let stopping = false;
let shutdown;
function stop() {
  if (shutdown) return shutdown;
  stopping = true;
  shutdown = (async () => {
    try {
      if (proxy.listening) {
        await new Promise(resolve => {
          proxy.close(resolve);
          proxy.closeAllConnections();
        });
      }
    } finally { await stopLocalServer(upstream); }
  })();
  return shutdown;
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { void stop().then(() => process.exit(0), error => { console.error(error.message); process.exit(1); }); });
}
upstream.once('exit', () => {
  if (!stopping) {
    process.exitCode = 1;
    console.error(`E2E Next.js process exited.\n${monitor.output}`);
    void stop().catch(error => console.error(error.message));
  }
});

try {
  await waitForLocalServer(upstream, monitor, `http://${hostname}:${upstreamPort}/login`, 120_000);
  if (!stopping) {
    await new Promise((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(port, hostname, resolve);
    });
    console.log(`E2E proxy ready at http://${hostname}:${port} (isolated Next.js ${upstreamPort}).`);
    await new Promise(resolve => proxy.once('close', resolve));
  }
} finally {
  await stop();
}
