'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Bookmark, LoaderCircle, MapPin, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { placeCategories, type CommunityPost, type PlaceCategory } from '@/shared/types';
import { communityCopy } from '@/shared/community';
import { EmptyState, ErrorState, SkeletonBox } from '@/frontend/components/common/feedback';
import { CommunityPostEditor } from '@/frontend/components/travel/community-post-editor';
import { useLocale } from '@/frontend/i18n/locale-context';
import { uiMessages } from '@/shared/ui-messages';

export function CommunityScreen() {
  const { locale, messages } = useLocale();
  const ui = uiMessages[locale].community;
  const copy = communityCopy[locale];
  const categoryOptions: Array<{ value: CommunityPost['category'] | ''; label: string }> = [
    { value: '', label: ui.all },
    { value: 'review', label: ui.review },
    { value: 'tip', label: ui.tip },
    { value: 'food', label: ui.food },
    { value: 'lodging', label: ui.lodging }
  ];
  const categoryLabels: Record<CommunityPost['category'], string> = {
    review: ui.review,
    tip: ui.tip,
    food: ui.food,
    lodging: ui.lodging
  };
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [category, setCategory] = useState<CommunityPost['category'] | ''>('');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [regionInput, setRegionInput] = useState('');
  const [region, setRegion] = useState('');
  const [placeCategory, setPlaceCategory] = useState<PlaceCategory | ''>('');
  const [editorPost, setEditorPost] = useState<CommunityPost | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadRequestRef = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (region) params.set('region', region);
      if (placeCategory) params.set('placeCategory', placeCategory);
      if (bookmarkedOnly) params.set('bookmarked', 'true');
      const response = await fetch(`/api/community?${params}`, { cache: 'no-store', signal });
      const payload = await response.json();
      if (requestId !== loadRequestRef.current) return;
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.loadFailed);
      setPosts(payload.data);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      if (requestId !== loadRequestRef.current) return;
      setError(cause instanceof Error ? cause.message : ui.loadFailed);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [category, region, placeCategory, bookmarkedOnly, ui.loadFailed]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setRegion(regionInput.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [regionInput]);

  const visiblePosts = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase(locale);
    if (!keyword) return posts;
    return posts.filter(post => [post.title, post.content, post.authorName]
      .some(value => value.toLocaleLowerCase(locale).includes(keyword)));
  }, [locale, posts, query]);

  async function toggleBookmark(post: CommunityPost) {
    const next = !post.bookmarked;
    setNotice('');
    setPosts(current => current.map(item => item.id === post.id ? { ...item, bookmarked: next } : item));
    try {
      const response = await fetch(`/api/community/${post.id}/bookmark`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarked: next })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.bookmarkFailed);
      if (bookmarkedOnly && !next) setPosts(current => current.filter(item => item.id !== post.id));
    } catch (cause) {
      setPosts(current => current.map(item => item.id === post.id ? { ...item, bookmarked: !next } : item));
      setNotice(cause instanceof Error ? cause.message : ui.bookmarkFailed);
    }
  }

  async function remove(post: CommunityPost) {
    if (!window.confirm(ui.deleteConfirm)) return;
    setNotice('');
    try {
      const response = await fetch(`/api/community/${post.id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.deleteFailed);
      setPosts(current => current.filter(item => item.id !== post.id));
      setNotice(ui.deleted);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : ui.deleteFailed);
    }
  }

  function handleSaved(saved: CommunityPost) {
    setPosts(current => {
      const exists = current.some(post => post.id === saved.id);
      const matchesFilters = (!category || saved.category === category) && (!bookmarkedOnly || saved.bookmarked) &&
        (!placeCategory || saved.placeCategory === placeCategory) && (!region || saved.placeAddress?.toLocaleLowerCase().includes(region.toLocaleLowerCase()));
      if (exists) return matchesFilters ? current.map(post => post.id === saved.id ? saved : post) : current.filter(post => post.id !== saved.id);
      return matchesFilters ? [saved, ...current] : current;
    });
    setEditorPost(undefined);
    setNotice(ui.saved);
  }

  return (
    <section className="min-h-dvh bg-[#fffdfa] pb-10">
      <header className="sticky top-12 z-20 border-b border-black/5 bg-[#fffdfa]/95 px-5 pb-4 pt-6 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black tracking-[0.18em] text-[#f45f62]">TRAVEL TOGETHER</p>
            <h1 className="mt-1 text-[25px] font-black tracking-tight text-[#172f58]">{messages.community.title}</h1>
            <p className="mt-1 text-[10px] font-semibold text-[#8f8b86]">{ui.subtitle}</p>
          </div>
          <button type="button" onClick={() => setEditorPost(null)} className="grid min-h-12 min-w-12 place-items-center rounded-full bg-[#f45f62] text-white shadow-lg shadow-red-200/60" aria-label={messages.community.newPost}><Plus size={23} /></button>
        </div>

        <label className="mt-5 flex min-h-12 items-center gap-3 rounded-2xl bg-[#f1f0ee] px-4 text-[#767b83]">
          <Search size={17} />
          <span className="sr-only">{ui.searchLabel}</span>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={ui.searchPlaceholder} className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold outline-none placeholder:text-[#a19d98]" />
        </label>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label={ui.filtersLabel}>
          {categoryOptions.map(item => (
            <button key={item.value} type="button" onClick={() => setCategory(item.value)} aria-pressed={category === item.value} className={`min-h-10 shrink-0 rounded-full px-4 text-[10px] font-black ${category === item.value ? 'bg-[#f45f62] text-white' : 'bg-[#f1f0ee] text-[#28364d]'}`}>{item.label}</button>
          ))}
          <button type="button" onClick={() => setBookmarkedOnly(current => !current)} aria-pressed={bookmarkedOnly} className={`inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-4 text-[10px] font-black ${bookmarkedOnly ? 'bg-[#173e78] text-white' : 'bg-[#f1f0ee] text-[#28364d]'}`}><Bookmark size={13} fill={bookmarkedOnly ? 'currentColor' : 'none'} /> {ui.savedFilter}</button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[10px] font-bold text-[#667080]">{copy.region}
            <input value={regionInput} onChange={event => setRegionInput(event.target.value)} maxLength={60} placeholder={copy.regionHint} className="mt-1 min-h-11 w-full rounded-xl border border-[#e2ddd5] bg-white px-3 text-[11px]" />
          </label>
          <label className="text-[10px] font-bold text-[#667080]">{copy.placeCategory}
            <select value={placeCategory} onChange={event => setPlaceCategory(event.target.value as PlaceCategory | '')} className="mt-1 min-h-11 w-full rounded-xl border border-[#e2ddd5] bg-white px-3 text-[11px]">
              <option value="">{copy.allPlaces}</option>
              {placeCategories.map(value => <option key={value} value={value}>{messages.categories[value]}</option>)}
            </select>
          </label>
        </div>
      </header>

      {notice && <p className="mx-5 mt-4 rounded-2xl bg-[#fff0ed] p-4 text-[10px] font-bold text-[#8d5550]" role="status">{notice}</p>}

      <div className="space-y-5 px-5 pt-5">
        {loading ? <CommunitySkeleton label={ui.loadingList} loadingLabel={ui.loading} /> : error ? (
          <ErrorState title={ui.loadErrorTitle} description={error} onRetry={() => void load()} />
        ) : !visiblePosts.length ? (
          <EmptyState title={ui.emptyTitle} description={query ? ui.emptySearch : ui.emptyDefault} action={<button type="button" onClick={() => { setQuery(''); setCategory(''); setBookmarkedOnly(false); setRegionInput(''); setRegion(''); setPlaceCategory(''); }} className="rounded-full bg-[#173e78] px-5 py-2.5 text-[10px] font-black text-white">{ui.resetFilters}</button>} />
        ) : visiblePosts.map(post => (
          <article key={post.id} className="overflow-hidden rounded-3xl bg-white shadow-[0_10px_35px_rgba(34,44,65,0.08)] ring-1 ring-black/5">
            <Link href={`/community/${post.id}`} className="block focus-visible:outline-offset-[-3px]">
              {post.mediaUrls[0] && <img src={post.mediaUrls[0]} alt={ui.attachmentPhoto.replace('{title}', post.title)} loading="lazy" className="aspect-[16/10] w-full object-cover" />}
              <div className="p-5 pb-3">
                <div className="flex items-center gap-2 text-[9px] font-black"><span className="rounded-full bg-[#fff0ed] px-2.5 py-1 text-[#f45f62]">{categoryLabels[post.category]}</span>{post.contentId && <span className="inline-flex items-center gap-1 text-[#667080]"><MapPin size={11} /> {ui.placeLinked}</span>}</div>
                <h2 className="mt-3 text-[17px] font-black leading-6 tracking-tight text-[#172f58]">{post.title}</h2>
                {post.placeName && <p className="mt-1 text-[10px] text-[#667080]">{post.placeName} · {post.placeAddress}</p>}
                <p className="mt-2 line-clamp-3 whitespace-pre-line text-[11px] font-medium leading-5 text-[#69717e]">{post.content}</p>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div><p className="text-[10px] font-black text-[#273550]">{post.authorName}</p><p className="mt-0.5 text-[9px] font-semibold text-[#a09c96]">{new Date(post.createdAt).toLocaleDateString(locale)}</p></div>
                  {post.rating && <p className="inline-flex items-center gap-1 text-[10px] font-black text-[#f45f62]"><Star size={14} fill="currentColor" /> {post.rating}.0</p>}
                </div>
              </div>
            </Link>
            <div className="flex min-h-12 items-center justify-between border-t border-[#f0ece7] px-4">
              <button type="button" onClick={() => void toggleBookmark(post)} aria-label={post.bookmarked ? ui.bookmarkRemove : ui.bookmarkSave} aria-pressed={post.bookmarked} className={`grid min-h-11 min-w-11 place-items-center ${post.bookmarked ? 'text-[#f45f62]' : 'text-[#6f7580]'}`}><Bookmark size={18} fill={post.bookmarked ? 'currentColor' : 'none'} /></button>
              {post.isOwner && <div className="flex items-center gap-1"><button type="button" onClick={() => setEditorPost(post)} className="inline-flex min-h-11 items-center gap-1 px-3 text-[9px] font-black text-[#173e78]"><Pencil size={13} /> {ui.edit}</button><button type="button" onClick={() => void remove(post)} className="inline-flex min-h-11 items-center gap-1 px-3 text-[9px] font-black text-[#d94e51]"><Trash2 size={13} /> {ui.delete}</button></div>}
            </div>
          </article>
        ))}
      </div>

      {editorPost !== undefined && <CommunityPostEditor post={editorPost ?? undefined} onClose={() => setEditorPost(undefined)} onSaved={handleSaved} />}
    </section>
  );
}

function CommunitySkeleton({ label, loadingLabel }: { label: string; loadingLabel: string }) {
  return <div className="space-y-5" aria-label={label} aria-busy="true">{[0, 1, 2].map(index => <div key={index} className="overflow-hidden rounded-3xl bg-white p-4 shadow-sm"><SkeletonBox className="aspect-[16/8] w-full" /><SkeletonBox className="mt-4 h-4 w-2/3" /><SkeletonBox className="mt-3 h-3 w-full" /><SkeletonBox className="mt-2 h-3 w-4/5" /><div className="mt-4 flex items-center gap-2"><LoaderCircle size={13} className="animate-spin text-[#f45f62]" /><span className="text-[9px] font-bold text-[#8d8a86]">{loadingLabel}</span></div></div>)}</div>;
}
