import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/backend/auth/current-user';
import { distanceMeters, isValidCoordinate } from '@/backend/geo';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { createSupabaseServerClient } from '@/backend/supabase/server';

const DEFAULT_STAMP_RADIUS_M = 150;
const STAMP_RADIUS_M = Number(process.env.STAMP_RADIUS_M ?? DEFAULT_STAMP_RADIUS_M);

type VerifyBody = {
  placeId?: string;
  lat?: number;
  lng?: number;
};

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function findSupabasePlace(placeId: string) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const query = supabase
    .from('places')
    .select('id, content_id, name, lat, lng')
    .limit(1);

  const { data, error } = validUuid(placeId)
    ? await query.eq('id', placeId)
    : await query.eq('content_id', placeId);

  if (error || !data?.[0]) {
    return null;
  }

  return data[0] as {
    id: string;
    content_id: string | null;
    name: string | null;
    lat: number | null;
    lng: number | null;
  };
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = await request.json() as VerifyBody;
  const placeId = body.placeId?.trim();
  const lat = Number(body.lat);
  const lng = Number(body.lng);

  if (!placeId) {
    return NextResponse.json({ error: 'placeId가 필요합니다.' }, { status: 400 });
  }

  if (!isValidCoordinate(lat, lng)) {
    return NextResponse.json({ error: '유효한 GPS 좌표가 필요합니다.' }, { status: 400 });
  }

  const supabasePlace = await findSupabasePlace(placeId);
  const appPlace = supabasePlace
    ? null
    : (await getTourMvpData()).places.find(place => place.id === placeId);
  const targetLat = supabasePlace?.lat ?? appPlace?.coordinates[0];
  const targetLng = supabasePlace?.lng ?? appPlace?.coordinates[1];

  if (!isValidCoordinate(Number(targetLat), Number(targetLng))) {
    return NextResponse.json({ error: '장소 좌표를 찾을 수 없습니다.' }, { status: 404 });
  }

  const distance = Math.round(distanceMeters({ lat, lng }, { lat: Number(targetLat), lng: Number(targetLng) }));
  const radius = Number.isFinite(STAMP_RADIUS_M) ? STAMP_RADIUS_M : DEFAULT_STAMP_RADIUS_M;
  const verified = distance <= radius;
  let persisted = false;

  if (verified && user.supabaseUserId && supabasePlace) {
    const supabase = await createSupabaseServerClient();
    const { error } = supabase
      ? await supabase.from('stamps').insert({
          user_id: user.supabaseUserId,
          place_id: supabasePlace.id,
          lat,
          lng
        })
      : { error: null };

    persisted = !error;
  }

  return NextResponse.json({
    verified,
    persisted,
    distanceMeters: distance,
    radiusMeters: radius,
    place: {
      id: supabasePlace?.content_id || supabasePlace?.id || appPlace?.id,
      name: supabasePlace?.name || appPlace?.name
    }
  }, {
    status: verified ? 200 : 422
  });
}
