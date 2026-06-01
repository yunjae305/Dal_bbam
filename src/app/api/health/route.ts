import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'gyeongju-travel-next-mvp',
    stack: ['Next.js App Router', 'TypeScript', 'Route Handler', 'PWA']
  });
}
