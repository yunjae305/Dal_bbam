import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import sharp from 'sharp';

const { dbClient, currentUser, moderate, privacy, available } = vi.hoisted(() => ({
  dbClient: vi.fn(), currentUser: vi.fn(), moderate: vi.fn(), privacy: vi.fn(), available: vi.fn(),
}));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: dbClient }));
vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser: currentUser }));
vi.mock('@/backend/openai', () => ({ moderateContent: moderate, generateStructured: privacy, isOpenAiAvailable: available }));
import { POST } from './route';

const mediaId = 'd2a0b5c2-0c0c-4e11-bfa1-09859814c111';
const actor = { id: 'user', name: 'Traveler', provider: 'demo', actorKey: 'demo:user' };
const request = () => new NextRequest('http://localhost/api/community/uploads/complete', { method: 'POST', body: JSON.stringify({ mediaId }) });

async function setup() {
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#123456' } })
    .jpeg().withMetadata({ exif: { IFD0: { Copyright: 'private@example.com' } } }).toBuffer();
  const media = { id: mediaId, staging_path: 'actor/photo.jpg', mime_type: 'image/jpeg', size_bytes: bytes.length, status: 'staged', public_path: null };
  const q = { select: vi.fn(), eq: vi.fn(), update: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: media, error: null }), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
  for (const method of [q.select, q.eq, q.update]) method.mockReturnValue(q);
  const staging = { download: vi.fn().mockResolvedValue({ data: new Blob([new Uint8Array(bytes)]), error: null }), createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.example.com/signed' } }), remove: vi.fn().mockResolvedValue({ error: null }) };
  const published = { upload: vi.fn().mockResolvedValue({ error: null }), getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://storage.example.com/public.jpg' } }), remove: vi.fn().mockResolvedValue({ error: null }) };
  const db = { from: vi.fn(() => q), rpc: vi.fn().mockResolvedValue({ data: true, error: null }), storage: { from: vi.fn((bucket: string) => bucket === 'community-staging' ? staging : published) } };
  dbClient.mockReturnValue(db);
  return { q, staging, published, bytes };
}

describe('community photo safety boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser.mockResolvedValue(actor);
    available.mockReturnValue(true);
    moderate.mockResolvedValue({ allowed: true, categories: {}, provider: 'openai' });
    privacy.mockResolvedValue({ value: { containsPersonalInformation: false } });
  });

  it('rejects visible image PII and never publishes the source photo', async () => {
    const { q, staging, published } = await setup();
    privacy.mockResolvedValue({ value: { containsPersonalInformation: true } });
    const response = await POST(request());
    expect(response.status).toBe(422);
    expect(q.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected', moderation: { categories: {}, personalInformation: true } }));
    expect(staging.remove).toHaveBeenCalledWith(['actor/photo.jpg']);
    expect(published.upload).not.toHaveBeenCalled();
  });

  it('does not publish when an enabled image scanner fails', async () => {
    const { published } = await setup();
    privacy.mockRejectedValue(new Error('scanner unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(published.upload).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('strips source metadata and reports a completed check after both scanners approve', async () => {
    const { bytes, q, published } = await setup();
    expect((await sharp(bytes).metadata()).exif).toBeDefined();
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await sharp(published.upload.mock.calls[0][1]).metadata()).exif).toBeUndefined();
    expect(q.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved', moderation: { categories: {}, personalInformation: false, privacyCheck: 'completed' } }));
    await expect(response.json()).resolves.toMatchObject({ data: { privacyCheck: 'completed' } });
  });

  it('keeps optional-AI uploads usable without claiming a privacy scan occurred', async () => {
    const { q } = await setup();
    available.mockReturnValue(false);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(privacy).not.toHaveBeenCalled();
    expect(moderate).not.toHaveBeenCalled();
    expect(q.update).toHaveBeenCalledWith(expect.objectContaining({ moderation: { categories: {}, personalInformation: null, privacyCheck: 'unavailable' } }));
    await expect(response.json()).resolves.toMatchObject({ data: { privacyCheck: 'unavailable' } });
  });
});
