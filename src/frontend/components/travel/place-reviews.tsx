'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LoaderCircle, Pencil, Star } from 'lucide-react';
import { CommunityPostEditor } from '@/frontend/components/travel/community-post-editor';
import { useLocale } from '@/frontend/i18n/locale-context';
import { communityCopy } from '@/shared/community';
import type { CommunityPost, PlaceSummary } from '@/shared/types';

export function PlaceReviews({ place }: { place: Pick<PlaceSummary, 'contentId' | 'name' | 'category'> }) {
  const { locale } = useLocale();
  const copy = communityCopy[locale];
  const [reviews, setReviews] = useState<CommunityPost[]>([]);
  const [writing, setWriting] = useState(false);
  const [settledPlace, setSettledPlace] = useState('');
  const loading = settledPlace !== place.contentId;
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/community?contentId=${encodeURIComponent(place.contentId)}`, { cache: 'no-store', signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Reviews unavailable'); return response.json(); })
      .then(payload => { if (!controller.signal.aborted) { setReviews((payload.data as CommunityPost[]).filter(post => post.category !== 'tip')); setFailed(false); } })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setSettledPlace(place.contentId); });
    return () => controller.abort();
  }, [place.contentId, revision]);

  const ratings = reviews.flatMap(post => post.rating ? [post.rating] : []);
  const average = ratings.length ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1) : '';

  return <section className="rounded-2xl bg-white p-5 shadow-sm" aria-labelledby="place-reviews-title">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="place-reviews-title" className="text-sm font-black">{copy.reviews}</h2><button type="button" onClick={() => setWriting(true)} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-[#fff0ed] px-4 text-[11px] font-bold text-[#b63a43]"><Pencil size={14} />{copy.writeReview}</button></div>
    {loading ? <LoaderCircle className="mt-3 animate-spin" aria-label={copy.reviews} size={18} /> : failed ?
      <div role="status" className="mt-3 text-xs text-[#8d5550]"><p>{copy.reviewFailed}</p><button type="button" onClick={() => { setSettledPlace(''); setRevision(value => value + 1); }} className="mt-1 min-h-11 font-bold underline">{copy.refresh}</button></div> :
      <>
        {average && <p className="mt-2 flex items-center gap-1 text-xs text-[#b63a43]"><Star size={15} fill="currentColor" /><span className="tabular-nums">{copy.points.replace('{rating}', average)} · {copy.count.replace('{count}', String(ratings.length))}</span></p>}
        {!reviews.length ? <p className="mt-3 text-xs leading-5 text-[#69717e]">{copy.noReviews}</p> : <div className="mt-2 divide-y divide-black/5">{reviews.map(post => <Link key={post.id} href={`/community/${post.id}`} className="block py-4">
          <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-bold">{post.title}</h3>{post.rating && <span className="flex items-center gap-1 text-xs text-[#b63a43]"><Star size={12} fill="currentColor" />{post.rating}</span>}</div>
          <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs leading-5 text-[#69717e]">{post.content}</p>
          {post.mediaUrls[0] && <img src={post.mediaUrls[0]} alt={post.title} loading="lazy" className="mt-2 h-24 w-32 rounded-lg object-cover ring-1 ring-black/10" />}
          <p className="mt-2 text-[10px] text-[#69717e]">{post.authorName} · {new Date(post.createdAt).toLocaleDateString(locale)}</p>
        </Link>)}</div>}
      </>}
    {writing && <CommunityPostEditor initialPlace={place} onClose={() => setWriting(false)} onSaved={post => { setReviews(current => [post, ...current.filter(item => item.id !== post.id)]); setWriting(false); setRevision(value => value + 1); }} />}
  </section>;
}
