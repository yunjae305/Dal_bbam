import { createHash, randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import {
  apiData,
  apiError,
  checkRateLimit,
  getUserDataContext,
  isErrorContext,
  parseBody,
  rateLimitError
} from '@/backend/http';

const mimeExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const body = await parseBody<{ mimeType?: string; sizeBytes?: number }>(request);
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : undefined;
  const extension = mimeType ? mimeExtensions[mimeType] : undefined;
  const sizeBytes = Number(body?.sizeBytes);
  if (!extension || !mimeType || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_SIZE_BYTES) {
    return apiError('INVALID_UPLOAD', '10MB 이하의 JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.');
  }

  const rateLimit = await checkRateLimit(context, 'community-upload-sign', 10);
  if (rateLimit !== 'ok') return rateLimitError(rateLimit, '이미지 업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');

  const actorDirectory = createHash('sha256').update(context.user.actorKey).digest('hex').slice(0, 24);
  const path = `${actorDirectory}/${randomUUID()}.${extension}`;
  const { data: media, error } = await context.db
    .from('community_media')
    .insert({
      actor_key: context.user.actorKey,
      staging_path: path,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      status: 'staged',
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    })
    .select('id')
    .single();
  if (error) return apiError('MEDIA_RECORD_FAILED', error.message, 500);

  const { data: signed, error: signError } = await context.db.storage
    .from('community-staging')
    .createSignedUploadUrl(path);
  if (signError || !signed) {
    await context.db.from('community_media').delete().eq('id', media.id).eq('actor_key', context.user.actorKey);
    return apiError('UPLOAD_SIGN_FAILED', signError?.message ?? '업로드 URL을 만들지 못했습니다.', 500);
  }

  return apiData({
    mediaId: media.id,
    path: signed.path,
    token: signed.token,
    signedUrl: signed.signedUrl
  }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}
