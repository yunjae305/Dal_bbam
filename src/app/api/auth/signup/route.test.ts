import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SIGNUP_CONSENT_VERSION } from '@/shared/signup-consent';

const { createClient, signUp, signOut } = vi.hoisted(() => ({ createClient: vi.fn(), signUp: vi.fn(), signOut: vi.fn() }));
vi.mock('@/backend/supabase/server', () => ({ createSupabaseServerClient: createClient }));
import { POST } from './route';

const valid = { email: 'traveler@example.com', name: '여행자', password: 'test-password', termsAccepted: true, privacyAccepted: true, consentVersion: SIGNUP_CONSENT_VERSION };
const request = (body: unknown) => new NextRequest('https://dal-bbam.example/api/auth/signup', { method: 'POST', body: JSON.stringify(body) });

describe('explicit signup consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockResolvedValue({ auth: { signUp, signOut } });
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    signOut.mockResolvedValue({ error: null });
  });

  it.each([
    { termsAccepted: undefined }, { privacyAccepted: false }, { termsAccepted: 'true' },
    { privacyAccepted: 'true' }, { consentVersion: 'old-version' }, { consentVersion: undefined }
  ])('rejects absent, invalid or outdated consent before creating an account: %j', async override => {
    const response = await POST(request({ ...valid, ...override }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect(createClient).not.toHaveBeenCalled();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('records explicit consent version and server time with the signup metadata', async () => {
    const before = Date.now();
    const response = await POST(request({ ...valid, accepted_at: '1900-01-01T00:00:00Z' }));
    expect(response.status).toBe(200);
    const metadata = signUp.mock.calls[0][0].options.data;
    expect(metadata).toMatchObject({ name: '여행자', signup_consent: { terms_accepted: true, privacy_accepted: true, version: SIGNUP_CONSENT_VERSION } });
    expect(Date.parse(metadata.signup_consent.accepted_at)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(metadata.signup_consent.accepted_at)).toBeLessThanOrEqual(Date.now());
    await expect(response.json()).resolves.toMatchObject({ success: true, needsEmailVerification: true });
  });

  it('reports missing consent in the requested language', async () => {
    const response = await POST(request({ ...valid, privacyAccepted: false, lang: 'en' }));
    expect((await response.json()).error).toMatch(/Please agree/);
  });

  it('rejects malformed JSON values without throwing', async () => {
    for (const body of [null, [], 'invalid']) expect((await POST(request(body))).status).toBe(400);
    expect(signUp).not.toHaveBeenCalled();
  });
});
