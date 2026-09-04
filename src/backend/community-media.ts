import { createSupabaseAdminClient } from '@/backend/supabase/admin';

type Database = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type CommunityMediaObject = {
  id: string;
  staging_path: string | null;
  public_storage_path: string | null;
};

export async function readPostMediaObjects(
  db: Database,
  postId: string,
  actorKey?: string
): Promise<{ media: CommunityMediaObject[]; error: string | null }> {
  let query = db
    .from('community_media')
    .select('id, staging_path, public_storage_path')
    .eq('post_id', postId);
  if (actorKey) query = query.eq('actor_key', actorKey);
  const { data, error } = await query;
  return {
    media: (data ?? []).map(item => ({
      id: String(item.id),
      staging_path: item.staging_path ? String(item.staging_path) : null,
      public_storage_path: item.public_storage_path ? String(item.public_storage_path) : null
    })),
    error: error?.message ?? null
  };
}

export async function removeCommunityMediaObjects(
  db: Database,
  media: CommunityMediaObject[]
): Promise<string | null> {
  const stagingPaths = media.flatMap(item => item.staging_path ? [item.staging_path] : []);
  const publicPaths = media.flatMap(item => item.public_storage_path ? [item.public_storage_path] : []);

  if (stagingPaths.length) {
    const { error } = await db.storage.from('community-staging').remove(stagingPaths);
    if (error) return error.message;
  }
  if (publicPaths.length) {
    const { error } = await db.storage.from('community-public').remove(publicPaths);
    if (error) return error.message;
  }
  return null;
}
