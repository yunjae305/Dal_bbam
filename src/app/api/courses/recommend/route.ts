import { NextRequest, NextResponse } from 'next/server';
import { recommendCourse } from '@/backend/recommend';
import type { RecommendationRequest } from '@/shared/types';

export async function POST(request: NextRequest) {
  let body: RecommendationRequest = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  return NextResponse.json({
    item: recommendCourse(body)
  });
}
