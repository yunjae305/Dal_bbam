import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/backend/auth/current-user';
import {
  apiData,
  apiError,
  getUserDataContext,
  isErrorContext,
  parseBody
} from '@/backend/http';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { isLang } from '@/shared/i18n';
import type { ShortItem } from '@/shared/types';

type ReactionBody = {
  shortId?: string;
  action?: 'like' | 'save';
  value?: boolean;
};

export async function GET(request: NextRequest) {
  const langParam = request.nextUrl.searchParams.get('lang');
  const lang = isLang(langParam) ? langParam : 'ko';
  const tag = request.nextUrl.searchParams.get('tag')?.trim().toLowerCase();
  const db = createSupabaseAdminClient();
  const user = await getCurrentUser();

  if (db) {
    const { data } = await db
      .from('shorts')
      .select('id, title, summary, narration, image_url, audio_url, duration_seconds, tags, place_id, places(content_id), short_interactions(actor_key, liked, saved)')
      .eq('lang', lang)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data?.length) {
      const items: ShortItem[] = data.map(row => {
        const interactions = (row.short_interactions as unknown as Array<{
          actor_key: string;
          liked: boolean;
          saved: boolean;
        }> | null) ?? [];
        const mine = interactions.find(item => item.actor_key === user?.actorKey);
        const place = row.places as unknown as { content_id?: string } | null;
        return {
          id: String(row.id),
          contentId: place?.content_id ?? String(row.place_id),
          title: String(row.title),
          summary: String(row.summary),
          narration: String(row.narration),
          imageUrl: String(row.image_url || '/login-spring-bg.png'),
          audioUrl: row.audio_url ? String(row.audio_url) : undefined,
          durationSeconds: Number(row.duration_seconds ?? 60),
          tags: (row.tags as string[] | null) ?? [],
          liked: Boolean(mine?.liked),
          saved: Boolean(mine?.saved),
          likeCount: interactions.filter(item => item.liked).length,
          isAiGenerated: true
        };
      }).filter(item => !tag || item.tags.some(itemTag => itemTag.toLowerCase() === tag));

      return apiData(items, {
        headers: { 'Cache-Control': user ? 'private, no-store' : 'public, s-maxage=120' }
      });
    }
  }

  const fallback = await getTourMvpData(lang);
  const items: ShortItem[] = fallback.shorts
    .filter(clip => !tag || clip.tags.some(itemTag => itemTag.toLowerCase() === tag))
    .map(clip => ({
      id: clip.id,
      contentId: clip.placeId,
      title: clip.title,
      summary: clip.caption,
      narration: clip.caption,
      imageUrl: clip.image,
      durationSeconds: Number(clip.duration.split(':')[0]) * 60 + Number(clip.duration.split(':')[1]),
      tags: clip.tags,
      liked: false,
      saved: false,
      likeCount: 0,
      isAiGenerated: false
    }));
  return apiData(items, {
    meta: { fallback: true },
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
  });
}

export async function POST(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const body = await parseBody<ReactionBody>(request);
  if (!body?.shortId || !body.action || typeof body.value !== 'boolean') {
    return apiError('INVALID_REACTION', 'shortId, action, value가 필요합니다.');
  }

  const { data: existing } = await context.db
    .from('short_interactions')
    .select('liked, saved')
    .eq('actor_key', context.user.actorKey)
    .eq('short_id', body.shortId)
    .maybeSingle();
  const liked = body.action === 'like' ? body.value : Boolean(existing?.liked);
  const saved = body.action === 'save' ? body.value : Boolean(existing?.saved);

  const { data, error } = await context.db
    .from('short_interactions')
    .upsert({
      actor_key: context.user.actorKey,
      short_id: body.shortId,
      liked,
      saved,
      updated_at: new Date().toISOString()
    }, { onConflict: 'actor_key,short_id' })
    .select('liked, saved')
    .single();

  if (error) return apiError('REACTION_SAVE_FAILED', error.message, 500);
  return apiData(data, { headers: { 'Cache-Control': 'private, no-store' } });
}
