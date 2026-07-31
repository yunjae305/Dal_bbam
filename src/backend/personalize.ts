import type { PlaceCategory, PlaceSummary } from '@/shared/types';

export type PersonalizationSignals = {
  /** Content ids the user recently viewed, most recent first. */
  viewedContentIds: string[];
  /** Categories of the user's recent view events (duplicates keep their weight). */
  viewedCategories: PlaceCategory[];
  /** Categories of places currently in the user's cart. */
  cartCategories: PlaceCategory[];
};

export type PersonalizedPlace = {
  place: PlaceSummary;
  /** Category that drove this recommendation, null when it is a rating fallback. */
  reasonCategory: PlaceCategory | null;
};

const VIEW_WEIGHT = 1;
const CART_WEIGHT = 2;

export function buildCategoryAffinity(signals: PersonalizationSignals): Map<PlaceCategory, number> {
  const affinity = new Map<PlaceCategory, number>();
  for (const category of signals.viewedCategories) {
    affinity.set(category, (affinity.get(category) ?? 0) + VIEW_WEIGHT);
  }
  for (const category of signals.cartCategories) {
    affinity.set(category, (affinity.get(category) ?? 0) + CART_WEIGHT);
  }
  return affinity;
}

/**
 * Ranks candidate places for the signed-in home banner. Places the user has
 * already viewed are excluded so the banner always suggests something new.
 * Returns an empty list when the user has no signals yet — the caller should
 * fall back to the anonymous home layout in that case.
 */
export function rankPersonalizedPlaces(
  places: PlaceSummary[],
  signals: PersonalizationSignals,
  limit = 4
): PersonalizedPlace[] {
  const hasSignals =
    signals.viewedContentIds.length > 0 ||
    signals.viewedCategories.length > 0 ||
    signals.cartCategories.length > 0;
  if (!hasSignals) return [];

  const affinity = buildCategoryAffinity(signals);
  const viewed = new Set(signals.viewedContentIds);

  return places
    .filter(place => !viewed.has(place.contentId))
    .map(place => {
      const categoryScore = affinity.get(place.category) ?? 0;
      return {
        place,
        reasonCategory: categoryScore > 0 ? place.category : null,
        score: categoryScore * 10 + (place.rating ?? 0)
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit))
    .map(({ place, reasonCategory }) => ({ place, reasonCategory }));
}
