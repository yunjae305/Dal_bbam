import { NextRequest } from 'next/server';
import {
  apiData,
  apiError,
  checkRateLimit,
  getUserDataContext,
  isErrorContext,
  parseBody
} from '@/backend/http';
import { generateStructured } from '@/backend/openai';
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
  if (!await checkRateLimit(context, 'ai:community-story', 5)) {
    return apiError('RATE_LIMITED', '스토리 초안 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
  }

  const body = await parseBody<{ mediaId?: string; lang?: string; notes?: string }>(request);
  if (!body?.mediaId) return apiError('INVALID_MEDIA', 'mediaId가 필요합니다.');
  const lang = isLang(body.lang) ? body.lang : 'ko';

  const { data: media } = await context.db
    .from('community_media')
    .select('public_path')
    .eq('id', body.mediaId)
    .eq('actor_key', context.user.actorKey)
    .eq('status', 'approved')
    .maybeSingle();
  if (!media?.public_path) return apiError('MEDIA_NOT_APPROVED', '검사를 통과한 본인 사진이 필요합니다.', 422);

  try {
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
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: body.notes?.slice(0, 500) || 'Create an editable travel story draft.' },
          { type: 'input_image', image_url: String(media.public_path) }
        ]
      }]
    });
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
