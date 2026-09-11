import { expect, test } from '@playwright/test';
import type { CoursePlan, PlaceSummary } from '../../src/shared/types';
import { loginForBrowser } from './helpers';

test.use({ serviceWorkers: 'block' });

type VisitInput = {
  contentId: string;
  visitDate: string;
  startTime?: string;
  stayMinutes: number;
  note?: string;
};
type ScheduleFixture = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  schedule_places: Array<{
    id: string;
    visit_date: string;
    start_time: string | null;
    stay_minutes: number;
    sort_order: number;
    note: string | null;
    places: { content_id: string; name: string; image_url: string };
  }>;
};

const placeSeeds: Array<Pick<PlaceSummary, 'contentId' | 'name' | 'category' | 'coordinates'>> = [
  { contentId: 'planning-heritage', name: '일정 테스트 문화재', category: 'heritage', coordinates: [35.8562, 129.2247] },
  { contentId: 'planning-lodging', name: '일정 테스트 숙소', category: 'lodging', coordinates: [35.858, 129.228] },
  { contentId: 'planning-food', name: '일정 테스트 식당', category: 'food', coordinates: [35.855, 129.226] }
];
const places: PlaceSummary[] = placeSeeds.map(place => ({ ...place, description: '브라우저 테스트 장소', address: '경주시', imageUrl: '/login-spring-bg.png', tags: [], source: 'sample' }));

function visits(items: VisitInput[]): ScheduleFixture['schedule_places'] {
  return items.map((item, index) => {
    const place = places.find(candidate => candidate.contentId === item.contentId)!;
    return {
      id: `visit-${index}`, visit_date: item.visitDate, start_time: item.startTime ? `${item.startTime}:00` : null,
      stay_minutes: item.stayMinutes, sort_order: index, note: item.note ?? null,
      places: { content_id: place.contentId, name: place.name, image_url: place.imageUrl }
    };
  });
}

test.beforeEach(async ({ page }) => {
  // Only authentication reaches the isolated local server. Provider/database
  // contracts below are fixtures; API and SQL behavior have separate tests.
  await loginForBrowser(page);
});

test('AI course becomes a dated multi-day itinerary and opens in the calendar', async ({ page }) => {
  const scheduleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let stored: ScheduleFixture | null = null;
  const plan: CoursePlan = {
    title: '연말 2일 경주 여행', summary: '문화재와 맛집을 나누어 방문하는 일정입니다.',
    transport: 'walking', generatedBy: 'fallback', timingSource: 'estimated', days: 2, startTime: '10:00',
    totalDistanceMeters: 0, estimatedMinutes: 150,
    stops: [
      { contentId: places[0].contentId, order: 0, dayIndex: 0, startTime: '10:00', endTime: '11:30', stayMinutes: 90, reason: '역사 탐방', place: places[0] },
      { contentId: places[2].contentId, order: 1, dayIndex: 1, startTime: '10:00', endTime: '11:00', stayMinutes: 60, reason: '지역 음식', place: places[2] }
    ]
  };
  await page.route('**/api/courses', route => route.fulfill({ json: { data: [] } }));
  await page.route('**/api/courses/recommend', route => route.fulfill({ json: { data: plan } }));
  await page.route('**/api/schedules', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { title: string; startDate: string; endDate: string; items: VisitInput[] };
      stored = { id: scheduleId, title: body.title, start_date: body.startDate, end_date: body.endDate, schedule_places: visits(body.items) };
      await route.fulfill({ status: 201, json: { data: stored } });
      return;
    }
    await route.fulfill({ json: { data: stored ? [stored] : [] } });
  });

  // The initial course-list effect confirms React hydration has attached the
  // controlled form handlers; WebKit can expose SSR inputs before that point.
  const coursesReady = page.waitForResponse(response => new URL(response.url()).pathname === '/api/courses');
  await page.goto('/courses');
  expect((await coursesReady).ok()).toBe(true);
  await page.getByLabel('여행 목적', { exact: true }).fill('가족 역사 여행');
  await page.getByRole('combobox', { name: '기간', exact: true }).selectOption('2');
  await page.getByRole('combobox', { name: '동행', exact: true }).selectOption('family');
  await page.getByLabel('하루 시작 시간').fill('10:00');
  const recommendationRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/courses/recommend');
  await page.getByRole('button', { name: 'AI 코스 추천받기', exact: true }).click();
  expect((await recommendationRequest).postDataJSON()).toMatchObject({ purpose: '가족 역사 여행', days: 2, companion: 'family', startTime: '10:00', lang: 'ko' });
  await expect(page.getByRole('heading', { name: plan.title, exact: true })).toBeVisible();
  await page.getByLabel('여행 시작일').fill('2026-12-31');

  const creationRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/schedules');
  await page.getByRole('button', { name: '이 코스로 일정 만들기', exact: true }).click();
  expect((await creationRequest).postDataJSON()).toMatchObject({
    startDate: '2026-12-31', endDate: '2027-01-01', items: [
      { contentId: places[0].contentId, visitDate: '2026-12-31', startTime: '10:00', stayMinutes: 90 },
      { contentId: places[2].contentId, visitDate: '2027-01-01', startTime: '10:00', stayMinutes: 60 }
    ]
  });
  await page.getByRole('link', { name: '생성한 일정 보기', exact: true }).click();
  await expect(page).toHaveURL(`/schedule?id=${scheduleId}`);
  await expect(page.getByRole('heading', { name: plan.title, exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: `${places[0].name} 방문일`, exact: true })).toHaveValue('2026-12-31');
  await expect(page.getByLabel(`${places[2].name} 방문 시간`, { exact: true })).toHaveValue('10:00');
  await page.getByRole('button', { name: '캘린더', exact: true }).click();
  const secondDay = page.locator('section').filter({ has: page.getByText('2027-01-01', { exact: true }) }).last();
  await expect(secondDay).toContainText(places[2].name);
  await expect(secondDay).not.toContainText(places[0].name);
});

