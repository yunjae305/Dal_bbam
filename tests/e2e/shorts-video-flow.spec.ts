import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page, type Route, type TestInfo } from '@playwright/test';
import type { PlaceDetail, ShortItem } from '../../src/shared/types';
import { loginForBrowser } from './helpers';

test.use({ serviceWorkers: 'block', contextOptions: { reducedMotion: 'reduce' } });

// Original synthetic fixture: Chromium MediaRecorder(canvas.captureStream(10)),
// 320 x 180 alternating #173e78 / #e8cc68 frames, 1.338 seconds, no audio/people.
// Its original H.264 samples were remuxed into a standard MP4 sample table with
// explicit durations (avc1.420015, 5,331 bytes). No external footage is used.
const videoBytes = readFileSync(new URL('../fixtures/shorts-sample.mp4', import.meta.url));
const videoPath = '/e2e-media/shorts-sample.mp4';
const sourceItem: ShortItem = {
  id: 'prerecorded-short', contentId: 'video-place', title: '미리 제작한 경주 여행 영상',
  summary: '저장된 MP4 영상과 관광지 정보를 확인합니다.', narration: '',
  imageUrl: '/icon-192.png', videoUrl: videoPath, durationSeconds: 1.338,
  tags: ['문화유산'], liked: false, saved: false, likeCount: 0, isAiGenerated: false
};
const place: PlaceDetail = {
  contentId: sourceItem.contentId, name: '영상 속 경주 관광지', category: 'attraction',
  description: '쇼츠와 연결된 장소', overview: '영상에서 본 장소의 방문 정보입니다.',
  address: '경주시', imageUrl: '/icon-192.png', images: [], coordinates: [35.856, 129.225],
  tags: [], source: 'sample', openingHours: '09:00–18:00'
};

