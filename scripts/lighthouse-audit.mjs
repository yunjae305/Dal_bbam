import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { isolatedTestEnv } from './test-environment.ts';
import { assertPortAvailable, monitorLocalServer, waitForLocalServer, stopLocalServer } from './local-test-server.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(await readFile(new URL('../lighthouserc.json', import.meta.url), 'utf8'));
const port = Number.parseInt(process.env.LIGHTHOUSE_PORT || '3311', 10);
const origin = `http://127.0.0.1:${port}`;
const configuredUrls = config.ci?.collect?.url ?? [];
const urls = configuredUrls.map(value => `${origin}${new URL(value).pathname}`);
const runs = process.env.CI ? Number(config.ci?.collect?.numberOfRuns || 1) : 1;
const testEnv = { ...process.env, ...isolatedTestEnv };
await assertPortAvailable(port);
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  { cwd: projectRoot, env: testEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
);
const serverMonitor = monitorLocalServer(server);

function percentileMedian(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

let chrome;
const report = [];
try {
  await waitForLocalServer(server, serverMonitor, `${origin}/login`, 120_000);
  const login = await fetch(`${origin}/api/auth/demo`, { method: 'POST', signal: AbortSignal.timeout(5000) });
  if (!login.ok) throw new Error('Performance test login failed.');
  const sessionCookie = login.headers.get('set-cookie')?.split(';')[0];
  await login.arrayBuffer();
  chrome = await chromeLauncher.launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu']
  });

  for (const url of urls) {
    const results = [];
    for (let run = 0; run < runs; run += 1) {
      const output = await lighthouse(url, {
        port: chrome.port,
        logLevel: 'error',
        output: 'json',
        onlyCategories: ['performance', 'accessibility', 'best-practices'],
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 390,
          height: 844,
          deviceScaleFactor: 3,
          disabled: false
        },
        throttlingMethod: 'simulate',
        extraHeaders: new URL(url).pathname === '/' && sessionCookie ? { Cookie: sessionCookie } : {}
      });
      if (!output?.lhr) throw new Error(`Lighthouse returned no report for ${url}.`);
      await mkdir(new URL('../test-results/lighthouse/', import.meta.url), { recursive: true });
      const reportName = new URL(url).pathname.replaceAll('/', '-') || '-home';
      await writeFile(new URL(`../test-results/lighthouse/${reportName}-${run}.json`, import.meta.url), JSON.stringify(output.lhr));
      results.push({
        accessibility: output.lhr.categories.accessibility?.score ?? 0,
        performance: output.lhr.categories.performance?.score ?? 0,
        bestPractices: output.lhr.categories['best-practices']?.score ?? 0,
        lcp: output.lhr.audits['largest-contentful-paint']?.numericValue ?? Number.POSITIVE_INFINITY
      });
    }

    const summary = {
      accessibility: percentileMedian(results.map(result => result.accessibility)),
      performance: percentileMedian(results.map(result => result.performance)),
      bestPractices: percentileMedian(results.map(result => result.bestPractices)),
      lcp: percentileMedian(results.map(result => result.lcp))
    };
    console.log(`[lighthouse] ${new URL(url).pathname}`, summary);
    report.push({ path: new URL(url).pathname, ...summary });
    if (summary.accessibility < 0.9 || summary.lcp > 3000) process.exitCode = 1;
  }
} finally {
  try {
    await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
    await writeFile(new URL('../test-results/lighthouse-summary.json', import.meta.url), JSON.stringify(report, null, 2));
  } finally {
    try {
      try {
        await chrome?.kill();
      } catch (error) {
        // Windows can briefly keep Chrome's temporary profile locked after exit.
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'EPERM') throw error;
        console.warn('[lighthouse] Chrome profile cleanup is still pending.');
      }
    } finally {
      await stopLocalServer(server);
    }
  }
}
