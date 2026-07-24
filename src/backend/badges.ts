import type { SupabaseClient } from '@supabase/supabase-js';
import type { Badge, Lang } from '@/shared/types';

type BadgeRow = {
  id: string;
  code: string;
  name_ko: string;
  name_en: string;
  name_ja: string;
  name_zh: string;
  description_ko: string;
  description_en: string;
  description_ja: string;
  description_zh: string;
  icon: string;
  stamp_threshold: number | null;
};

function mapBadge(row: BadgeRow, lang: Lang, earnedAt?: string): Badge {
  const suffix = lang === 'ko' ? 'ko' : lang === 'en' ? 'en' : lang === 'ja' ? 'ja' : 'zh';
  return {
    id: row.id,
    code: row.code,
    name: String(row[`name_${suffix}` as keyof BadgeRow]),
    description: String(row[`description_${suffix}` as keyof BadgeRow]),
    icon: row.icon,
    earnedAt
  };
}

export async function awardStampBadges(
  db: SupabaseClient,
  actorKey: string,
  lang: Lang = 'ko'
): Promise<Badge[]> {
  const { count } = await db
    .from('stamps')
    .select('id', { count: 'exact', head: true })
    .eq('actor_key', actorKey);
  if (!count) return [];

  const { data: definitions } = await db
    .from('badge_definitions')
    .select('*')
    .not('stamp_threshold', 'is', null)
    .lte('stamp_threshold', count);
  if (!definitions?.length) return [];

  const badgeIds = definitions.map(item => String(item.id));
  const { data: existing } = await db
    .from('user_badges')
    .select('badge_id')
    .eq('actor_key', actorKey)
    .in('badge_id', badgeIds);
  const existingIds = new Set((existing ?? []).map(item => String(item.badge_id)));
  const newDefinitions = definitions.filter(item => !existingIds.has(String(item.id)));
  if (!newDefinitions.length) return [];

  const earnedAt = new Date().toISOString();
  const { error } = await db.from('user_badges').upsert(
    newDefinitions.map(item => ({
      actor_key: actorKey,
      badge_id: item.id,
      earned_at: earnedAt
    })),
    { onConflict: 'actor_key,badge_id', ignoreDuplicates: true }
  );
  if (error) return [];
  return newDefinitions.map(item => mapBadge(item as BadgeRow, lang, earnedAt));
}

export async function getBadges(
  db: SupabaseClient,
  actorKey: string,
  lang: Lang
): Promise<{ earned: Badge[]; available: Badge[] }> {
  const [{ data: definitions }, { data: earnedRows }] = await Promise.all([
    db.from('badge_definitions').select('*').order('stamp_threshold', { ascending: true }),
    db.from('user_badges').select('badge_id, earned_at').eq('actor_key', actorKey)
  ]);
  const earnedById = new Map((earnedRows ?? []).map(row => [String(row.badge_id), String(row.earned_at)]));
  const badges = (definitions ?? []).map(row =>
    mapBadge(row as BadgeRow, lang, earnedById.get(String(row.id)))
  );
  return {
    earned: badges.filter(badge => badge.earnedAt),
    available: badges.filter(badge => !badge.earnedAt)
  };
}
