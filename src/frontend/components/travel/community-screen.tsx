'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bookmark, LoaderCircle, MapPin, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import type { CommunityPost } from '@/shared/types';
import { EmptyState, ErrorState, SkeletonBox } from '@/frontend/components/common/feedback';
import { CommunityPostEditor } from '@/frontend/components/travel/community-post-editor';
import { useLocale } from '@/frontend/i18n/locale-context';

const categoryOptions: Array<{ value: CommunityPost['category'] | ''; label: string }> = [
  { value: '', label: '전체' },
  { value: 'review', label: '후기' },
  { value: 'tip', label: '꿀팁' },
  { value: 'food', label: '맛집' },
  { value: 'lodging', label: '숙소' }
];

const categoryLabels: Record<CommunityPost['category'], string> = {
  review: '후기',
  tip: '꿀팁',
  food: '맛집',
  lodging: '숙소'
};

export function CommunityScreen() {
  const { locale, messages } = useLocale();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [category, setCategory] = useState<CommunityPost['category'] | ''>('');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [editorPost, setEditorPost] = useState<CommunityPost | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (bookmarkedOnly) params.set('bookmarked', 'true');
      const response = await fetch(`/api/community?${params}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '커뮤니티를 불러오지 못했습니다.');
      setPosts(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '커뮤니티를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [category, bookmarkedOnly]);

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
      if (!response.ok) throw new Error(payload?.error?.message ?? '북마크를 변경하지 못했습니다.');
    } catch (cause) {
      setPosts(current => current.map(item => item.id === post.id ? { ...item, bookmarked: !next } : item));
      setNotice(cause instanceof Error ? cause.message : '북마크를 변경하지 못했습니다.');
    }
  }

  async function remove(post: CommunityPost) {
    if (!window.confirm('이 게시물을 삭제할까요?')) return;
    setNotice('');
    try {
      const response = await fetch(`/api/community/${post.id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '게시물을 삭제하지 못했습니다.');
      setPosts(current => current.filter(item => item.id !== post.id));
      setNotice('게시물을 삭제했습니다.');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '게시물을 삭제하지 못했습니다.');
    }
  }

  function handleSaved(saved: CommunityPost) {
    setPosts(current => {
      const exists = current.some(post => post.id === saved.id);
      return exists ? current.map(post => post.id === saved.id ? saved : post) : [saved, ...current];
    });
    setEditorPost(undefined);
    setNotice('게시물을 저장했습니다.');
  }

  return (
    <section className="min-h-dvh bg-[#fffdfa] pb-10">
      <header className="sticky top-12 z-20 border-b border-black/5 bg-[#fffdfa]/95 px-5 pb-4 pt-6 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black tracking-[0.18em] text-[#f45f62]">TRAVEL TOGETHER</p>
            <h1 className="mt-1 text-[25px] font-black tracking-tight text-[#172f58]">{messages.community.title}</h1>
            <p className="mt-1 text-[10px] font-semibold text-[#8f8b86]">경주 여행의 순간과 꿀팁을 나눠보세요</p>
          </div>
          <button type="button" onClick={() => setEditorPost(null)} className="grid min-h-12 min-w-12 place-items-center rounded-full bg-[#f45f62] text-white shadow-lg shadow-red-200/60" aria-label={messages.community.newPost}><Plus size={23} /></button>
        </div>

        <label className="mt-5 flex min-h-12 items-center gap-3 rounded-2xl bg-[#f1f0ee] px-4 text-[#767b83]">
          <Search size={17} />
          <span className="sr-only">커뮤니티 검색</span>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="후기, 장소, 여행 팁 검색" className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold outline-none placeholder:text-[#a19d98]" />
        </label>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="커뮤니티 필터">
          {categoryOptions.map(item => (
            <button key={item.value} type="button" onClick={() => setCategory(item.value)} aria-pressed={category === item.value} className={`min-h-10 shrink-0 rounded-full px-4 text-[10px] font-black ${category === item.value ? 'bg-[#f45f62] text-white' : 'bg-[#f1f0ee] text-[#28364d]'}`}>{item.label}</button>
          ))}
          <button type="button" onClick={() => setBookmarkedOnly(current => !current)} aria-pressed={bookmarkedOnly} className={`inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-4 text-[10px] font-black ${bookmarkedOnly ? 'bg-[#173e78] text-white' : 'bg-[#f1f0ee] text-[#28364d]'}`}><Bookmark size={13} fill={bookmarkedOnly ? 'currentColor' : 'none'} /> 저장</button>
        </div>
      </header>

      {notice && <p className="mx-5 mt-4 rounded-2xl bg-[#fff0ed] p-4 text-[10px] font-bold text-[#8d5550]" role="status">{notice}</p>}

      <div className="space-y-5 px-5 pt-5">
        {loading ? <CommunitySkeleton /> : error ? (
          <ErrorState title="커뮤니티를 불러오지 못했어요" description={error} onRetry={() => void load()} />
        ) : !visiblePosts.length ? (
          <EmptyState title="아직 표시할 여행 이야기가 없어요" description={query ? '다른 검색어나 필터를 선택해 주세요.' : '첫 번째 경주 여행 이야기를 남겨 보세요.'} action={<button type="button" onClick={() => { setQuery(''); setCategory(''); setBookmarkedOnly(false); }} className="rounded-full bg-[#173e78] px-5 py-2.5 text-[10px] font-black text-white">필터 초기화</button>} />
        ) : visiblePosts.map(post => (
          <article key={post.id} className="overflow-hidden rounded-3xl bg-white shadow-[0_10px_35px_rgba(34,44,65,0.08)] ring-1 ring-black/5">
            <Link href={`/community/${post.id}`} className="block focus-visible:outline-offset-[-3px]">
              {post.mediaUrls[0] && <img src={post.mediaUrls[0]} alt={`${post.title} 첨부 사진`} loading="lazy" className="aspect-[16/10] w-full object-cover" />}
              <div className="p-5 pb-3">
                <div className="flex items-center gap-2 text-[9px] font-black"><span className="rounded-full bg-[#fff0ed] px-2.5 py-1 text-[#f45f62]">{categoryLabels[post.category]}</span>{post.contentId && <span className="inline-flex items-center gap-1 text-[#667080]"><MapPin size={11} /> 관광지 연결</span>}</div>
                <h2 className="mt-3 text-[17px] font-black leading-6 tracking-tight text-[#172f58]">{post.title}</h2>
                <p className="mt-2 line-clamp-3 whitespace-pre-line text-[11px] font-medium leading-5 text-[#69717e]">{post.content}</p>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div><p className="text-[10px] font-black text-[#273550]">{post.authorName}</p><p className="mt-0.5 text-[9px] font-semibold text-[#a09c96]">{new Date(post.createdAt).toLocaleDateString(locale)}</p></div>
                  {post.rating && <p className="inline-flex items-center gap-1 text-[10px] font-black text-[#f45f62]"><Star size={14} fill="currentColor" /> {post.rating}.0</p>}
                </div>
              </div>
            </Link>
            <div className="flex min-h-12 items-center justify-between border-t border-[#f0ece7] px-4">
              <button type="button" onClick={() => void toggleBookmark(post)} aria-label={post.bookmarked ? '북마크 해제' : '북마크 저장'} aria-pressed={post.bookmarked} className={`grid min-h-11 min-w-11 place-items-center ${post.bookmarked ? 'text-[#f45f62]' : 'text-[#6f7580]'}`}><Bookmark size={18} fill={post.bookmarked ? 'currentColor' : 'none'} /></button>
              {post.isOwner && <div className="flex items-center gap-1"><button type="button" onClick={() => setEditorPost(post)} className="inline-flex min-h-11 items-center gap-1 px-3 text-[9px] font-black text-[#173e78]"><Pencil size={13} /> 수정</button><button type="button" onClick={() => void remove(post)} className="inline-flex min-h-11 items-center gap-1 px-3 text-[9px] font-black text-[#d94e51]"><Trash2 size={13} /> 삭제</button></div>}
            </div>
          </article>
        ))}
      </div>

      {editorPost !== undefined && <CommunityPostEditor post={editorPost ?? undefined} onClose={() => setEditorPost(undefined)} onSaved={handleSaved} />}
    </section>
  );
}

function CommunitySkeleton() {
  return <div className="space-y-5" aria-label="커뮤니티를 불러오는 중" aria-busy="true">{[0, 1, 2].map(index => <div key={index} className="overflow-hidden rounded-3xl bg-white p-4 shadow-sm"><SkeletonBox className="aspect-[16/8] w-full" /><SkeletonBox className="mt-4 h-4 w-2/3" /><SkeletonBox className="mt-3 h-3 w-full" /><SkeletonBox className="mt-2 h-3 w-4/5" /><div className="mt-4 flex items-center gap-2"><LoaderCircle size={13} className="animate-spin text-[#f45f62]" /><span className="text-[9px] font-bold text-[#8d8a86]">불러오는 중</span></div></div>)}</div>;
}
