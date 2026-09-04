import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { LOCATION_CONSENT_VERSION } from '@/shared/location-consent';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  awardStampBadges: vi.fn(),
  awardStampRewards: vi.fn()
}));

vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));
vi.mock('@/backend/badges', () => ({ awardStampBadges: mocks.awardStampBadges }));
vi.mock('@/backend/stamps', async importOriginal => ({
  ...await importOriginal<typeof import('@/backend/stamps')>(),
  awardStampRewards: mocks.awardStampRewards
}));

import { POST } from '@/app/api/stamps/verify/route';

type FakeDbOptions = {
  consent?: { consent_version: string; granted: boolean } | null;
  place?: { id: string; content_id: string; name: string; lat: number; lng: number } | null;
  target?: {
    id: string;
    is_active: boolean;
    checkpoint_required: boolean;
    radius_m: number | null;
  } | null;
  rateLimit?: boolean;
  rateLimitError?: { message: string } | null;
  claim?: {
    status: 'acquired' | 'already_acquired' | 'checkpoint_invalid' | 'target_invalid';
    stamp_id?: string;
    checkpoint_id?: string | null;
  } | null;
  claimError?: { message: string } | null;
  onClaim?: (args: Record<string, unknown>) => void;
};

function fakeDb(options: FakeDbOptions) {
  const defaultTarget = {
    id: 'b7c99a9f-c3cc-49f5-91c7-753714d7df6a',
    is_active: true,
    checkpoint_required: false,
    radius_m: 150
  };
  const target = Object.prototype.hasOwnProperty.call(options, 'target')
    ? options.target
    : defaultTarget;
  return {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === 'consume_api_rate_limit') {
        return { data: options.rateLimit ?? true, error: options.rateLimitError ?? null };
      }
      if (name === 'claim_stamp') {
        options.onClaim?.(args);
        return {
          data: options.claimError ? null : options.claim ?? { status: 'acquired', stamp_id: 'stamp-1', checkpoint_id: null },
          error: options.claimError ?? null
        };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
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
      if (table === 'stamp_targets') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: target ?? null, error: null })
            })
          })
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }
  };
}

function request(overrides: Record<string, unknown> = {}) {
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
      accuracyMeters: 20,
      ...overrides
    })
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({
    id: 'user-1',
    email: 'traveler@example.com',
    provider: 'password',
    actorKey: 'password:user-1'
  });
  mocks.awardStampBadges.mockResolvedValue([]);
  mocks.awardStampRewards.mockResolvedValue([]);
  delete process.env.STAMP_REQUIRE_CHECKPOINT;
});

afterEach(() => {
  delete process.env.STAMP_REQUIRE_CHECKPOINT;
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

  it('returns a persisted success only after the atomic claim_stamp RPC acquires the stamp', async () => {
    let claimed: Record<string, unknown> | undefined;
    mocks.createSupabaseAdminClient.mockReturnValue(fakeDb({
      consent: { consent_version: LOCATION_CONSENT_VERSION, granted: true },
      place: {
        id: '6a456987-2f80-45bd-93b5-69546265116b',
        content_id: '125780',
        name: '테스트 장소',
        lat: 35.8562,
        lng: 129.2247
      },
      onClaim: args => { claimed = args; }
    }));
    const response = await POST(request());
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      verified: true,
      persisted: true,
      alreadyAcquired: false,
      checkpointVerified: false
    });
    expect(claimed).toMatchObject({
      p_actor_key: 'password:user-1',
      p_place_id: '6a456987-2f80-45bd-93b5-69546265116b',
      p_stamp_target_id: 'b7c99a9f-c3cc-49f5-91c7-753714d7df6a',
      p_checkpoint_required: false,
      p_token_hash: null,
      p_accuracy_m: 20
    });
    expect(mocks.awardStampBadges).toHaveBeenCalledOnce();
  });

  it('reports an already acquired stamp as persisted without re-awarding', async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(fakeDb({
      consent: { consent_version: LOCATION_CONSENT_VERSION, granted: true },
      place: {
        id: '6a456987-2f80-45bd-93b5-69546265116b',
        content_id: '125780',
        name: '테스트 장소',
        lat: 35.8562,
        lng: 129.2247
      },
      claim: { status: 'already_acquired', stamp_id: 'stamp-1', checkpoint_id: null }
    }));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ persisted: true, alreadyAcquired: true });
  });

  it('fails with STAMP_SAVE_FAILED and no persisted payload when the claim RPC errors', async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(fakeDb({
      consent: { consent_version: LOCATION_CONSENT_VERSION, granted: true },
      place: {
        id: '6a456987-2f80-45bd-93b5-69546265116b',
        content_id: '125780',
        name: '테스트 장소',
        lat: 35.8562,
        lng: 129.2247
      },
      claimError: { message: 'claim unavailable' }
    }));
    const response = await POST(request());
    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload.error.code).toBe('STAMP_SAVE_FAILED');
    expect(payload.data).toBeUndefined();
    expect(mocks.awardStampBadges).not.toHaveBeenCalled();
    expect(mocks.awardStampRewards).not.toHaveBeenCalled();
  });

  it('fails closed when browser accuracy is missing', async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(fakeDb({
      consent: { consent_version: LOCATION_CONSENT_VERSION, granted: true }
    }));
    const response = await POST(request({ accuracyMeters: undefined }));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('ACCURACY_REQUIRED');
  });

  it('requires an on-site token when the target is checkpoint protected', async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(fakeDb({
      consent: { consent_version: LOCATION_CONSENT_VERSION, granted: true },
      place: {
        id: '6a456987-2f80-45bd-93b5-69546265116b',
        content_id: '125780',
        name: '테스트 장소',
        lat: 35.8562,
        lng: 129.2247
      },
      target: {
        id: 'b7c99a9f-c3cc-49f5-91c7-753714d7df6a',
        is_active: true,
        checkpoint_required: true,
        radius_m: 150
      }
    }));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('CHECKPOINT_REQUIRED');
  });

  it('fails closed globally when checkpoint enforcement is enabled', async () => {
    process.env.STAMP_REQUIRE_CHECKPOINT = 'true';
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
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('CHECKPOINT_REQUIRED');
  });

  it('rejects requests once the atomic verification rate limit is exhausted', async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(fakeDb({ rateLimit: false }));
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe('STAMP_RATE_LIMITED');
  });
});
