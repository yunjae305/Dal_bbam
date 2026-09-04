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
import { mapFallbackShort, mapShortRow, shortRowSelect } from '@/backend/shorts';
import { validUuid } from '@/backend/stamps';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { isLang } from '@/shared/i18n';
import type { Lang } from '@/shared/types';

type ReactionBody = {
  shortId?: string;
  action?: 'like' | 'save';
  value?: boolean;
};

type Database = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const POSTGRES_FOREIGN_KEY_VIOLATION = '23503';

async function loadPublishedShorts(db: Database, lang: Lang) {
  const { data } = await db
    .from('shorts')
    .select(shortRowSelect)
    .eq('lang', lang)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function GET(request: NextRequest) {
  const langParam = request.nextUrl.searchParams.get('lang');
  const lang = isLang(langParam) ? langParam : 'ko';
  const tag = request.nextUrl.searchParams.get('tag')?.trim().toLowerCase();
  const db = createSupabaseAdminClient();
  const user = await getCurrentUser();

  if (db) {
    let rows = await loadPublishedShorts(db, lang);
    // A locale that has not been pre-generated yet should still show the real
    // catalogue (Korean) rather than the sample clips.
    if (!rows.length && lang !== 'ko') {
      rows = await loadPublishedShorts(db, 'ko');
    }

    if (rows.length) {
      const items = rows
        .map(row => mapShortRow(row as unknown as Record<string, unknown>, user?.actorKey))
        .filter(item => !tag || item.tags.some(itemTag => itemTag.toLowerCase() === tag));

      return apiData(items, {
        headers: user
          ? { 'Cache-Control': 'private, no-store' }
          // Anonymous and signed-in responses share a URL; the cookie decides which one applies.
          : { 'Cache-Control': 'public, s-maxage=120', Vary: 'Cookie' }
      });
    }
  }

  const fallback = await getTourMvpData(lang);
  const items = fallback.shorts
    .filter(clip => !tag || clip.tags.some(itemTag => itemTag.toLowerCase() === tag))
    .map(mapFallbackShort);
  return apiData(items, {
    // Sample clips have no database row, so like/save cannot be persisted.
    meta: { fallback: true, reactionsEnabled: false },
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300', Vary: 'Cookie' }
  });
}

export async function POST(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const body = await parseBody<ReactionBody>(request);
  if (!body?.shortId || !body.action || typeof body.value !== 'boolean') {
    return apiError('INVALID_REACTION', 'shortId, action, value가 필요합니다.');
  }
  if (!validUuid(body.shortId)) {
    return apiError('INVALID_SHORT', '올바른 쇼츠 ID가 아닙니다.');
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

  if (error) {
    if (error.code === POSTGRES_FOREIGN_KEY_VIOLATION) {
      return apiError('SHORT_NOT_FOUND', '쇼츠를 찾을 수 없습니다.', 404);
    }
    return apiError('REACTION_SAVE_FAILED', error.message, 500);
  }
  return apiData(data, { headers: { 'Cache-Control': 'private, no-store' } });
}