async function serveVideo(route: Route) {
  const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), videoBytes.length - 1) : videoBytes.length - 1;
  if (start > end || start >= videoBytes.length) {
    await route.fulfill({ status: 416, headers: { 'Content-Range': `bytes */${videoBytes.length}` } });
    return;
  }
  await route.fulfill({
    status: range ? 206 : 200,
    headers: {
      'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1),
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${videoBytes.length}` } : {})
    },
    body: videoBytes.subarray(start, end + 1)
  });
}

async function prepareFeed(page: Page) {
  const aiRequests: string[] = [];
  const reactions: Array<{ shortId: string; action: string; value: boolean }> = [];
  let item = { ...sourceItem };
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/ai/narrations')) aiRequests.push(request.method());
  });
  await page.route(/\/api\/ai\/narrations(?:\/|\?)/, route => route.fulfill({ status: 503, json: { error: { message: 'Unexpected AI request in prerecorded video flow' } } }));
  await page.route(`**${videoPath}`, serveVideo);
  await page.route(/\/api\/shorts(?:\?|$)/, async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as typeof reactions[number];
      reactions.push(body);
      item = body.action === 'like' ? { ...item, liked: body.value, likeCount: body.value ? 1 : 0 } : { ...item, saved: body.value };
      await route.fulfill({ json: { data: item } });
      return;
    }
    await route.fulfill({ json: { data: [item], meta: { tags: item.tags, nextOffset: null, reactionsEnabled: true } } });
  });
  await page.route('**/api/community/stories', route => route.fulfill({ json: { data: [] } }));
  await page.route('**/api/community?contentId=video-place', route => route.fulfill({ json: { data: [], meta: { averageRating: null, ratingCount: 0 } } }));
  await page.route('**/api/places/video-place?*', route => route.fulfill({ json: { data: place } }));
  await page.route('**/api/places/video-place/events', route => route.fulfill({ json: { data: { recorded: true } } }));
  await loginForBrowser(page);
  return { aiRequests, reactions };
}

async function supportsFixtureDecode(page: Page) {
  // Windows WebKit may report canPlayType('...avc1') = 'probably' even when its
  // OS decoder is unavailable. Probe actual decoding, not only the MIME hint.
  return page.evaluate(async encoded => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = `data:video/mp4;base64,${encoded}`;
    document.body.append(video);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        video.play(),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('decoder timeout')), 3000); })
      ]);
      for (let attempt = 0; attempt < 10 && video.currentTime <= 0.05; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return video.videoWidth === 320 && !video.paused && video.currentTime > 0.05;
    } catch { return false; }
    finally { clearTimeout(timeout); video.pause(); video.removeAttribute('src'); video.load(); video.remove(); }
  }, videoBytes.toString('base64'));
}

async function captureFeed(page: Page, card: Locator, testInfo: TestInfo, name: string) {
  await testInfo.attach(`${name}-geometry`, {
    contentType: 'application/json',
    body: JSON.stringify(await card.evaluate(element => ({
      viewport: { width: innerWidth, height: innerHeight },
      card: element.getBoundingClientRect().toJSON(),
      feed: element.closest('section')?.getBoundingClientRect().toJSON(),
      buttons: [...element.querySelectorAll('button')].map(button => ({ label: button.getAttribute('aria-label'), bounds: button.getBoundingClientRect().toJSON() }))
    })), null, 2)
  });
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

test('prerecorded MP4 plays, pauses, mutes, saves and opens its place without requesting AI', async ({ page, browserName }, testInfo) => {
  const state = await prepareFeed(page);
  const canDecode = await supportsFixtureDecode(page);
  if (browserName !== 'webkit') expect(canDecode, 'The original H.264 fixture must advance in Chromium and Firefox').toBe(true);
  test.skip(!canDecode, 'This browser/OS cannot decode the H.264 fixture; no actual playback claim is made for it.');

  await page.goto('/shorts');
  const card = page.locator(`[data-short-id="${sourceItem.id}"]`);
  const video = card.locator('video');
  await expect(card.getByRole('heading', { name: sourceItem.title, exact: true })).toBeVisible();
  await expect(video).toHaveAttribute('src', videoPath);
  await expect(video).toHaveAttribute('playsinline');
  await expect(card.getByRole('button', { name: '음성 듣기', exact: true })).toHaveCount(0);

  await card.getByRole('button', { name: '영상 재생', exact: true }).click();
  await expect(card.getByRole('button', { name: '영상 일시정지', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0.05);
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).videoWidth)).toBe(320);
  await card.getByRole('button', { name: '영상 일시정지', exact: true }).click();
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
  await card.getByRole('button', { name: '영상 소리 켜기', exact: true }).click();
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).muted)).toBe(false);
  await card.getByRole('button', { name: '영상 음소거', exact: true }).click();
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).muted)).toBe(true);

  const likeResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/shorts' && response.request().postDataJSON().action === 'like');
  await card.getByRole('button', { name: '좋아요 0개', exact: true }).click();
  expect((await likeResponse).ok()).toBe(true);
  const saveResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/shorts' && response.request().postDataJSON().action === 'save');
  await card.getByRole('button', { name: '저장', exact: true }).click();
  expect((await saveResponse).ok()).toBe(true);
  await expect.poll(() => state.reactions).toEqual([
    { shortId: sourceItem.id, action: 'like', value: true }, { shortId: sourceItem.id, action: 'save', value: true }
  ]);
  const filtered = page.waitForRequest(request => request.method() === 'GET' && new URL(request.url()).pathname === '/api/shorts' && new URL(request.url()).searchParams.get('tag') === '문화유산');
  await page.getByRole('button', { name: '#문화유산', exact: true }).first().click();
  await filtered;
  await expect(card.getByRole('button', { name: '음성 듣기', exact: true })).toHaveCount(0);
  const link = card.getByRole('link', { name: `${sourceItem.title} · 장소 정보 보기`, exact: true });
  await expect(link).toHaveAttribute('href', '/places/video-place');
  await link.scrollIntoViewIfNeeded();
  await captureFeed(page, card, testInfo, 'prerecorded-mp4-controls');
  await link.click();
  await expect(page).toHaveURL('/places/video-place');
  await expect(page.getByRole('heading', { name: place.name, exact: true })).toBeVisible();
  expect(state.aiRequests).toEqual([]);
});

test('an unavailable prerecorded MP4 shows its poster and place link without falling back to AI audio', async ({ page }, testInfo) => {
  const state = await prepareFeed(page);
  await page.route(`**${videoPath}`, route => route.fulfill({ status: 404, body: 'Video fixture unavailable' }));
  await page.goto('/shorts');
  const card = page.locator(`[data-short-id="${sourceItem.id}"]`);
  await expect(card.getByRole('status')).toHaveText('영상을 재생할 수 없어 대표 이미지를 표시하고 있습니다.');
  await expect(card.getByRole('img', { name: sourceItem.title, exact: true })).toBeVisible();
  await expect(card.locator('video')).toHaveCount(0);
  await expect(card.getByRole('button', { name: '음성 듣기', exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: '저장', exact: true }).click();
  await expect.poll(() => state.reactions).toEqual([{ shortId: sourceItem.id, action: 'save', value: true }]);
  await captureFeed(page, card, testInfo, 'prerecorded-mp4-unavailable');
  await card.getByRole('link', { name: `${sourceItem.title} · 장소 정보 보기`, exact: true }).click();
  await expect(page).toHaveURL('/places/video-place');
  await expect(page.getByRole('heading', { name: place.name, exact: true })).toBeVisible();
  expect(state.aiRequests).toEqual([]);
});
