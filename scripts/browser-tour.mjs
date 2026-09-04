// Drives the running dev server in a visible Chrome window and records what breaks.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = process.env.OUT_DIR || path.resolve('browser-tour');
// Usage: npm run dev (in another terminal) then `npm run test:browser` — opens a visible Chrome window,
// walks every screen with a demo session and writes screenshots + report.json to ./browser-tour.
fs.mkdirSync(OUT, { recursive: true });

const report = { pages: [], consoleErrors: [], failedRequests: [], notes: [] };
const seenConsole = new Set();

const headless = process.env.HEADLESS === '1';
const launchOptions = { headless, slowMo: headless ? 0 : 150, args: ['--window-size=460,940'] };
const browser = await chromium.launch({ channel: 'chrome', ...launchOptions }).catch(() => chromium.launch(launchOptions));
const context = await browser.newContext({
  viewport: { width: 430, height: 860 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
  geolocation: { latitude: 35.7981, longitude: 129.2070 },
  permissions: ['geolocation']
});
const page = await context.newPage();
page.on('console', message => {
  if (message.type() !== 'error') return;
  const text = `${page.url()} :: ${message.text()}`.slice(0, 400);
  if (!seenConsole.has(text)) {
    seenConsole.add(text);
    report.consoleErrors.push(text);
  }
});
page.on('pageerror', error => report.consoleErrors.push(`${page.url()} :: PAGEERROR ${error.message}`.slice(0, 400)));
page.on('response', response => {
  const status = response.status();
  if (status >= 500) report.failedRequests.push(`${status} ${response.request().method()} ${response.url()}`);
});

async function step(name, fn) {
  const entry = { name, ok: true, url: '', detail: '' };
  try {
    entry.detail = (await fn()) ?? '';
  } catch (error) {
    entry.ok = false;
    entry.detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
  }
  entry.url = page.url();
  const file = path.join(OUT, `${String(report.pages.length + 1).padStart(2, '0')}-${name.replace(/[^a-z0-9가-힣]+/gi, '-')}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => undefined);
  entry.screenshot = file;
  report.pages.push(entry);
  console.log(`${entry.ok ? 'OK ' : 'ERR'} ${name}${entry.detail ? ` — ${entry.detail}` : ''}`);
}

const visibleText = async selector => (await page.locator(selector).first().innerText().catch(() => '')).trim();

await step('로그인 화면', async () => {
  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  return await visibleText('h1');
});

await step('데모 로그인', async () => {
  const response = await page.request.post(`${BASE}/api/auth/demo`, { headers: { Origin: BASE } });
  if (response.status() !== 200) throw new Error(`demo login ${response.status()} ${await response.text()}`);
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  if (page.url().includes('/login')) throw new Error('still on /login after demo login');
  return 'session cookie set';
});

await step('홈 화면', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  const buttons = await page.getByRole('button').count();
  const heading = await visibleText('h1');
  return `heading="${heading}" buttons=${buttons}`;
});

await step('홈 전체보기 시트', async () => {
  await page.getByRole('button', { name: '전체보기', exact: true }).first().click();
  await page.waitForTimeout(400);
  const title = await visibleText('section h1');
  await page.getByRole('button', { name: '닫기' }).last().click();
  return `sheet title="${title}"`;
});

await step('홈 → 맛집 카테고리 → 지도', async () => {
  await page.getByRole('button', { name: '맛집', exact: true }).first().click();
  await page.waitForURL(/\/map/, { timeout: 15_000 });
  await page.waitForLoadState('load');
  return page.url();
});

await step('지도 화면 로드', async () => {
  await page.goto(`${BASE}/map`, { waitUntil: 'load' });
  const title = await visibleText('h1');
  const mapReady = await page.locator('[aria-label="경주 지도"]').first().isVisible();
  return `title="${title}" mapVisible=${mapReady}`;
});

await step('길찾기: 현재 위치 → 4모드 비교', async () => {
  const directions = page.waitForResponse(response => response.url().includes('/api/maps/directions') && response.url().includes('mode=all'), { timeout: 20_000 });
  await page.getByRole('button', { name: '현재 위치', exact: true }).first().click();
  const consent = page.getByRole('button', { name: '동의하고 위치 사용' });
  if (await consent.isVisible().catch(() => false)) await consent.click();
  await directions;
  await page.waitForTimeout(800);
  const modes = [];
  for (const label of ['도보', '대중교통', '자전거', '자동차']) {
    const button = page.getByRole('button', { name: new RegExp(`^${label}`) }).first();
    modes.push(`${label}:${(await button.innerText()).replace(/\s+/g, ' ')}`);
  }
  return modes.join(' | ');
});

await step('길찾기: 대중교통 선택 → 환승/요금 표시', async () => {
  await page.getByRole('button', { name: /^대중교통/ }).first().click();
  await page.waitForTimeout(500);
  const text = await page.locator('text=/환승|요금/').first().innerText().catch(() => '');
  if (!text) throw new Error('transfer/fare summary not shown');
  return text;
});

await step('길찾기: 출발지 선택 모드 → 지도 탭', async () => {
  await page.getByRole('button', { name: '출발지 선택' }).first().click();
  const hint = await visibleText('[role="status"]');
  const map = page.locator('[aria-label="경주 지도"]').first();
  const box = await map.boundingBox();
  if (!box) throw new Error('map container has no box');
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.3);
  await page.waitForTimeout(1500);
  const origin = await page.getByRole('button', { name: '출발지 선택' }).first().innerText();
  return `hint="${hint}" origin="${origin.replace(/\s+/g, ' ')}"`;
});

await step('길찾기: 출발·도착 교체', async () => {
  await page.getByRole('button', { name: '출발·도착 바꾸기' }).first().click();
  await page.waitForTimeout(1500);
  const origin = await page.getByRole('button', { name: '출발지 선택' }).first().innerText();
  const destination = await page.getByRole('button', { name: '도착지 선택' }).first().innerText();
  return `origin="${origin.replace(/\s+/g, ' ')}" destination="${destination.replace(/\s+/g, ' ')}"`;
});

await step('지도: 카카오 장소 검색', async () => {
  await page.getByLabel('어디로 떠나볼까요?').fill('불국사');
  const search = page.waitForResponse(response => response.url().includes('/api/maps/places'), { timeout: 20_000 });
  await page.getByRole('button', { name: '카카오 장소 검색' }).click();
  await search;
  await page.waitForTimeout(500);
  return await visibleText('[role="status"]');
});

await step('장소 상세 + AI 해설', async () => {
  await page.goto(`${BASE}/places/250270`, { waitUntil: 'load' });
  const title = await visibleText('h1');
  const narrationResponse = page.waitForResponse(response => response.url().includes('/api/ai/narrations/'), { timeout: 20_000 });
  await page.getByRole('button', { name: 'AI 해설' }).first().click();
  await narrationResponse;
  await page.waitForTimeout(500);
  const narration = await page.locator('section p').filter({ hasText: /./ }).nth(2).innerText().catch(() => '');
  return `title="${title}" narration="${narration.slice(0, 60)}"`;
});

await step('장소 상세: 장바구니 저장 (DB 없으면 503 안내)', async () => {
  await page.getByRole('button', { name: '장바구니에 저장' }).click();
  await page.waitForTimeout(800);
  return await visibleText('[role="status"]');
});

await step('AI 코스 추천', async () => {
  await page.goto(`${BASE}/courses`, { waitUntil: 'load' });
  const recommendResponse = page.waitForResponse(response => response.url().includes('/api/courses/recommend'), { timeout: 30_000 });
  await page.getByRole('button', { name: 'AI 코스 추천받기' }).click();
  await recommendResponse;
  await page.waitForTimeout(800);
  const alert = await visibleText('[role="alert"]');
  const planTitle = await page.locator('article h2').first().innerText().catch(() => '');
  return `plan="${planTitle}" alert="${alert}"`;
});

for (const [name, url] of [['내 일정', '/schedule'], ['장바구니', '/cart'], ['스탬프 투어', '/stamps'], ['커뮤니티', '/community'], ['쇼츠', '/shorts'], ['설정', '/settings'], ['오프라인 안내', '/offline'], ['이용약관', '/legal/terms']]) {
  await step(`${name} 화면`, async () => {
    await page.goto(`${BASE}${url}`, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    const heading = await visibleText('h1');
    const alert = await visibleText('[role="alert"]');
    const status = await visibleText('[role="status"]');
    return `h1="${heading}"${alert ? ` alert="${alert.slice(0, 80)}"` : ''}${status ? ` status="${status.slice(0, 80)}"` : ''}`;
  });
}

await step('스탬프: 현장 확인 (GPS 시뮬레이션)', async () => {
  await page.goto(`${BASE}/stamps`, { waitUntil: 'load' });
  const check = page.getByRole('button', { name: /현장 확인/ }).first();
  if (!(await check.count())) return 'no stamp targets (DB unavailable)';
  await check.click();
  await page.waitForTimeout(3000);
  return await visibleText('[role="alert"], [role="status"]');
});

await step('언어 전환 EN → 홈', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.getByRole('button', { name: 'English' }).click();
  await page.waitForTimeout(1200);
  const heading = await visibleText('h1');
  await page.getByRole('button', { name: '한국어' }).click();
  await page.waitForTimeout(800);
  return `en heading="${heading}"`;
});

await step('로그아웃', async () => {
  await page.getByRole('button', { name: '로그아웃' }).first().click();
  await page.waitForURL(/\/login/, { timeout: 15_000 });
  return page.url();
});

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('\n=== SUMMARY ===');
console.log(`steps: ${report.pages.length}, failed: ${report.pages.filter(entry => !entry.ok).length}`);
console.log(`console errors: ${report.consoleErrors.length}`);
report.consoleErrors.slice(0, 15).forEach(line => console.log('  ', line));
console.log(`5xx responses: ${report.failedRequests.length}`);
report.failedRequests.slice(0, 15).forEach(line => console.log('  ', line));
await page.waitForTimeout(1500);
await browser.close();
