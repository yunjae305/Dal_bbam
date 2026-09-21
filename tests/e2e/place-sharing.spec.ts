import { expect, test } from '@playwright/test';
import { loginForBrowser } from './helpers';

// The real browser exercises dialog focus and clipboard permissions. Native OS
// sharing is stubbed explicitly; these tests do not claim Android app delivery.
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  await loginForBrowser(page);
  await page.route('**/api/places/126166?*', route => route.fulfill({ json: { data: {
    contentId: '126166', name: '경주 불국사', description: '불국사 소개', category: 'heritage',
    address: '경주시', imageUrl: '', coordinates: [35.79, 129.33], tags: [],
    source: 'database', overview: '', images: []
  } } }));
});

test('unsupported sharing opens a real modal and copies only on request', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permission emulation is Chromium-specific.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
  await page.goto('/places/126166?source=home');
  const share = page.getByRole('button', { name: '공유', exact: true });
  await expect(share).toBeVisible();
  await page.evaluate(() => navigator.clipboard.writeText('keep-existing-clipboard'));
  await share.click();
  const dialog = page.getByRole('dialog', { name: '공유하기' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true);
  await expect(dialog.getByRole('button', { name: '닫기' })).toBeFocused();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('keep-existing-clipboard');
  await dialog.getByRole('button', { name: '링크 복사', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('링크를 복사했어요');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL('/places/126166', page.url()).href);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(share).toBeFocused();
  await share.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '닫기' }).click();
  await expect(share).toBeFocused();
});

test('missing clipboard keeps the URL available for manual copying', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });
  await page.goto('/places/126166');
  await page.getByRole('button', { name: '공유', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '공유하기' });
  await dialog.getByRole('button', { name: '링크 복사', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('자동 복사가 안 돼요');
  const link = dialog.getByRole('textbox', { name: '공유 링크' });
  await link.focus();
  expect(await link.evaluate((element: HTMLInputElement) => element.selectionEnd! - element.selectionStart!)).toBe((await link.inputValue()).length);
});

test('native share and retry receive browser user activation', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ data: ShareData; active: boolean }> = [];
    Object.assign(window, { shareReviewCalls: calls });
    Object.defineProperty(navigator, 'share', { configurable: true, value: (data: ShareData) => {
      calls.push({ data, active: navigator.userActivation.isActive });
      return calls.length === 1
        ? Promise.reject(new DOMException('Test permission failure', 'NotAllowedError'))
        : Promise.resolve();
    } });
  });
  await page.goto('/places/126166');
  await page.getByRole('button', { name: '공유', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '공유하기' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '다른 앱으로 공유' }).click();
  await expect(dialog).not.toBeVisible();
  const calls = await page.evaluate(() => (window as unknown as { shareReviewCalls: Array<{ data: ShareData; active: boolean }> }).shareReviewCalls);
  expect(calls).toHaveLength(2);
  for (const call of calls) {
    expect(call.active).toBe(true);
    expect(call.data).toEqual({ title: '경주 불국사', text: '불국사 소개', url: new URL('/places/126166', page.url()).href });
  }
});
