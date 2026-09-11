import { NextRequest } from 'next/server';
import { apiError, checkRateLimit, getUserDataContext, isErrorContext, rateLimitError } from '@/backend/http';
import { createSpeech, isOpenAiAvailable, speechVoice } from '@/backend/openai';
import { getOrCreateNarration } from '@/backend/narration';
import { isLang } from '@/shared/i18n';

type RouteContext = { params: Promise<{ contentId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  const { contentId } = await params;
  const langParam = request.nextUrl.searchParams.get('lang');
  const lang = isLang(langParam) ? langParam : 'ko';

  try {
    let result = await getOrCreateNarration(contentId, lang, context.user.actorKey, { allowGeneration: false });
    const { data: cached } = result.rowId
      ? await context.db.from('ai_narrations').select('audio_path').eq('id', result.rowId).maybeSingle()
      : { data: null };
    if (cached?.audio_path) {
      const { data } = context.db.storage.from('narration-audio').getPublicUrl(String(cached.audio_path));
      return Response.redirect(data.publicUrl, 307);
    }

    // Prepared audio stays available when generation is disabled or the key is rotated.
    if (!isOpenAiAvailable()) {
      return apiError('TTS_UNAVAILABLE', '음성 생성 기능이 아직 설정되지 않았습니다.', 503);
    }
    const rateLimit = await checkRateLimit(context, 'ai:tts', 8);
    if (rateLimit !== 'ok') return rateLimitError(rateLimit, '음성 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    if (!result.rowId) result = await getOrCreateNarration(contentId, lang, context.user.actorKey);
    const audio = await createSpeech(result.narration.narration, speechVoice(lang));
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
        'Content-Language': lang,
        'Cache-Control': 'private, max-age=86400',
        // The voice is always synthesized, but the words may be the template fallback.
        'X-AI-Generated': result.narration.isAiGenerated ? 'true' : 'false'
      }
    });
  } catch {
    return apiError('TTS_FAILED', '음성을 생성할 수 없습니다.', 502);
  }
}
