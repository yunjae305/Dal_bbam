const baseUrl = process.env.LOAD_TEST_URL || 'http://127.0.0.1:3000';
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || 100);
const waves = Number(process.env.LOAD_TEST_WAVES || 10);
const target = new URL('/api/places?lang=ko&category=all', baseUrl);
const durations = [];
let failures = 0;

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
  requests: total,
  failures,
  errorRate,
  p95Ms: Math.round(p95)
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (errorRate >= 0.01) process.exitCode = 1;
