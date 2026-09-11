import type { CommunityPost, PlaceCategory } from '@/shared/types';

type CommunityPlace = { content_id?: string; name?: string; address?: string; category?: PlaceCategory };

type CommunityRow = {
  id: string;
  actor_key?: string;
  category: CommunityPost['category'];
  title: string;
  content: string;
  rating: number | null;
  author_name: string;
  created_at: string;
  updated_at: string;
  places?: CommunityPlace | CommunityPlace[] | null;
  community_media?: Array<{ public_path?: string | null; status?: string }> | null;
  community_bookmarks?: Array<{ actor_key?: string }> | null;
};

export function mapCommunityPost(
  row: CommunityRow,
  actorKey?: string
): CommunityPost {
  const placeRelation = Array.isArray(row.places) ? row.places[0] : row.places;
  return {
    id: row.id,
    category: row.category,
    contentId: placeRelation?.content_id,
    placeName: placeRelation?.name,
    placeAddress: placeRelation?.address,
    placeCategory: placeRelation?.category,
    title: row.title,
    content: row.content,
    rating: row.rating ?? undefined,
    mediaUrls: (row.community_media ?? [])
      .map(media => media.public_path)
      .filter((path): path is string => Boolean(path)),
    authorName: row.author_name,
    isOwner: Boolean(actorKey && row.actor_key === actorKey),
    bookmarked: Boolean(actorKey && row.community_bookmarks?.some(item => item.actor_key === actorKey)),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Filters on embedded columns (`places.content_id`, `community_bookmarks.actor_key`)
 * only prune the embedded rows unless the embed is declared `!inner`; use the
 * inner variants when the filter must exclude parent posts.
 */
export function buildCommunitySelect(options: { placeInner?: boolean; bookmarkInner?: boolean; mediaInner?: boolean } = {}) {
  return [
    'id',
    'actor_key',
    'author_name',
    'category',
    'title',
    'content',
    'rating',
    'created_at',
    'updated_at',
    options.placeInner ? 'places!inner(content_id, name, address, category)' : 'places(content_id, name, address, category)',
    options.mediaInner ? 'community_media!inner(public_path, status)' : 'community_media(public_path)',
    options.bookmarkInner ? 'community_bookmarks!inner(actor_key)' : 'community_bookmarks(actor_key)'
  ].join(', ');
}

export const communitySelect = buildCommunitySelect();
