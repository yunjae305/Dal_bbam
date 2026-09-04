import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_RADIUS_M = 150;
const DEFAULT_MAX_ACCURACY_M = 100;
const DEFAULT_VERIFY_RATE_LIMIT = 12;
const DEFAULT_ART_RATE_LIMIT = 4;
const DEFAULT_ART_COOLDOWN_SECONDS = 24 * 60 * 60;

export const GYEONGJU_BOUNDS = {
  minLat: 35.65,
  maxLat: 36.12,
  minLng: 128.95,
  maxLng: 129.58
} as const;

export type StampArtwork = {
  id: string;
  imageUrl: string;
  model: string;
  generatedAt: string | null;
};

export type StampArtworkStatus =
  | 'approved'
  | 'generating'
  | 'pending_review'
  | 'failed'
  | 'unavailable';

export type StampCatalogTarget = {
  id: string;
  checkpointRequired: boolean;
  radiusMeters: number;
  sortOrder: number;
  place: {
    id: string;
    contentId: string;
    name: string;
    category: string;
    imageUrl: string | null;
    lat: number;
    lng: number;
  };
  artwork: StampArtwork | null;
  artworkStatus: StampArtworkStatus;
};

export type StampReward = {
  id: string;
  code: string;
  title: string;
  description: string;
  threshold: number;
  rewardType: string;
  rewardValue: string | null;
  earnedAt?: string;
  redeemedAt?: string | null;
};

export class StampDataError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'StampDataError';
  }
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function stampRadiusMeters(targetRadius?: number | null): number {
  if (Number.isInteger(targetRadius) && Number(targetRadius) >= 25 && Number(targetRadius) <= 1000) {
    return Number(targetRadius);
  }
  return boundedInteger(process.env.STAMP_RADIUS_M, DEFAULT_RADIUS_M, 25, 1000);
}

export function stampMaxAccuracyMeters(): number {
  return boundedInteger(process.env.STAMP_MAX_ACCURACY_M, DEFAULT_MAX_ACCURACY_M, 10, 250);
}

export function stampVerifyRateLimit(): number {
  return boundedInteger(process.env.STAMP_VERIFY_RATE_LIMIT_PER_MINUTE, DEFAULT_VERIFY_RATE_LIMIT, 1, 120);
}

export function stampArtRateLimit(): number {
  return boundedInteger(process.env.STAMP_ART_GENERATION_LIMIT_PER_HOUR, DEFAULT_ART_RATE_LIMIT, 1, 30);
}

export function stampArtCooldownSeconds(): number {
  return boundedInteger(
    process.env.STAMP_ART_COOLDOWN_SECONDS,
    DEFAULT_ART_COOLDOWN_SECONDS,
    60,
    30 * 24 * 60 * 60
  );
}

export function checkpointRequiredForTarget(targetRequiresCheckpoint: boolean): boolean {
  return process.env.STAMP_REQUIRE_CHECKPOINT?.trim().toLowerCase() === 'true' || targetRequiresCheckpoint;
}

export function isInGyeongjuServiceArea(lat: number, lng: number): boolean {
  return lat >= GYEONGJU_BOUNDS.minLat &&
    lat <= GYEONGJU_BOUNDS.maxLat &&
    lng >= GYEONGJU_BOUNDS.minLng &&
    lng <= GYEONGJU_BOUNDS.maxLng;
}

export function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function hashCheckpointToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function issueCheckpointToken(): { token: string; tokenHash: string; tokenHint: string } {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashCheckpointToken(token),
    tokenHint: token.slice(0, 8)
  };
}