test('cart adds a place to the selected schedule and date while preserving existing visits', async ({ page }) => {
  const firstId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const secondId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const schedules: ScheduleFixture[] = [
    { id: firstId, title: '선택하지 않은 일정', start_date: '2026-09-06', end_date: '2026-09-07', schedule_places: [] },
    { id: secondId, title: '추가할 가족 일정', start_date: '2026-09-08', end_date: '2026-09-09', schedule_places: visits([
      { contentId: places[0].contentId, visitDate: '2026-09-08', startTime: '09:15', stayMinutes: 90, note: '기존 메모' },
      { contentId: places[1].contentId, visitDate: '2026-09-08', startTime: '15:30', stayMinutes: 60 }
    ]).reverse() }
  ];
  const selectedPlace = places[2];
  const mutations: string[] = [];
  await page.route('**/api/cart', route => route.fulfill({ json: { data: [{
    id: 'cart-food', created_at: '2026-09-06T00:00:00Z',
    places: { content_id: selectedPlace.contentId, name: selectedPlace.name, category: selectedPlace.category, address: selectedPlace.address, image_url: selectedPlace.imageUrl }
  }] } }));
  await page.route('**/api/schedules', async route => {
    if (route.request().method() !== 'GET') {
      mutations.push(route.request().method());
      await route.fulfill({ status: 400, json: { error: { message: 'Unexpected schedule creation' } } });
      return;
    }
    await route.fulfill({ json: { data: schedules } });
  });
  await page.route(`**/api/schedules/${secondId}`, async route => {
    mutations.push(route.request().method());
    const body = route.request().postDataJSON() as { items: VisitInput[] };
    schedules[1] = { ...schedules[1], schedule_places: visits(body.items) };
    await route.fulfill({ json: { data: schedules[1] } });
  });

  await page.goto('/cart');
  await expect(page.getByRole('combobox', { name: '추가할 일정', exact: true })).toHaveValue(firstId);
  await page.getByRole('button', { name: selectedPlace.name, exact: true }).click();
  await page.getByRole('combobox', { name: '추가할 일정', exact: true }).selectOption(secondId);
  await page.getByRole('combobox', { name: '방문 날짜', exact: true }).selectOption('2026-09-09');
  const updateRequest = page.waitForRequest(request => request.method() === 'PATCH' && new URL(request.url()).pathname === `/api/schedules/${secondId}`);
  await page.getByRole('button', { name: '일정에 추가', exact: true }).click();
  expect((await updateRequest).postDataJSON()).toEqual({ items: [
    { contentId: places[0].contentId, visitDate: '2026-09-08', startTime: '09:15', stayMinutes: 90, note: '기존 메모' },
    { contentId: places[1].contentId, visitDate: '2026-09-08', startTime: '15:30', stayMinutes: 60 },
    { contentId: selectedPlace.contentId, visitDate: '2026-09-09', stayMinutes: 60 }
  ] });
  await expect(page.getByRole('status')).toHaveText('1곳을 일정에 추가했습니다.');
  expect(mutations).toEqual(['PATCH']);
  expect(schedules[0].schedule_places).toEqual([]);

  await page.goto(`/schedule?id=${secondId}`);
  await expect(page.getByRole('heading', { name: '추가할 가족 일정', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: `${selectedPlace.name} 방문일`, exact: true })).toHaveValue('2026-09-09');
  await expect(page.getByLabel(`${places[0].name} 방문 시간`, { exact: true })).toHaveValue('09:15');
  await expect(page.locator('ol li').first()).toContainText(places[0].name);
});
