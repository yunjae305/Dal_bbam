import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { isolatedTestEnv } from './test-environment.ts';
import { assertPortAvailable, monitorLocalServer, waitForLocalServer, stopLocalServer } from './local-test-server.mjs';

const baseUrl = process.env.LOAD_TEST_URL || 'http://127.0.0.1:3322';
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || 100);
const waves = Number(process.env.LOAD_TEST_WAVES || 10);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 1000 || !Number.isInteger(waves) || waves < 1 || waves > 100) {
  throw new Error('Use 1–1000 concurrent requests and 1–100 waves.');
}
const target = new URL('/api/places?lang=ko&category=all', baseUrl);
const durations = [];
let failures = 0;
if (!process.env.LOAD_TEST_URL) await assertPortAvailable(3322);
const server = process.env.LOAD_TEST_URL ? null : spawn(process.execPath, [
  'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3322'
], { cwd: new URL('../', import.meta.url), env: { ...process.env, ...isolatedTestEnv }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const serverMonitor = server ? monitorLocalServer(server) : null;

try {
if (server && serverMonitor) {
  await waitForLocalServer(server, serverMonitor, target, 30_000);
}
for (let wave = 0; wave < waves; wave += 1) {
  await Promise.all(Array.from({ length: concurrency }, async () => {
    const startedAt = performance.now();
    try {
      const response = await fetch(target, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) failures += 1;
      else await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      durations.push(performance.now() - startedAt);
    }
  }));
}

durations.sort((a, b) => a - b);
const total = concurrency * waves;
const errorRate = failures / total;
const p95 = durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] || 0;
const result = {
  target: target.toString(),
  concurrency,
  isolated: Boolean(server),
  requests: total,
  failures,
  errorRate,
  p95Ms: Math.round(p95)
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
await writeFile(new URL('../test-results/load-summary.json', import.meta.url), JSON.stringify(result, null, 2));
if (errorRate >= 0.01) process.exitCode = 1;
} finally {
  await stopLocalServer(server);
}
