// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareLinkButton } from './share-link-button';
import { shareMessages } from '@/shared/share-messages';

vi.mock('@/frontend/i18n/locale-context', () => ({ useLocale: () => ({ locale: 'ko' }) }));

const ui = shareMessages.ko;
const showModalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
let writeText: ReturnType<typeof vi.fn>;

function renderButton() {
  render(<ShareLinkButton path="/places/126166" title="경주 불국사" text="불국사 소개" label="공유" />);
  return screen.getByRole('button', { name: '공유' });
}

describe('place sharing', () => {
  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share: undefined, clipboard: { writeText } });
    // jsdom has no modal top layer; emulate opening/closing for interaction tests.
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } },
      close: { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } }
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    if (showModalDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModalDescriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });

  it('calls the native chooser immediately from the click with place details', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    navigator.share = share;
    const button = renderButton();
    fireEvent.click(button);
    // Must happen before yielding so the browser still has user activation.
    expect(share).toHaveBeenCalledWith({ title: '경주 불국사', text: '불국사 소개', url: `${window.location.origin}/places/126166` });
    await act(async () => {});
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens an explanation instead of silently copying when native sharing is absent', async () => {
    fireEvent.click(renderButton());
    expect(screen.getByRole('dialog', { name: ui.title })).toBeVisible();
    expect(screen.getByText(ui.unsupported)).toBeVisible();
    expect(writeText).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: ui.copy })); });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/places/126166`);
    expect(screen.getByRole('status')).toHaveTextContent(ui.copied);
    fireEvent.click(screen.getByRole('button', { name: ui.close }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not copy or show an error when the user cancels the native chooser', async () => {
    navigator.share = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
    const button = renderButton();
    await act(async () => { fireEvent.click(button); });
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers a fresh user-initiated retry after a native share failure', async () => {
    const share = vi.fn().mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError')).mockResolvedValue(undefined);
    navigator.share = share;
    const button = renderButton();
    await act(async () => { fireEvent.click(button); });
    expect(screen.getByText(ui.failed)).toBeVisible();
    expect(writeText).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: ui.retry })); });
    expect(share).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps a selectable link when clipboard permission is denied', async () => {
    writeText.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    fireEvent.click(renderButton());
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: ui.copy })); });
    expect(screen.getByRole('status')).toHaveTextContent(ui.copyFailed);
    expect(screen.getByRole('textbox', { name: ui.link })).toHaveValue(`${window.location.origin}/places/126166`);
  });

  it('closes the fallback with the native dialog cancel event', () => {
    fireEvent.click(renderButton());
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
