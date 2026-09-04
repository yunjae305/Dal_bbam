import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authorizeAdminRequest: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  generateStampArtwork: vi.fn()
}));

vi.mock('@/backend/auth/admin', () => ({ authorizeAdminRequest: mocks.authorizeAdminRequest }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));
vi.mock('@/backend/openai', async importOriginal => ({
  ...await importOriginal<typeof import('@/backend/openai')>(),
  generateStampArtwork: mocks.generateStampArtwork
}));

import { GET, PATCH, POST } from '@/app/api/stamps/admin/artworks/route';

const targetId = 'b7c99a9f-c3cc-49f5-91c7-753714d7df6a';
const artworkId = '953a390c-568c-4647-940f-e375e061ec05';

function request(method: 'GET' | 'POST' | 'PATCH', body?: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/stamps/admin/artworks', {
    method,
    headers: { origin: 'http://localhost', host: 'localhost', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
}

function generationDb(captures: {
  inserted?: Record<string, unknown>;
  uploaded?: { path: string; bytes: Buffer };
}) {
  return {
    async rpc(name: string) {
      if (name === 'consume_api_rate_limit') return { data: true, error: null };
      if (name === 'approve_stamp_artwork') return { data: true, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    },
    from(table: string) {
      if (table === 'stamp_targets') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: targetId,
                  is_active: true,
                  places: {
                    id: '6a456987-2f80-45bd-93b5-69546265116b',
                    content_id: '125780',
                    name: '동궁과 월지',
                    category: 'heritage',
                    description: '신라 왕궁 별궁 터',
                    overview: '연못에 비친 신라 야경'
                  }
                },
                error: null
              })
            })
          })
        };
      }
      if (table === 'stamp_artworks') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) })
              })
            })
          }),
          insert: (row: Record<string, unknown>) => {
            captures.inserted = row;
            return {
              select: () => ({ single: async () => ({ data: { id: artworkId }, error: null }) })
            };
          },
          update: () => ({ eq: async () => ({ error: null }) })
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Buffer) => {
          captures.uploaded = { path, bytes };
          return { error: null };
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://storage.example/${path}` }
        }),
        remove: async () => ({ error: null })
      })
    }
  };
}

function reviewDb(rpc: ReturnType<typeof vi.fn>, captures: { updated?: Record<string, unknown> }) {
  const storagePath = `${targetId}/v1-${artworkId}.png`;
  const pending = {
    id: artworkId,
    stamp_target_id: targetId,
    status: 'pending_review',
    storage_path: storagePath,
    mime_type: 'image/png',
    public_url: null
  };
  // The first read (columns include mime_type) returns the pending artwork; the
  // previously-approved lookup returns nothing. Update chains resolve without error.
  const query = (columns: string) => {
    const chain = {
      eq: () => chain,
      neq: () => chain,
      maybeSingle: async () => ({ data: columns.includes('mime_type') ? pending : null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
    };
    return chain;
  };
  return {
    rpc,
    from(table: string) {
      if (table !== 'stamp_artworks') throw new Error(`Unexpected table: ${table}`);
      return {
        select: query,
        update: (row: Record<string, unknown>) => {
          captures.updated = row;
          return query('');
        }
      };
    },
    storage: {
      from: () => ({
        download: async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null }),
        upload: async () => ({ error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.example/${path}` } }),
        remove: async () => ({ error: null })
      })
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizeAdminRequest.mockResolvedValue({
    authorized: true,
    user: null,
    method: 'secret'
  });
  mocks.generateStampArtwork.mockResolvedValue({
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    mimeType: 'image/png',
    model: 'gpt-image-2'
  });
  delete process.env.OPENAI_IMAGE_MODEL;
});

describe('stamp artwork administration', () => {
  it('fails closed before database access when the shared admin guard denies access', async () => {
    mocks.authorizeAdminRequest.mockResolvedValue({ authorized: false, user: null, method: null });
    const response = await GET(request('GET'));
    expect(response.status).toBe(401);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('stores GPT Image output as review-pending artwork by default', async () => {
    const captures: { inserted?: Record<string, unknown>; uploaded?: { path: string; bytes: Buffer } } = {};
    const db = generationDb(captures);
    mocks.createSupabaseAdminClient.mockReturnValue(db);

    const response = await POST(request('POST', { targetId, artDirection: '연꽃 실루엣 강조' }));
    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(payload.data).toMatchObject({
      id: artworkId,
      targetId,
      status: 'pending_review',
      model: 'gpt-image-2'
    });
    expect(captures.inserted).toMatchObject({
      stamp_target_id: targetId,
      status: 'generating',
      model: 'gpt-image-2',
      requested_by: 'admin-api-secret'
    });
    expect(String(captures.inserted?.prompt)).toContain('Landmark: 동궁과 월지');
    expect(captures.uploaded?.path).toContain(`${targetId}/v1-${artworkId}.png`);
    expect(mocks.generateStampArtwork).toHaveBeenCalledOnce();
  });

  it('records the authenticated reviewer when explicitly approving an artwork', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.authorizeAdminRequest.mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1', email: 'admin@example.com' },
      method: 'session'
    });
    const captures: { updated?: Record<string, unknown> } = {};
    mocks.createSupabaseAdminClient.mockReturnValue(reviewDb(rpc, captures));

    const response = await PATCH(request('PATCH', {
      artworkId,
      action: 'approve',
      note: '관광지 실루엣 확인 완료'
    }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data).toEqual({
      id: artworkId,
      status: 'approved',
      imageUrl: `https://storage.example/${targetId}/v1-${artworkId}.png`
    });
    expect(captures.updated).toMatchObject({ public_url: payload.data.imageUrl });
    expect(rpc).toHaveBeenCalledWith('approve_stamp_artwork', {
      p_artwork_id: artworkId,
      p_reviewed_by: 'session:admin@example.com',
      p_review_note: '관광지 실루엣 확인 완료'
    });
  });
});
