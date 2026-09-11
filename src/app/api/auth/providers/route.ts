import { NextResponse } from 'next/server';
import { getAuthProviderCapabilities } from '@/backend/auth/providers';

export async function GET() {
  return NextResponse.json(await getAuthProviderCapabilities(), {
    headers: { 'Cache-Control': 'no-store' }
  });
}
