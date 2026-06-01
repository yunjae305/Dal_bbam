import { NextResponse } from 'next/server';
import { mvpData } from '@/backend/data';

export function GET() {
  return NextResponse.json({ items: mvpData.shorts });
}
