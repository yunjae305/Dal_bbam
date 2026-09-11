'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { SkeletonBox } from '@/frontend/components/common/feedback';
import { useLocale } from '@/frontend/i18n/locale-context';
import { communityCopy } from '@/shared/community';
import type { CommunityPost } from '@/shared/types';

export function VisitorStories() {
  const { locale } = useLocale();
  const copy = communityCopy[locale];
  const [stories, setStories] = useState<CommunityPost[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await fetch('/api/community/stories', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Stories unavailable');
        const payload = await response.json();
        if (!controller.signal.aborted) { setStories(payload.data); setFailed(false); }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [revision]);

  return <section className="border-b border-black/5 bg-[#fffdfa] py-4 text-[#172f58]" aria-label={copy.stories} aria-busy={loading}>
    <div className="flex items-center justify-between gap-2 px-5">
      <div><h2 className="text-sm font-black">{copy.stories}</h2><p className="mt-1 text-[10px] text-[#69717e]">{copy.storiesHint}</p></div>
      <button type="button" aria-label={copy.refresh} onClick={() => setRevision(value => value + 1)} disabled={loading} className="grid min-h-11 min-w-11 place-items-center rounded-full text-[#173e78] disabled:opacity-40"><RefreshCw size={16} className={loading ? 'animate-spin' : undefined} /></button>
    </div>
    {failed ? <p role="status" className="px-5 pt-3 text-xs text-[#8d5550]">{copy.storiesFailed}</p> : loading && !stories.length ?
      <div className="mt-3 flex gap-3 overflow-hidden px-5 pb-1" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => <SkeletonBox key={index} className="aspect-[3/4] w-36 shrink-0 rounded-2xl" />)}
      </div> : !stories.length ?
      <Link href="/community" className="mx-5 mt-3 flex min-h-11 items-center rounded-xl bg-[#f4f1ed] p-3 text-xs leading-5">{copy.storiesEmpty}</Link> :
      <div className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1">
        {stories.map(post => <Link key={post.id} href={`/community/${post.id}`} className="relative block aspect-[3/4] w-36 shrink-0 snap-start overflow-hidden rounded-2xl bg-[#173e78] text-white ring-1 ring-black/10">
          <img src={post.mediaUrls[0]} alt={post.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-3"><p className="text-[9px] font-bold">{post.placeName}</p><h3 className="mt-1 line-clamp-2 text-xs font-black">{post.title}</h3><p className="mt-1 line-clamp-2 text-[10px] leading-4">{post.content}</p><p className="mt-2 text-[9px] opacity-85">{post.authorName} · {new Date(post.createdAt).toLocaleDateString(locale)}</p></div>
        </Link>)}
      </div>}
  </section>;
}
