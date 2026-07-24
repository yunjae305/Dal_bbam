import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const loginResponse = await page.request.post('/api/auth/login', {
    data: { email: 'demo@gyeongju.com', password: 'gyeongju2024' }
  });
  expect(loginResponse.status()).toBe(200);
  await page.goto('/');
  await expect(page).toHaveURL('/');
});

test('language, map, detail, AI narration surface', async ({ page }) => {
  const englishButton = page.getByRole('button', { name: '영어로 변경' });
  await englishButton.click();
  await expect(englishButton).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => {
    const localeCookie = (await page.context().cookies()).find(cookie => cookie.name === 'dal_bbam_locale');
    return localeCookie?.value;
  }).toBe('en');
  await page.goto('/map');
  await expect(page.getByRole('heading', { name: 'Gyeongju map' })).toBeVisible();
  await page.getByRole('link', { name: /상세 보기/ }).first().click();
  await expect(page.getByRole('button', { name: 'AI narration' })).toBeVisible();
});

test('course, schedule, cart, stamps and community routes are directly reachable', async ({ page }) => {
  for (const path of ['/courses', '/schedule', '/cart', '/stamps', '/community', '/shorts']) {
    await page.goto(path);
    await expect(page.locator('main, section').first()).toBeVisible();
  }
});

test('home category navigation preserves the selected map filter in the URL', async ({ page }) => {
  await page.getByRole('button', { name: '관광지', exact: true }).first().click();
  await expect(page).toHaveURL(/\/map\?category=attraction$/);
  await expect(page.getByRole('heading', { name: '경주 지도' })).toBeVisible();
  await expect(page.getByRole('button', { name: '관광지', exact: true })).toHaveClass(/bg-\[#b94f4a\]/);
});

test('schedule metadata and order can be edited without drag gestures', async ({ page }) => {
  let schedule = {
    id: 'schedule-1',
    title: '테스트 경주 여행',
    start_date: '2026-07-24',
    end_date: '2026-07-25',
    share_token: '1234567890abcdef1234567890abcdef',
    schedule_places: [
      {
        id: 'item-1',
        visit_date: '2026-07-24',
        start_time: '10:00',
        stay_minutes: 60,
        sort_order: 0,
        note: null,
        places: { content_id: 'place-a', name: '동궁과 월지', image_url: null }
      },
      {
        id: 'item-2',
        visit_date: '2026-07-25',
        start_time: '11:00',
        stay_minutes: 60,
        sort_order: 1,
        note: null,
        places: { content_id: 'place-b', name: '불국사', image_url: null }
      }
    ]
  };

  await page.route('**/api/schedules', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [schedule] }) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/schedules/schedule-1', async route => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as {
        title?: string;
        startDate?: string;
        endDate?: string;
        items?: Array<{ contentId: string; visitDate: string; startTime?: string; stayMinutes: number }>;
      };
      const currentById = new Map(schedule.schedule_places.map(item => [item.places.content_id, item]));
      schedule = {
        ...schedule,
        title: body.title ?? schedule.title,
        start_date: body.startDate ?? schedule.start_date,
        end_date: body.endDate ?? schedule.end_date,
        schedule_places: body.items?.map((item, index) => ({
          ...currentById.get(item.contentId)!,
          visit_date: item.visitDate,
          start_time: item.startTime ?? '',
          stay_minutes: item.stayMinutes,
          sort_order: index
        })) ?? schedule.schedule_places
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: schedule }) });
      return;
    }
    await route.fallback();
  });

  await page.goto('/schedule');
  await expect(page.getByRole('heading', { name: '테스트 경주 여행' })).toBeVisible();
  await page.getByRole('button', { name: '동궁과 월지 아래로 이동' }).click();
  await expect(page.locator('ol li').first()).toContainText('불국사');

  await page.getByRole('button', { name: '일정 수정' }).click();
  await page.getByLabel('일정 제목').fill('수정된 경주 여행');
  await page.getByRole('button', { name: '변경 저장' }).click();
  await expect(page.getByRole('heading', { name: '수정된 경주 여행' })).toBeVisible();
});

test('stamp verification asks for consent and only renders a persisted success', async ({ page, context }) => {
  let granted: boolean | null = null;
  let acquiredContentId = '';

  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:3200' });
  await context.setGeolocation({ latitude: 35.8562, longitude: 129.2247 });
  await page.route('**/api/location-consent', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { version: 'location-v1-2026-07-24', granted } })
      });
      return;
    }
    const body = route.request().postDataJSON() as { granted: boolean };
    granted = body.granted;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ data: { consent_version: 'location-v1-2026-07-24', granted } })
    });
  });
  await page.route('**/api/stamps/verify', async route => {
    const body = route.request().postDataJSON() as { placeId: string };
    acquiredContentId = body.placeId;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          verified: true,
          persisted: true,
          alreadyAcquired: false,
          distanceMeters: 12,
          radiusMeters: 150,
          awardedBadges: []
        }
      })
    });
  });
  await page.route('**/api/stamps', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: acquiredContentId ? [{
          id: 'stamp-1',
          acquired_at: new Date().toISOString(),
          places: { content_id: acquiredContentId, name: '검증 장소', image_url: null }
        }] : []
      })
    });
  });
  await page.route('**/api/badges**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { earned: [], available: [] } })
    });
  });

  await page.goto('/stamps');
  await page.getByRole('button', { name: '현장 확인', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '동의하고 위치 사용' }).click();
  await expect(page.getByText(/현장 확인 완료 · 거리 12m/)).toBeVisible();
});

test('private API responses are not reused by the service worker cache', async ({ page }) => {
  await page.waitForLoadState('networkidle');
  await expect.poll(async () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(registration?.active);
  })).toBe(true);

  const cachedUrls = await page.evaluate(async () => {
    const keys = await caches.keys();
    const requests = (await Promise.all(keys.map(async key => (await caches.open(key)).keys()))).flat();
    return requests.map(request => new URL(request.url).pathname);
  });
  expect(cachedUrls.some(path => ['/api/cart', '/api/schedules', '/api/stamps'].some(privatePath => path.startsWith(privatePath)))).toBe(false);
});
