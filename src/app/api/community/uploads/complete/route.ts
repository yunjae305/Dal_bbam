import { NextRequest } from 'next/server';
import {
  apiData,
  apiError,
  checkRateLimit,
  getUserDataContext,
  isErrorContext,
  isUuid,
  parseBody,
  rateLimitError
} from '@/backend/http';
import { generateStructured, isOpenAiAvailable, moderateContent } from '@/backend/openai';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

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
  if (!body || !isUuid(body.mediaId)) return apiError('INVALID_MEDIA', 'mediaId가 필요합니다.');

  const rateLimit = await checkRateLimit(context, 'community-upload-complete', 10);
  if (rateLimit !== 'ok') return rateLimitError(rateLimit, '이미지 검사 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');

  const { data: media, error: mediaError } = await context.db
    .from('community_media')
    .select('id, staging_path, mime_type, size_bytes, status, public_path, moderation')
    .eq('id', body.mediaId)
    .eq('actor_key', context.user.actorKey)
    .maybeSingle();
  if (mediaError) return apiError('MEDIA_READ_FAILED', '업로드 정보를 확인하지 못했습니다.', 500);
  if (!media) return apiError('MEDIA_NOT_FOUND', '검사할 staging 이미지를 찾을 수 없습니다.', 404);
  // Idempotent re-submission: an already-processed upload reports its final state.
  if (media.status === 'approved') {
    return apiData({
      mediaId: media.id,
      status: 'approved',
      privacyCheck: media.moderation?.privacyCheck ?? 'unknown',
      url: media.public_path ? String(media.public_path) : null
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  if (media.status === 'rejected') {
    return apiError('MEDIA_REJECTED', '이미 검사에서 거부된 이미지입니다. 다른 사진을 업로드해 주세요.', 422);
  }
  if (media.status !== 'staged') {
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
    await context.db.storage.from('community-staging').remove([String(media.staging_path)]);
    return apiError('FILE_VALIDATION_FAILED', '파일 형식 또는 크기 검사를 통과하지 못했습니다.', 422);
  }

  const { data: signed } = await context.db.storage
    .from('community-staging')
    .createSignedUrl(String(media.staging_path), 600);
  if (!signed?.signedUrl) return apiError('MEDIA_SCAN_FAILED', '이미지 검사를 준비할 수 없습니다.', 503);

  try {
    // Without OpenAI the image cannot be inspected; it already passed the type/size checks.
    const scanned = isOpenAiAvailable();
    const [moderation, privacy] = scanned ? await Promise.all([
      moderateContent({ text: 'User submitted travel photo', imageUrl: signed.signedUrl }),
      generateStructured<{ containsPersonalInformation: boolean }>({
        name: 'image_privacy_check',
        schema: privacySchema,
        actorKey: context.user.actorKey,
        instructions: 'Inspect only for visibly readable personal information: email, phone number, precise home address, government ID/passport, vehicle plate, ticket or QR/barcode containing personal data. Return true if any is visible. Do not identify people and do not infer hidden information.',
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: 'Check this image for visible email addresses or phone numbers.' },
            { type: 'input_image', image_url: signed.signedUrl }
          ]
        }]
      })
    ]) : [
      { allowed: true, flagged: false, categories: {}, provider: 'local' as const },
      { value: { containsPersonalInformation: false } }
    ];

    if (scanned && typeof privacy.value?.containsPersonalInformation !== 'boolean') throw new Error('Invalid image privacy result.');
    if (!moderation.allowed || privacy.value.containsPersonalInformation) {
      await context.db.from('community_media').update({
        status: 'rejected',
        moderation: {
          categories: moderation.categories,
          personalInformation: privacy.value.containsPersonalInformation
        }
      }).eq('id', media.id);
      await context.db.storage.from('community-staging').remove([String(media.staging_path)]);
      return apiError('MODERATION_REJECTED', '이미지 안전 또는 개인정보 검사를 통과하지 못했습니다.', 422);
    }

    const pipeline = sharp(bytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true });
    const transformed = mimeType === 'image/png'
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
      : mimeType === 'image/webp'
        ? await pipeline.webp({ quality: 85 }).toBuffer({ resolveWithObject: true })
        : await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    const outputBytes = transformed.data;
    const outputMime = mimeType;
    const extension = outputMime === 'image/jpeg' ? 'jpg' : outputMime.split('/')[1];
    const publicPath = `images/${media.id}.${extension}`;
    const { error: publishError } = await context.db.storage
      .from('community-public')
      .upload(publicPath, outputBytes, { contentType: outputMime, upsert: true });
    if (publishError) return apiError('MEDIA_PUBLISH_FAILED', publishError.message, 500);

    const { data: publicUrl } = context.db.storage.from('community-public').getPublicUrl(publicPath);
    const { error: trackingError } = await context.db.from('community_media').update({
      public_path: publicUrl.publicUrl,
      public_storage_path: publicPath
    }).eq('id', media.id).eq('actor_key', context.user.actorKey).eq('status', 'staged');
    if (trackingError) {
      await context.db.storage.from('community-public').remove([publicPath]);
      return apiError('MEDIA_RECORD_UPDATE_FAILED', '공개 파일 경로를 저장하지 못했습니다.', 500);
    }

    const { error: stagingDeleteError } = await context.db.storage
      .from('community-staging')
      .remove([String(media.staging_path)]);
    if (stagingDeleteError) {
      console.error('[community-upload] staging cleanup failed', stagingDeleteError.message);
      const { error: rollbackError } = await context.db.storage.from('community-public').remove([publicPath]);
      if (!rollbackError) {
        await context.db.from('community_media').update({
          public_path: null,
          public_storage_path: null
        }).eq('id', media.id).eq('actor_key', context.user.actorKey);
      }
      return apiError('MEDIA_STAGING_CLEANUP_FAILED', '원본 업로드 파일을 정리하지 못했습니다.', 500);
    }

    const { error: updateError } = await context.db.from('community_media').update({
      status: 'approved',
      processed_sha256: createHash('sha256').update(outputBytes).digest('hex'),
      width: transformed.info.width,
      height: transformed.info.height,
      size_bytes: outputBytes.byteLength,
      moderation: { categories: moderation.categories, personalInformation: scanned ? false : null, privacyCheck: scanned ? 'completed' : 'unavailable' }
    }).eq('id', media.id).eq('actor_key', context.user.actorKey);
    if (updateError) {
      await context.db.storage.from('community-public').remove([publicPath]);
      return apiError('MEDIA_RECORD_UPDATE_FAILED', '검사 결과를 저장하지 못했습니다.', 500);
    }

    return apiData({
      mediaId: media.id,
      status: 'approved',
      privacyCheck: scanned ? 'completed' : 'unavailable',
      url: publicUrl.publicUrl
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[community-upload] processing failed', error instanceof Error ? error.message : 'unknown');
    return apiError('MODERATION_UNAVAILABLE', '이미지 검사를 완료할 수 없어 공개하지 않았습니다.', 503);
  }
}
