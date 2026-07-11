import Link from 'next/link';

export function SkeletonBox({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded-xl bg-black/10 ${className}`} aria-hidden="true" />;
}

export function AppLoadingSkeleton() {
  return (
    <main className="min-h-dvh bg-[#1f1f1f] text-[#1f252f]" aria-label="화면을 불러오는 중" aria-busy="true">
      <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-[#f5f1ea] px-5 pb-24 pt-12">
        <SkeletonBox className="h-44 w-full" />
        <div className="mt-5 grid grid-cols-4 gap-3">{Array.from({ length: 8 }, (_, index) => <SkeletonBox key={index} className="h-14" />)}</div>
        <SkeletonBox className="mt-8 h-5 w-28" />
        <div className="mt-4 grid grid-cols-3 gap-4">{Array.from({ length: 3 }, (_, index) => <SkeletonBox key={index} className="aspect-square" />)}</div>
      </div>
    </main>
  );
}

export function EmptyState({ title = '표시할 결과가 없어요', description = '다른 검색어나 필터를 선택해 주세요.', action }: { title?: string; description?: string; action?: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-[#d8d1c7] bg-white/80 px-6 py-10 text-center" role="status"><p className="text-[14px] font-black text-[#303642]">{title}</p><p className="mt-2 text-[11px] font-semibold leading-5 text-[#8f98a6]">{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

export function ErrorState({ title = '화면을 불러오지 못했어요', description = '잠시 후 다시 시도해 주세요.', onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return <div className="rounded-2xl bg-white px-6 py-10 text-center shadow-sm" role="alert"><p className="text-[16px] font-black text-[#303642]">{title}</p><p className="mt-2 text-[11px] font-semibold leading-5 text-[#8f98a6]">{description}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-5 rounded-full bg-[#ff5b4f] px-5 py-2.5 text-[11px] font-black text-white">다시 시도</button>}</div>;
}

export function NotFoundState() {
  return <main className="grid min-h-dvh place-items-center bg-[#eef3ee] px-5"><div className="w-full max-w-[390px] rounded-3xl bg-white px-7 py-12 text-center shadow-sm"><p className="text-[12px] font-black text-[#ff5b4f]">404</p><h1 className="mt-2 text-[22px] font-black text-[#202631]">페이지를 찾을 수 없어요</h1><p className="mt-3 text-[12px] font-semibold leading-5 text-[#8f98a6]">주소를 다시 확인하거나 홈으로 돌아가 주세요.</p><Link href="/" className="mt-6 inline-flex rounded-full bg-[#ff5b4f] px-6 py-3 text-[12px] font-black text-white">홈으로 이동</Link></div></main>;
}
