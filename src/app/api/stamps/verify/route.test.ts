import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { LOCATION_CONSENT_VERSION } from '@/shared/location-consent';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  awardStampBadges: vi.fn()
}));

vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));
vi.mock('@/backend/badges', () => ({ awardStampBadges: mocks.awardStampBadges }));

import { POST } from '@/app/api/stamps/verify/route';

type FakeDbOptions = {
  consent?: { consent_version: string; granted: boolean } | null;
  place?: { id: string; content_id: string; name: string; lat: number; lng: number } | null;
  stampError?: { code?: string } | null;
};

function fakeDb(options: FakeDbOptions) {
  return {
    from(table: string) {
      if (table === 'location_consents') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: options.consent ?? null, error: null })
                })
              })
            })
          })
        };
      }
      if (table === 'places') {
        return {
          select: () => ({
            limit: () => ({
              eq: async () => ({
                data: options.place ? [options.place] : [],
                error: null
              })
            })
          })
        };
      }
      if (table === 'stamps') {
        return {
          insert: async () => ({ error: options.stampError ?? null })
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }
  };
}

function request() {
  return new NextRequest('http://localhost/api/stamps/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'http://localhost'
    },
    body: JSON.stringify({
      placeId: '125780',
      lat: 35.8562,
      lng: 129.2247,
      accuracyMeters: 20
    })
  });
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue({
    id: 'user-1',
    email: 'traveler@example.com',
    provider: 'password',
    actorKey: 'password:user-1'
  });
  mocks.awardStampBadges.mockResolvedValue([]);
});

describe('stamp verification persistence invariants', () => {
  it('requires the current explicit location consent', async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(fakeDb({ consent: null }));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('LOCATION_CONSENT_REQUIRED');
  });

  it('does not return success for a place that is not synced to the database', async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(fakeDb({
      consent: { consent_version: LOCATION_CONSENT_VERSION, granted: true },
      place: null
    }));
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('STAMP_PLACE_NOT_SYNCED');
  });

  it('returns a persisted success only after the stamp insert succeeds', async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(fakeDb({
      consent: { consent_version: LOCATION_CONSENT_VERSION, granted: true },
      place: {
        id: '6a456987-2f80-45bd-93b5-69546265116b',
        content_id: '125780',
        name: '테스트 장소',
        lat: 35.8562,
        lng: 129.2247
      }
    }));
    const response = await POST(request());
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({ verified: true, persisted: true, alreadyAcquired: false });
  });
});
