// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaInstallCard, PwaInstallProvider } from './pwa-install';
vi.mock('@/frontend/i18n/locale-context', () => ({ useLocale: () => ({ locale: 'ko' }) }));
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const mount = () => render(<PwaInstallProvider><PwaInstallCard /></PwaInstallProvider>);
describe('PWA installation', () => {
  it('offers browser instructions when no install event is available', () => {
    mount();
    expect(screen.getByText(/브라우저 메뉴에서/)).toBeVisible();
    expect(screen.queryByRole('button', { name: '홈 화면에 설치' })).toBeNull();
  });
  it('opens a captured prompt once and handles dismissal without claiming installation', async () => {
    mount();
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '홈 화면에 설치' })); });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('앱이 설치되어 있습니다.')).toBeNull();
  });
  it('responds to the browser confirming installation', () => {
    mount();
    act(() => { window.dispatchEvent(new Event('appinstalled')); });
    expect(screen.getByText('앱이 설치되어 있습니다.')).toBeVisible();
  });
});
