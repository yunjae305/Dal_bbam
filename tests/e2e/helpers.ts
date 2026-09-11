import { expect, type Page } from '@playwright/test';

export async function loginForBrowser(page: Page) {
  const response = await page.request.post('/api/auth/demo');
  expect(response.status()).toBe(200);
  const origin = new URL(response.url());
  if (page.context().browser()?.browserType().name() === 'webkit'
    && origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) {
    // WebKit correctly withholds production Secure cookies on plain HTTP.
    // Adapt only this isolated loopback fixture; production cookie settings
    // stay Secure and deployed HTTPS authentication needs separate validation.
    const header = response.headers()['set-cookie'];
    expect(header).toMatch(/;\s*Secure(?:;|$)/i);
    const pair = header.split(';')[0];
    const equals = pair.indexOf('=');
    await page.context().addCookies([{
      name: pair.slice(0, equals), value: pair.slice(equals + 1),
      domain: origin.hostname, path: '/', httpOnly: true, secure: false, sameSite: 'Lax'
    }]);
  }
}
