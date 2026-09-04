import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/backend/auth/current-user';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import { createSupabaseServerClient } from '@/backend/supabase/server';
import { getAuthCookieOptions, SESSION_COOKIE } from '@/backend/auth/session';
import { apiError, isMutationAllowed, parseBody } from '@/backend/http';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError('UNAUTHENTICATED', '로그인이 필요합니다.', 401);

  return NextResponse.json({
    data: {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      provider: user.provider
    }
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function DELETE(request: NextRequest) {
  if (!isMutationAllowed(request)) {
    return apiError('ORIGIN_REJECTED', '허용되지 않은 요청 출처입니다.', 403);
  }

  const body = await parseBody<{ confirmation?: string }>(request);
  if (body?.confirmation !== 'DELETE') {
    return apiError('CONFIRMATION_REQUIRED', '계정 삭제 확인 문구가 올바르지 않습니다.', 400);
  }

  const user = await getCurrentUser();
  if (!user) return apiError('UNAUTHENTICATED', '로그인이 필요합니다.', 401);
  if (user.provider === 'demo') {
    return apiError('DEMO_ACCOUNT', '데모 계정은 삭제할 수 없습니다.', 403);
  }

  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '데이터베이스에 연결할 수 없습니다.', 503);

  const { data: media, error: mediaReadError } = await db
    .from('community_media')
    .select('staging_path, public_storage_path')
    .eq('actor_key', user.actorKey);
  if (mediaReadError) {
    console.error('[account-delete] media lookup failed', mediaReadError.message);
    return apiError('ACCOUNT_MEDIA_READ_FAILED', '계정 파일을 확인하지 못했습니다.', 500);
  }
  const stagingPaths = (media ?? []).map(item => item.staging_path).filter(Boolean) as string[];
  const publicPaths = (media ?? []).map(item => item.public_storage_path).filter(Boolean) as string[];

  // Database rows are the authoritative record: delete them first so a storage
  // hiccup can never leave the account (and its posts) alive after the user
  // was told it was gone. Orphaned objects are logged for the cleanup job.
  const { error: deleteDataError } = await db.rpc('delete_actor_data', {
    p_actor_key: user.actorKey
  });
  if (deleteDataError) {
    console.error('[account-delete] actor data deletion failed', deleteDataError.message);
    return apiError('ACCOUNT_DELETE_FAILED', '계정 데이터를 삭제하지 못했습니다.', 500);
  }

  if (stagingPaths.length) {
    const { error } = await db.storage.from('community-staging').remove(stagingPaths);
    if (error) console.error('[account-delete] staging media cleanup failed', { actorKey: user.actorKey, error: error.message });
  }
  if (publicPaths.length) {
    const { error } = await db.storage.from('community-public').remove(publicPaths);
    if (error) console.error('[account-delete] public media cleanup failed', { actorKey: user.actorKey, error: error.message });
  }

  if (user.provider === 'kakao') {
    const { error } = await db.from('social_users').delete().eq('id', user.id);
    if (error) {
      console.error('[account-delete] social identity deletion failed', error.message);
      return apiError('AUTH_ACCOUNT_DELETE_FAILED', '로그인 계정을 삭제하지 못했습니다.', 500);
    }
  } else if (user.supabaseUserId) {
    const { error } = await db.auth.admin.deleteUser(user.supabaseUserId);
    if (error) {
      console.error('[account-delete] auth identity deletion failed', error.message);
      return apiError('AUTH_ACCOUNT_DELETE_FAILED', '로그인 계정을 삭제하지 못했습니다.', 500);
    }
  }

  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, '', {
    ...getAuthCookieOptions(),
    maxAge: 0
  });
  return response;
}
