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

async function loadPublishedShorts(db: Database, lang: Lang, tag: string, offset: number, limit: number) {
  const { data: tagRows } = await db.from('shorts').select('tags')
    .eq('lang', lang).eq('is_published', true).limit(1000);
  const tags = [...new Set((tagRows ?? []).flatMap(row =>
    Array.isArray(row.tags) ? row.tags.filter((value): value is string => typeof value === 'string') : []
  ))].sort((left, right) => left.localeCompare(right, lang));
  const matches = tags.filter(value => value.toLowerCase() === tag);
  if (tag && !matches.length) return { rows: [], tags, exists: Boolean(tagRows?.length) };
  let query = db
    .from('shorts').select(shortRowSelect)
    .eq('lang', lang).eq('is_published', true);
  if (tag) query = query.overlaps('tags', matches);
  const { data } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit);
  return { rows: data ?? [], tags, exists: Boolean(tagRows?.length || data?.length) };
}

export async function GET(request: NextRequest) {
  const langParam = request.nextUrl.searchParams.get('lang');
  const lang = isLang(langParam) ? langParam : 'ko';
  const tag = request.nextUrl.searchParams.get('tag')?.trim().toLowerCase() ?? '';
  const offset = Number(request.nextUrl.searchParams.get('offset') ?? 0);
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? 50);
  const focus = request.nextUrl.searchParams.get('focus') ?? '';
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000 ||
      !Number.isInteger(limit) || limit < 1 || limit > 50 || tag.length > 60 ||
      (focus && !/^[a-zA-Z0-9_-]{1,128}$/.test(focus))) {
    return apiError('INVALID_FEED_QUERY', '올바른 피드 범위를 입력해 주세요.');
  }
  const db = createSupabaseAdminClient();
  const user = await getCurrentUser();

  if (db) {
    let catalogue = await loadPublishedShorts(db, lang, tag, offset, limit);
    let contentLanguage = lang;
    // A locale that has not been pre-generated yet should still show the real
    // catalogue (Korean) rather than the sample clips.
    if (!catalogue.exists && lang !== 'ko') {
      catalogue = await loadPublishedShorts(db, 'ko', tag, offset, limit);
      contentLanguage = 'ko';
    }

    if (catalogue.exists) {
      const items = catalogue.rows.slice(0, limit)
        .map(row => mapShortRow(row as unknown as Record<string, unknown>, user?.actorKey));
      // A shared story can be outside the first page. Include it without changing
      // the ordinary page boundary; subsequent pages are deduplicated by the UI.
      if (focus && !tag && offset === 0 && validUuid(focus) && !items.some(item => item.id === focus)) {
        const { data: focused } = await db.from('shorts').select(shortRowSelect)
          .eq('id', focus).eq('is_published', true).maybeSingle();
        if (focused) items.unshift(mapShortRow(focused as unknown as Record<string, unknown>, user?.actorKey));
      }

      return apiData(items, {
        meta: {
          tags: catalogue.tags,
          nextOffset: catalogue.rows.length > limit ? offset + limit : null,
          contentLanguage,
          reactionsEnabled: true
        },
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
  const pageItems = items.slice(offset, offset + limit);
  const focused = !tag && offset === 0 ? items.find(item => item.id === focus) : undefined;
  if (focused && !pageItems.some(item => item.id === focused.id)) pageItems.unshift(focused);
  return apiData(pageItems, {
    // Sample clips have no database row, so like/save cannot be persisted.
    meta: {
      fallback: true,
      reactionsEnabled: false,
      tags: [...new Set(fallback.shorts.flatMap(clip => clip.tags))],
      nextOffset: items.length > offset + limit ? offset + limit : null,
      contentLanguage: lang
    },
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300', Vary: 'Cookie' }
  });
}

export async function POST(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const body = await parseBody<ReactionBody>(request);
  if (typeof body?.shortId !== 'string' || (body.action !== 'like' && body.action !== 'save') || typeof body.value !== 'boolean') {
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
