import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authorizeAdminRequest: vi.fn(),
  createSupabaseAdminClient: vi.fn()
}));

vi.mock('@/backend/auth/admin', () => ({ authorizeAdminRequest: mocks.authorizeAdminRequest }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));

import { PATCH, POST } from '@/app/api/stamps/admin/checkpoints/route';

const targetId = 'b7c99a9f-c3cc-49f5-91c7-753714d7df6a';
const checkpointId = '953a390c-568c-4647-940f-e375e061ec05';

function request(method: 'POST' | 'PATCH', body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/stamps/admin/checkpoints', {
    method,
    headers: { origin: 'http://localhost', host: 'localhost', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizeAdminRequest.mockResolvedValue({ authorized: true, user: null, method: 'secret' });
});

describe('stamp checkpoint administration', () => {
  it('persists only a token hash and returns the raw token once', async () => {
    let inserted: Record<string, unknown> | undefined;
    mocks.createSupabaseAdminClient.mockReturnValue({
      from(table: string) {
        if (table === 'stamp_targets') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: targetId,
                    is_active: true,
                    places: { content_id: '125780', name: '동궁과 월지' }
                  },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'stamp_checkpoint_tokens') {
          return {
            insert: (row: Record<string, unknown>) => {
              inserted = row;
              return {
                select: () => ({
                  single: async () => ({
                    data: {
                      id: checkpointId,
                      token_hint: row.token_hint,
                      expires_at: row.expires_at,
                      max_uses: row.max_uses
                    },
                    error: null
                  })
                })
              };
            }
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }
    });

    const response = await POST(request('POST', { targetId, maxUses: 25, expiresInHours: 8 }));
    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(payload.data.token.length).toBeGreaterThanOrEqual(40);
    expect(payload.data.checkinUrl).toContain(encodeURIComponent(payload.data.token));
    expect(inserted).toMatchObject({
      stamp_target_id: targetId,
      max_uses: 25,
      issued_by: 'admin-api-secret'
    });
    expect(inserted).not.toHaveProperty('token');
    expect(inserted?.token_hash).not.toBe(payload.data.token);
  });

  it('can revoke a previously issued checkpoint', async () => {
    let updated: Record<string, unknown> | undefined;
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: () => ({
        update: (row: Record<string, unknown>) => {
          updated = row;
          return {
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: { id: checkpointId, is_active: false }, error: null })
              })
            })
          };
        }
      })
    });
    const response = await PATCH(request('PATCH', { checkpointId, active: false }));
    expect(response.status).toBe(200);
    expect(updated).toEqual({ is_active: false });
  });
});
