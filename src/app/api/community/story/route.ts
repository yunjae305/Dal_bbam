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
import { generateStructured, moderateContent } from '@/backend/ai';
import { isLang } from '@/shared/i18n';
import { isFeatureEnabled } from '@/backend/features';

type StoryDraft = { title: string; content: string; tags: string[] };

const storySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'content', 'tags'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 100 },
    content: { type: 'string', minLength: 1, maxLength: 1500 },
    tags: {
      type: 'array',
      minItems: 0,
      maxItems: 6,
      items: { type: 'string', minLength: 1, maxLength: 30 }
    }
  }
};

export async function POST(request: NextRequest) {
  if (!isFeatureEnabled('ai') || !isFeatureEnabled('community')) {
    return apiError('FEATURE_DISABLED', 'AI 커뮤니티 기능이 비활성화되어 있습니다.', 503);
  }
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  const body = await parseBody<{ mediaId?: string; lang?: string; notes?: string }>(request);
  if (!body || !isUuid(body.mediaId)) return apiError('INVALID_MEDIA', 'mediaId가 필요합니다.');
  if (body.notes !== undefined && typeof body.notes !== 'string') {
    return apiError('INVALID_MEDIA', 'notes 형식이 올바르지 않습니다.');
  }
  const lang = isLang(body.lang) ? body.lang : 'ko';

  const rateLimit = await checkRateLimit(context, 'ai:community-story', 5);
  if (rateLimit !== 'ok') return rateLimitError(rateLimit, '스토리 초안 요청이 많습니다. 잠시 후 다시 시도해 주세요.');

  const { data: media } = await context.db
    .from('community_media')
    .select('public_path')
    .eq('id', body.mediaId)
    .eq('actor_key', context.user.actorKey)
    .eq('status', 'approved')
    .maybeSingle();
  if (!media?.public_path) return apiError('MEDIA_NOT_APPROVED', '검사를 통과한 본인 사진이 필요합니다.', 422);

  try {
    const notesCheck = await moderateContent({ text: body.notes ?? '' });
    if (!notesCheck.allowed) return apiError('MODERATION_REJECTED', '스토리 메모에서 개인정보 또는 부적절한 내용이 발견되었습니다.', 422);
    const result = await generateStructured<StoryDraft>({
      name: 'community_story_draft',
      schema: storySchema,
      actorKey: context.user.actorKey,
      instructions: [
        `Write in ${lang}.`,
        'Create a short first-person travel story draft based only on visible, non-sensitive details.',
        'Do not identify people, infer identity, or invent the exact location.',
        'Clearly word uncertain visual details as impressions.'
      ].join(' '),
      input: body.notes?.slice(0, 500) || 'Create an editable travel story draft.',
      imageUrl: String(media.public_path)
    });
    const draft = result.value;
    if (!draft || typeof draft.title !== 'string' || typeof draft.content !== 'string' || !Array.isArray(draft.tags) || draft.tags.some(tag => typeof tag !== 'string')) {
      throw new Error('Invalid story draft.');
    }
    const draftCheck = await moderateContent({ text: `${draft.title}\n${draft.content}\n${draft.tags.join(' ')}` });
    if (!draftCheck.allowed) return apiError('MODERATION_REJECTED', '생성된 초안이 안전 검사를 통과하지 못했습니다.', 422);
    return apiData({
      ...result.value,
      mediaId: body.mediaId,
      status: 'draft',
      requiresExplicitPublish: true
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return apiError('STORY_GENERATION_FAILED', '사진 스토리 초안을 만들 수 없습니다.', 502);
  }
}