export function buildStampArtworkPrompt({
  placeName,
  category,
  description,
  artDirection
}: {
  placeName: string;
  category: string;
  description: string;
  artDirection?: string;
}): string {
  const direction = artDirection?.trim().slice(0, 500);
  return [
    'Create a square collectible tourism stamp illustration for the Dal Bbam Gyeongju travel service.',
    `Landmark: ${placeName.slice(0, 120)}.`,
    `Category: ${category.slice(0, 60)}.`,
    `Grounding description: ${description.slice(0, 800)}.`,
    'Style: refined Korean travel seal, tactile ink texture, moonlit navy and warm coral palette, iconic silhouette, centered composition, simple enough to remain legible at 96px.',
    'Do not include any words, letters, numbers, logos, signatures, watermarks, QR codes, people, or copyrighted characters.',
    'Use an opaque background and keep important details away from the circular crop edge.',
    direction ? `Additional administrator art direction: ${direction}` : ''
  ].filter(Boolean).join('\n');
}

function relationObject<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function artworkStatus(value: unknown): Exclude<StampArtworkStatus, 'approved'> {
  if (value === 'generating' || value === 'pending_review' || value === 'failed') return value;
  return 'unavailable';
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function getStampCatalog(db: SupabaseClient): Promise<StampCatalogTarget[]> {
  const { data: targetRows, error: targetError } = await db
    .from('stamp_targets')
    .select('id, checkpoint_required, radius_m, sort_order, places!inner(id, content_id, name, category, image_url, lat, lng)')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (targetError) {
    throw new StampDataError('STAMP_TARGETS_READ_FAILED', targetError.message);
  }

  const rows = targetRows ?? [];
  const targetIds = rows.map(row => String(row.id));
  const artworkByTarget = new Map<string, StampArtwork>();
  const latestArtworkStatusByTarget = new Map<string, unknown>();
  if (targetIds.length) {
    const artworkResults = await Promise.all(chunks(targetIds, 100).map(targetIdChunk => db
      .from('stamp_artworks')
      .select('id, stamp_target_id, status, public_url, model, generated_at, created_at')
      .in('stamp_target_id', targetIdChunk)
      .order('created_at', { ascending: false })));
    for (const result of artworkResults) {
      if (result.error) throw new StampDataError('STAMP_ARTWORKS_READ_FAILED', result.error.message);
      for (const artwork of result.data ?? []) {
        const targetId = String(artwork.stamp_target_id);
        if (!latestArtworkStatusByTarget.has(targetId)) {
          latestArtworkStatusByTarget.set(targetId, artwork.status);
        }
        if (artwork.status !== 'approved' || !artwork.public_url || artworkByTarget.has(targetId)) continue;
        artworkByTarget.set(targetId, {
          id: String(artwork.id),
          imageUrl: String(artwork.public_url),
          model: String(artwork.model),
          generatedAt: artwork.generated_at ? String(artwork.generated_at) : null
        });
      }
    }
  }

  return rows.flatMap(row => {
    const place = relationObject(row.places as unknown as Record<string, unknown> | Record<string, unknown>[] | null);
    const lat = Number(place?.lat);
    const lng = Number(place?.lng);
    const contentId = String(place?.content_id ?? place?.id ?? '');
    if (!place?.id || !contentId || !Number.isFinite(lat) || !Number.isFinite(lng) || !isInGyeongjuServiceArea(lat, lng)) {
      // One bad row must not take the whole catalogue down; skip it and flag it for operators.
      console.error(JSON.stringify({
        event: 'stamp_target_invalid',
        code: 'STAMP_TARGET_INVALID',
        targetId: String(row.id),
        message: `Invalid coordinates for stamp target ${String(row.id)}`
      }));
      return [];
    }
    const approvedArtwork = artworkByTarget.get(String(row.id)) ?? null;
    return [{
      id: String(row.id),
      checkpointRequired: checkpointRequiredForTarget(Boolean(row.checkpoint_required)),
      radiusMeters: stampRadiusMeters(row.radius_m === null ? null : Number(row.radius_m)),
      sortOrder: Number(row.sort_order ?? 0),
      place: {
        id: String(place.id),
        contentId,
        name: String(place.name ?? '경주 관광지'),
        category: String(place.category ?? 'attraction'),
        imageUrl: place.image_url ? String(place.image_url) : null,
        lat,
        lng
      },
      artwork: approvedArtwork,
      artworkStatus: approvedArtwork
        ? 'approved'
        : artworkStatus(latestArtworkStatusByTarget.get(String(row.id)))
    } satisfies StampCatalogTarget];
  });
}

function mapReward(row: Record<string, unknown>, earned?: Record<string, unknown>): StampReward {
  return {
    id: String(row.id),
    code: String(row.code),
    title: String(row.title),
    description: String(row.description),
    threshold: Number(row.stamp_threshold),
    rewardType: String(row.reward_type),
    rewardValue: earned && row.reward_value !== null && row.reward_value !== undefined
      ? String(row.reward_value)
      : null,
    earnedAt: earned?.earned_at ? String(earned.earned_at) : undefined,
    redeemedAt: earned?.redeemed_at ? String(earned.redeemed_at) : null
  };
}

export async function getStampRewards(
  db: SupabaseClient,
  actorKey: string
): Promise<{ earned: StampReward[]; available: StampReward[] }> {
  const [{ data: definitions, error: definitionsError }, { data: earnedRows, error: earnedError }] = await Promise.all([
    db.from('stamp_reward_definitions').select('*').eq('is_active', true).order('stamp_threshold'),
    db.from('user_stamp_rewards').select('reward_id, earned_at, redeemed_at').eq('actor_key', actorKey)
  ]);
  if (definitionsError) throw new StampDataError('STAMP_REWARDS_READ_FAILED', definitionsError.message);
  if (earnedError) throw new StampDataError('STAMP_REWARDS_READ_FAILED', earnedError.message);

  const earnedById = new Map((earnedRows ?? []).map(row => [String(row.reward_id), row as Record<string, unknown>]));
  const rewards = (definitions ?? []).map(row => mapReward(row as Record<string, unknown>, earnedById.get(String(row.id))));
  return {
    earned: rewards.filter(reward => reward.earnedAt),
    available: rewards.filter(reward => !reward.earnedAt)
  };
}

export async function awardStampRewards(db: SupabaseClient, actorKey: string): Promise<StampReward[]> {
  const { count, error: countError } = await db
    .from('stamps')
    .select('id', { count: 'exact', head: true })
    .eq('actor_key', actorKey);
  if (countError) throw new StampDataError('STAMP_REWARD_AWARD_FAILED', countError.message);
  if (!count) return [];

  const { data: definitions, error: definitionsError } = await db
    .from('stamp_reward_definitions')
    .select('*')
    .eq('is_active', true)
    .lte('stamp_threshold', count);
  if (definitionsError) throw new StampDataError('STAMP_REWARD_AWARD_FAILED', definitionsError.message);
  if (!definitions?.length) return [];

  const rewardIds = definitions.map(row => String(row.id));
  const { data: existing, error: existingError } = await db
    .from('user_stamp_rewards')
    .select('reward_id')
    .eq('actor_key', actorKey)
    .in('reward_id', rewardIds);
  if (existingError) throw new StampDataError('STAMP_REWARD_AWARD_FAILED', existingError.message);
  const existingIds = new Set((existing ?? []).map(row => String(row.reward_id)));
  const newDefinitions = definitions.filter(row => !existingIds.has(String(row.id)));
  if (!newDefinitions.length) return [];

  const earnedAt = new Date().toISOString();
  const { error: upsertError } = await db.from('user_stamp_rewards').upsert(
    newDefinitions.map(row => ({ actor_key: actorKey, reward_id: row.id, earned_at: earnedAt })),
    { onConflict: 'actor_key,reward_id', ignoreDuplicates: true }
  );
  if (upsertError) throw new StampDataError('STAMP_REWARD_AWARD_FAILED', upsertError.message);
  return newDefinitions.map(row => mapReward(row as Record<string, unknown>, { earned_at: earnedAt }));
}
