import { expect, test } from '@playwright/test';
import type { AdminShortItem } from '../../src/shared/admin-shorts';
import { loginForBrowser } from './helpers';

test.use({ serviceWorkers: 'block' });

test('admin saves a prepared video as a draft, edits and publishes it, and recovers from an unpublish failure', async ({ page }, testInfo) => {
  const writes: Array<Record<string, unknown>> = [];
  let item: AdminShortItem | undefined;
  let rejectNextUnpublish = true;
  await page.route('**/api/admin/shorts**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: { data: item ? [item] : [], meta: { limit: 20, offset: 0, hasMore: false, nextOffset: null } } });
      return;
    }
    const body = request.postDataJSON() as Record<string, unknown>;
    writes.push(body);
    if (request.method() === 'POST') {
      item = {
        id: '11111111-1111-4111-8111-111111111111', contentId: String(body.contentId),
        title: String(body.title), summary: String(body.summary), lang: 'ko', narration: String(body.narration),
        imageUrl: null, audioUrl: null, videoUrl: String(body.videoUrl), youtubeVideoId: null,
        durationSeconds: Number(body.durationSeconds), tags: body.tags as string[],
        isPublished: body.isPublished === true, isAiGenerated: false,
        createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z'
      };
      await route.fulfill({ status: 201, json: { data: item } });
      return;
    }
    if (body.isPublished === false && Object.keys(body).length === 2 && rejectNextUnpublish) {
      rejectNextUnpublish = false;
      await route.fulfill({ status: 503, json: { error: { message: '잠시 후 다시 시도해 주세요.' } } });
      return;
    }
    item = { ...item!, ...body, updatedAt: '2026-09-06T00:01:00.000Z' } as AdminShortItem;
    await route.fulfill({ json: { data: item } });
  });

  await loginForBrowser(page);
  await page.goto('/admin/shorts');
  const form = page.getByRole('form', { name: '문화유산 영상 관리' });
  await expect(page.getByRole('heading', { name: '문화유산 영상 관리', exact: true })).toBeVisible();
  // The disabled fieldset becomes editable after hydration and the admin list request.
  await expect(form.getByRole('textbox', { name: '영상 제목', exact: true })).toBeEnabled();
  await form.getByRole('combobox', { name: '연결할 관광지', exact: true }).selectOption({ label: '불국사' });
  await form.getByRole('textbox', { name: '영상 제목', exact: true }).fill('불국사가 들려주는 신라 이야기');
  await form.getByRole('textbox', { name: '영상 소개', exact: true }).fill('인격화된 불국사가 자신의 역사와 관람 정보를 소개합니다.');
  await form.getByRole('spinbutton', { name: '영상 길이 (초)' }).fill('45');
  await form.getByRole('textbox', { name: /^영상 URL/ }).fill('/videos/bulguksa-intro.mp4');
  await form.getByRole('textbox', { name: /^태그/ }).fill('문화유산, 불국사');
  await expect(form.locator('video, iframe')).toHaveCount(0);
  await form.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^영상이 저장되었습니다\.$/ })).toBeVisible();
  expect(writes[0]).toMatchObject({
    narration: '', videoUrl: '/videos/bulguksa-intro.mp4', youtubeVideoId: null,
    durationSeconds: 45, tags: ['문화유산', '불국사'], isPublished: false
  });
  expect(String(writes[0].contentId)).not.toBe('');
  const row = page.getByRole('article').filter({ has: page.getByRole('heading', { name: '불국사가 들려주는 신라 이야기', exact: true }) });
  await expect(row.getByText('초안', { exact: true })).toBeVisible();

  await form.getByRole('textbox', { name: '영상 소개', exact: true }).fill('불국사의 신라 이야기와 방문 정보를 45초에 소개합니다.');
  await form.getByRole('button', { name: '변경 저장', exact: true }).click();
  await expect(row.getByText('불국사의 신라 이야기와 방문 정보를 45초에 소개합니다.', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: '공개', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^영상이 공개되었습니다\.$/ })).toBeVisible();
  await expect(row.getByText('공개 중', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '비공개로 전환', exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('shorts-admin-published.png'), fullPage: true });

  await row.getByRole('button', { name: '비공개로 전환', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '잠시 후 다시 시도해 주세요.' })).toBeVisible();
  await expect(row.getByText('공개 중', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: '비공개로 전환', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^영상을 비공개 초안으로 전환했습니다\.$/ })).toBeVisible();
  await expect(row.getByText('초안', { exact: true })).toBeVisible();
  expect(writes.slice(-2)).toEqual([
    { shortId: item!.id, isPublished: false }, { shortId: item!.id, isPublished: false }
  ]);
});
