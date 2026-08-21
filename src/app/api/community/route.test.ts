import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentUser = vi.fn();
const createSupabaseAdminClient = vi.fn();
const moderateContent = vi.fn();

vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient }));
vi.mock('@/backend/openai', () => ({ moderateContent }));

describe('community collection route', () => {
  const actor = { id: 'user-1', name: '여행자', provider: 'demo', actorKey: 'demo:user-1' };

  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(actor);
  });

  it('rejects a post before any database write when server moderation rejects it', async () => {
    const from = vi.fn();
    createSupabaseAdminClient.mockReturnValue({ from });
    moderateContent.mockResolvedValue({
      allowed: false,
      flagged: true,
      categories: { harassment: true }
    });
    const { POST } = await import('@/app/api/community/route');

    const response = await POST(new NextRequest('http://localhost/api/community', {
      method: 'POST',
      body: JSON.stringify({
        category: 'review',
        title: '검사 대상 제목',
        content: '검사 대상 내용'
      })
    }));

    expect(moderateContent).toHaveBeenCalledWith({ text: '검사 대상 제목\n검사 대상 내용' });
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'MODERATION_REJECTED' } });
    expect(from).not.toHaveBeenCalled();
  });
});
