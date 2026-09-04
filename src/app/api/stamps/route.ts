import { NextRequest } from 'next/server';
import { apiData, apiError, getUserDataContext, isErrorContext } from '@/backend/http';
import { getStampCatalog, getStampRewards, StampDataError, stampMaxAccuracyMeters } from '@/backend/stamps';

export async function GET(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  try {
    const [{ data, error }, targets, rewards] = await Promise.all([
      context.db
        .from('stamps')
        .select('id, acquired_at, stamp_target_id, checkpoint_verified_at, places(id, content_id, name, category, image_url)')
        .eq('actor_key', context.user.actorKey)
        .order('acquired_at', { ascending: false }),
      getStampCatalog(context.db),
      getStampRewards(context.db, context.user.actorKey)
    ]);
    if (error) throw new StampDataError('STAMPS_READ_FAILED', error.message);

    return apiData(data ?? [], {
      meta: { persisted: true, targets, rewards, maxAccuracyMeters: stampMaxAccuracyMeters() },
      headers: { 'Cache-Control': 'private, no-store' }
    });
  } catch (error) {
    const code = error instanceof StampDataError ? error.code : 'STAMPS_READ_FAILED';
    console.error('[stamps] catalogue read failed', error instanceof Error ? error.message : error);
    return apiError(code, '스탬프 도감을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 503);
  }
}
