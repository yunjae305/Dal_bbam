import { NextRequest } from 'next/server';
import { apiError, checkRateLimit, getUserDataContext, isErrorContext } from '@/backend/http';
import { createSpeech } from '@/backend/openai';
import { getOrCreateNarration } from '@/backend/narration';
import { isLang } from '@/shared/i18n';
import { isFeatureEnabled } from '@/backend/features';

type RouteContext = { params: Promise<{ contentId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  if (!isFeatureEnabled('ai')) return apiError('FEATURE_DISABLED', 'AI 음성 기능이 비활성화되어 있습니다.', 503);
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  if (!await checkRateLimit(context, 'ai:tts', 8)) {
    return apiError('RATE_LIMITED', '음성 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
  }

  const { contentId } = await params;
  const langParam = request.nextUrl.searchParams.get('lang');
  const lang = isLang(langParam) ? langParam : 'ko';

  try {
    const result = await getOrCreateNarration(contentId, lang, context.user.actorKey);
    const { data: cached } = result.rowId
      ? await context.db.from('ai_narrations').select('audio_path').eq('id', result.rowId).maybeSingle()
      : { data: null };
    if (cached?.audio_path) {
      const { data } = context.db.storage.from('narration-audio').getPublicUrl(String(cached.audio_path));
      return Response.redirect(data.publicUrl, 307);
    }

    const audio = await createSpeech(result.narration.narration);
    if (result.rowId) {
      const path = `${contentId}/${lang}/${result.rowId}.mp3`;
      const { error } = await context.db.storage
        .from('narration-audio')
        .upload(path, audio, { contentType: 'audio/mpeg', upsert: true });
      if (!error) {
        await context.db.from('ai_narrations').update({ audio_path: path }).eq('id', result.rowId);
      }
    }

    return new Response(audio, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'private, max-age=86400',
        'X-AI-Generated': 'true'
      }
    });
  } catch {
    return apiError('TTS_FAILED', '음성을 생성할 수 없습니다.', 502);
  }
}
