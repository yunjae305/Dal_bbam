'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/frontend/components/common/feedback';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[app/error]', error); }, [error]);
  return <main className="grid min-h-dvh place-items-center bg-[#eef3ee] px-5"><div className="w-full max-w-[390px]"><ErrorState onRetry={reset} /></div></main>;
}
