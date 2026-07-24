import { NextRequest } from 'next/server';
import {
  apiData,
  apiError,
  getUserDataContext,
  isErrorContext,
  parseBody
} from '@/backend/http';
import { generateStructured, moderateContent } from '@/backend/openai';

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

function detectedMime(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) return 'image/webp';
  return null;
}

const privacySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['containsPersonalInformation'],
  properties: {
    containsPersonalInformation: { type: 'boolean' }
  }
};

export async function POST(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const body = await parseBody<{ mediaId?: string }>(request);
  if (!body?.mediaId) return apiError('INVALID_MEDIA', 'mediaId가 필요합니다.');

  const { data: media } = await context.db
    .from('community_media')
    .select('id, staging_path, mime_type, size_bytes, status')
    .eq('id', body.mediaId)
    .eq('actor_key', context.user.actorKey)
    .maybeSingle();
  if (!media || media.status !== 'staged') {
    return apiError('MEDIA_NOT_FOUND', '검사할 staging 이미지를 찾을 수 없습니다.', 404);
  }

  const { data: file, error: downloadError } = await context.db.storage
    .from('community-staging')
    .download(String(media.staging_path));
  if (downloadError || !file) return apiError('UPLOAD_NOT_FOUND', '업로드된 파일을 찾을 수 없습니다.', 404);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = detectedMime(bytes);
  if (!mimeType || mimeType !== media.mime_type || bytes.byteLength > MAX_SIZE_BYTES || bytes.byteLength !== Number(media.size_bytes)) {
    await context.db.from('community_media').update({ status: 'rejected' }).eq('id', media.id);
    return apiError('FILE_VALIDATION_FAILED', '파일 형식 또는 크기 검사를 통과하지 못했습니다.', 422);
  }

  const { data: signed } = await context.db.storage
    .from('community-staging')
    .createSignedUrl(String(media.staging_path), 600);
  if (!signed?.signedUrl) return apiError('MEDIA_SCAN_FAILED', '이미지 검사를 준비할 수 없습니다.', 503);

  try {
    const [moderation, privacy] = await Promise.all([
      moderateContent({ text: 'User submitted travel photo', imageUrl: signed.signedUrl }),
      generateStructured<{ containsPersonalInformation: boolean }>({
        name: 'image_privacy_check',
        schema: privacySchema,
        actorKey: context.user.actorKey,
        instructions: 'Inspect the image only for visibly readable email addresses or phone numbers. Return true if either is visible. Do not identify people.',
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: 'Check this image for visible email addresses or phone numbers.' },
            { type: 'input_image', image_url: signed.signedUrl }
          ]
        }]
      })
    ]);

    if (!moderation.allowed || privacy.value.containsPersonalInformation) {
      await context.db.from('community_media').update({
        status: 'rejected',
        moderation: {
          categories: moderation.categories,
          personalInformation: privacy.value.containsPersonalInformation
        }
      }).eq('id', media.id);
      return apiError('MODERATION_REJECTED', '이미지 안전 또는 개인정보 검사를 통과하지 못했습니다.', 422);
    }

    const publicPath = `images/${media.id}.${mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1]}`;
    const { error: publishError } = await context.db.storage
      .from('community-public')
      .upload(publicPath, bytes, { contentType: mimeType, upsert: false });
    if (publishError) return apiError('MEDIA_PUBLISH_FAILED', publishError.message, 500);
    await context.db.storage.from('community-staging').remove([String(media.staging_path)]);

    const { data: publicUrl } = context.db.storage.from('community-public').getPublicUrl(publicPath);
    await context.db.from('community_media').update({
      status: 'approved',
      public_path: publicUrl.publicUrl,
      moderation: { categories: moderation.categories, personalInformation: false }
    }).eq('id', media.id).eq('actor_key', context.user.actorKey);

    return apiData({
      mediaId: media.id,
      status: 'approved',
      url: publicUrl.publicUrl
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return apiError('MODERATION_UNAVAILABLE', '이미지 검사를 완료할 수 없어 공개하지 않았습니다.', 503);
  }
}
