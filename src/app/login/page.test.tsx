// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './page';
import { SIGNUP_CONSENT_VERSION, signupConsentCopy } from '@/shared/signup-consent';
import { uiMessages } from '@/shared/ui-messages';
import { languages } from '@/shared/types';
import { authProviderMessages } from '@/shared/auth-provider-messages';

const state = vi.hoisted(() => ({ locale: 'ko' }));
vi.mock('@/frontend/i18n/locale-context', () => ({ useLocale: () => ({ locale: state.locale }) }));

describe('signup consent form', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    state.locale = 'ko';
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => ({ ok: true, json: async () => String(url) === '/api/auth/demo' ? { enabled: false } : { success: true, needsEmailVerification: true } }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it.each(languages)('renders unchecked required consent controls and policy links in %s', async locale => {
    state.locale = locale;
    const ui = uiMessages[locale].auth;
    const copy = signupConsentCopy[locale];
    render(<LoginPage />);
    fireEvent.click(screen.getAllByRole('button', { name: ui.signup })[0]);
    const terms = screen.getByRole('checkbox', { name: copy.terms });
    const privacy = screen.getByRole('checkbox', { name: copy.privacy });
    expect(terms).not.toBeChecked(); expect(terms).toBeRequired();
    expect(privacy).not.toBeChecked(); expect(privacy).toBeRequired();
    expect(screen.getByRole('link', { name: copy.termsDetails })).toHaveAttribute('href', '/legal/terms');
    expect(screen.getByRole('link', { name: copy.privacyDetails })).toHaveAttribute('href', '/legal/privacy');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it('enables signup only after both consents and sends the exact consent version', async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getAllByRole('button', { name: '회원가입' })[0]);
    fireEvent.change(screen.getByLabelText('이메일 주소'), { target: { value: 'traveler@example.com' } });
    fireEvent.change(screen.getByLabelText('이름 (2자 이상)'), { target: { value: '여행자' } });
    fireEvent.change(screen.getByLabelText('비밀번호', { exact: true }), { target: { value: 'test-password' } });
    fireEvent.change(screen.getByLabelText('비밀번호 확인', { exact: true }), { target: { value: 'test-password' } });
    const submit = screen.getByRole('button', { name: '가입하기' });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: signupConsentCopy.ko.terms }));
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: signupConsentCopy.ko.privacy }));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await screen.findByRole('status');
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/auth/signup');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ termsAccepted: true, privacyAccepted: true, consentVersion: SIGNUP_CONSENT_VERSION, lang: 'ko' });
  });

  it('blocks a programmatically submitted signup without consent', async () => {
    const { container } = render(<LoginPage />);
    fireEvent.click(screen.getAllByRole('button', { name: '회원가입' })[0]);
    fireEvent.submit(container.querySelector('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent(signupConsentCopy.ko.required);
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/signup')).toBe(false);
  });

  it.each(languages)('disables unavailable Google sign-in with a localized explanation in %s', async locale => {
    state.locale = locale;
    render(<LoginPage />);
    const google = screen.getByRole('button', { name: uiMessages[locale].auth.googleLogin });
    expect(google).toBeDisabled();
    await screen.findByText(authProviderMessages[locale].unavailable);
    expect(google).toBeDisabled();
    expect(google).toHaveAccessibleDescription(authProviderMessages[locale].unavailable);
  });

  it('enables Google sign-in only after the capability endpoint confirms availability', async () => {
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => ({
      ok: true, json: async () => String(url) === '/api/auth/providers' ? { google: true } : { enabled: false }
    }));
    render(<LoginPage />);
    const google = screen.getByRole('button', { name: uiMessages.ko.auth.googleLogin });
    expect(google).toBeDisabled();
    await waitFor(() => expect(google).toBeEnabled());
    expect(screen.queryByText(authProviderMessages.ko.unavailable)).not.toBeInTheDocument();
  });

  it('keeps Google unavailable when the capability request fails', async () => {
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url) === '/api/auth/providers') throw new Error('Network unavailable');
      return { ok: true, json: async () => ({ enabled: false }) };
    });
    render(<LoginPage />);
    await screen.findByText(authProviderMessages.ko.unavailable);
    expect(screen.getByRole('button', { name: uiMessages.ko.auth.googleLogin })).toBeDisabled();
  });
});
