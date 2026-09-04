import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(await readFile(new URL('../lighthouserc.json', import.meta.url), 'utf8'));
const port = Number.parseInt(process.env.LIGHTHOUSE_PORT || '3311', 10);
const origin = `http://127.0.0.1:${port}`;
const configuredUrls = config.ci?.collect?.url ?? [];
const urls = configuredUrls.map(value => `${origin}${new URL(value).pathname}`);
const runs = process.env.CI ? Number(config.ci?.collect?.numberOfRuns || 1) : 1;
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  { cwd: projectRoot, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }
);

let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += String(chunk); });
server.stderr.on('data', chunk => { serverOutput += String(chunk); });

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next.js server exited early.\n${serverOutput}`);
    try {
      const response = await fetch(`${origin}/login`, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for Next.js.\n${serverOutput}`);
}

function percentileMedian(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

let chrome;
try {
  await waitForServer();
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
        throttlingMethod: 'simulate'
      });
      if (!output?.lhr) throw new Error(`Lighthouse returned no report for ${url}.`);
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
    if (summary.accessibility < 0.9) throw new Error(`${url} accessibility score is below 0.90.`);
    if (summary.lcp > 3000) throw new Error(`${url} LCP ${Math.round(summary.lcp)}ms exceeds 3000ms.`);
  }
} finally {
  try {
    await chrome?.kill();
  } catch (error) {
    // Windows can briefly keep Chrome's temporary profile locked after exit.
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EPERM') throw error;
    console.warn('[lighthouse] Chrome profile cleanup is still pending.');
  }
  if (server.exitCode === null) server.kill('SIGTERM');
}
