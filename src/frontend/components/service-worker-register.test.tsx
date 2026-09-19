// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceWorkerRegister } from './service-worker-register';
vi.mock('@/frontend/i18n/locale-context', () => ({ useLocale: () => ({ locale: 'ko' }) }));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); Reflect.deleteProperty(navigator, 'serviceWorker'); Reflect.deleteProperty(navigator, 'onLine'); });
describe('PWA lifecycle', () => {
  it('waits for the user to accept an update before activating it', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const postMessage = vi.fn();
    const registration = Object.assign(new EventTarget(), { waiting: { postMessage }, installing: null, update: vi.fn().mockResolvedValue(undefined) });
    const serviceWorker = Object.assign(new EventTarget(), { controller: {}, register: vi.fn().mockResolvedValue(registration) });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
    render(<ServiceWorkerRegister />);
    expect(await screen.findByText('새 버전이 준비되었습니다.')).toBeVisible();
    expect(postMessage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '나중에' }));
    expect(screen.queryByText('새 버전이 준비되었습니다.')).toBeNull();
    act(() => { serviceWorker.dispatchEvent(new Event('controllerchange')); });
    expect(await screen.findByText('새 버전이 준비되었습니다.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '업데이트' }));
    expect(postMessage).toHaveBeenCalledExactlyOnceWith('SKIP_WAITING');
  });
  it('shows offline recovery and removes it when reconnected', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    render(<ServiceWorkerRegister />);
    expect(await screen.findByRole('link', { name: '저장된 장소 보기' })).toHaveAttribute('href', '/offline');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    act(() => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(screen.queryByRole('link')).toBeNull());
  });
});
