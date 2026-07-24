import { NextRequest } from 'next/server';
import { apiData, apiError, getUserDataContext, isErrorContext } from '@/backend/http';

export async function GET(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  const { data, error } = await context.db
    .from('stamps')
    .select('id, acquired_at, places(id, content_id, name, category, image_url)')
    .eq('actor_key', context.user.actorKey)
    .order('acquired_at', { ascending: false });
  if (error) return apiError('STAMPS_READ_FAILED', error.message, 500);

  return apiData(data ?? [], {
    meta: { persisted: true },
    headers: { 'Cache-Control': 'private, no-store' }
  });
}
