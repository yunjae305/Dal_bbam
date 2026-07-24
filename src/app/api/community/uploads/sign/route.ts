import { createHash, randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import {
  apiData,
  apiError,
  getUserDataContext,
  isErrorContext,
  parseBody
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
  const extension = body?.mimeType ? mimeExtensions[body.mimeType] : undefined;
  const sizeBytes = Number(body?.sizeBytes);
  const mimeType = body?.mimeType;
  if (!extension || !mimeType || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_SIZE_BYTES) {
    return apiError('INVALID_UPLOAD', '10MB 이하의 JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.');
  }

  const actorDirectory = createHash('sha256').update(context.user.actorKey).digest('hex').slice(0, 24);
  const path = `${actorDirectory}/${randomUUID()}.${extension}`;
  const { data: signed, error: signError } = await context.db.storage
    .from('community-staging')
    .createSignedUploadUrl(path);
  if (signError) return apiError('UPLOAD_SIGN_FAILED', signError.message, 500);

  const { data: media, error } = await context.db
    .from('community_media')
    .insert({
      actor_key: context.user.actorKey,
      staging_path: path,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      status: 'staged'
    })
    .select('id')
    .single();
  if (error) return apiError('MEDIA_RECORD_FAILED', error.message, 500);

  return apiData({
    mediaId: media.id,
    path: signed.path,
    token: signed.token,
    signedUrl: signed.signedUrl
  }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}
