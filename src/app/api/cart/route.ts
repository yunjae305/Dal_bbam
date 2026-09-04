import { NextRequest } from 'next/server';
import {
  apiData,
  apiError,
  getUserDataContext,
  isErrorContext,
  isUuid,
  parseBody,
  resolvePlaceId
} from '@/backend/http';

type CartBody = { contentId?: string; placeId?: string };

export async function GET(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  const { data, error } = await context.db
    .from('cart_items')
    .select('id, created_at, places(id, content_id, category, name, description, address, lat, lng, image_url, tags)')
    .eq('actor_key', context.user.actorKey)
    .order('created_at', { ascending: false });

  if (error) return apiError('CART_READ_FAILED', error.message, 500);
  return apiData(data ?? [], { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  const body = await parseBody<CartBody>(request);
  const placeInput = body?.contentId ?? body?.placeId;
  if (!placeInput) return apiError('INVALID_PLACE', 'contentId가 필요합니다.');

  const placeId = await resolvePlaceId(context.db, placeInput);
  if (!placeId) return apiError('PLACE_NOT_FOUND', '관광지를 찾을 수 없습니다.', 404);

  const { data, error } = await context.db
    .from('cart_items')
    .upsert({
      actor_key: context.user.actorKey,
      user_id: context.user.supabaseUserId ?? null,
      place_id: placeId
    }, { onConflict: 'actor_key,place_id' })
    .select('id, created_at, places(id, content_id, category, name, description, address, lat, lng, image_url, tags)')
    .single();

  if (error) return apiError('CART_SAVE_FAILED', error.message, 500);
  return apiData(data, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function DELETE(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return apiError('INVALID_CART_ITEM', 'id가 필요합니다.');
  if (!isUuid(id)) return apiError('INVALID_CART_ITEM', 'id 형식이 올바르지 않습니다.');

  const { data, error } = await context.db
    .from('cart_items')
    .delete()
    .eq('id', id)
    .eq('actor_key', context.user.actorKey)
    .select('id')
    .maybeSingle();

  if (error) return apiError('CART_DELETE_FAILED', error.message, 500);
  if (!data) return apiError('CART_ITEM_NOT_FOUND', '장바구니 항목을 찾을 수 없습니다.', 404);
  return apiData({ deleted: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}
