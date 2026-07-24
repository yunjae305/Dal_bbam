import type { CommunityPost } from '@/shared/types';

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
  places?: { content_id?: string } | Array<{ content_id?: string }> | null;
  community_media?: Array<{ public_path?: string | null }> | null;
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

export const communitySelect = [
  'id',
  'actor_key',
  'author_name',
  'category',
  'title',
  'content',
  'rating',
  'created_at',
  'updated_at',
  'places(content_id)',
  'community_media(public_path)',
  'community_bookmarks(actor_key)'
].join(', ');
