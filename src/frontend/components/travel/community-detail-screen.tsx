'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Bookmark, LoaderCircle, MapPin, MoreHorizontal, Pencil, Star, Trash2 } from 'lucide-react';
import type { CommunityPost } from '@/shared/types';
import { ErrorState, SkeletonBox } from '@/frontend/components/common/feedback';
import { CommunityPostEditor } from '@/frontend/components/travel/community-post-editor';
import { useLocale } from '@/frontend/i18n/locale-context';

const categoryLabels: Record<CommunityPost['category'], string> = {
  review: '후기',
  tip: '꿀팁',
  food: '맛집',
  lodging: '숙소'
};

export function CommunityDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const { locale } = useLocale();
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/community/${id}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '게시물을 불러오지 못했습니다.');
      setPost(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '게시물을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id]);

  async function toggleBookmark() {
    if (!post) return;
    const next = !post.bookmarked;
    setPost({ ...post, bookmarked: next });
    setNotice('');
    try {
      const response = await fetch(`/api/community/${post.id}/bookmark`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarked: next })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '북마크를 변경하지 못했습니다.');
    } catch (cause) {
      setPost(current => current ? { ...current, bookmarked: !next } : current);
      setNotice(cause instanceof Error ? cause.message : '북마크를 변경하지 못했습니다.');
    }
  }

  async function remove() {
    if (!post || !window.confirm('이 게시물을 삭제할까요?')) return;
    try {
      const response = await fetch(`/api/community/${post.id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '게시물을 삭제하지 못했습니다.');
      router.replace('/community');
      router.refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '게시물을 삭제하지 못했습니다.');
    }
  }

  if (loading) return <CommunityDetailSkeleton />;
  if (error || !post) return <div className="min-h-[70dvh] bg-[#fffdfa] px-5 pt-12"><ErrorState title="게시물을 불러오지 못했어요" description={error || '게시물을 찾을 수 없습니다.'} onRetry={() => void load()} /><Link href="/community" className="mx-auto mt-5 flex min-h-11 w-fit items-center gap-1 rounded-full bg-[#173e78] px-5 text-[10px] font-black text-white"><ArrowLeft size={14} /> 목록으로</Link></div>;

  return (
    <article className="min-h-dvh bg-[#fffdfa] pb-10">
      <header className="sticky top-12 z-20 flex min-h-16 items-center justify-between border-b border-black/5 bg-[#fffdfa]/95 px-4 backdrop-blur">
        <Link href="/community" aria-label="커뮤니티 목록으로" className="grid min-h-11 min-w-11 place-items-center text-[#173e78]"><ArrowLeft size={24} /></Link>
        <p className="text-[16px] font-black text-[#173e78]">{categoryLabels[post.category]}</p>
        <div className="relative flex items-center">
          <button type="button" onClick={() => void toggleBookmark()} aria-label={post.bookmarked ? '북마크 해제' : '북마크 저장'} aria-pressed={post.bookmarked} className={`grid min-h-11 min-w-11 place-items-center ${post.bookmarked ? 'text-[#f45f62]' : 'text-[#173e78]'}`}><Bookmark size={22} fill={post.bookmarked ? 'currentColor' : 'none'} /></button>
          {post.isOwner && <button type="button" onClick={() => setMenuOpen(current => !current)} aria-label="게시글 메뉴" aria-expanded={menuOpen} className="grid min-h-11 min-w-11 place-items-center text-[#173e78]"><MoreHorizontal size={23} /></button>}
          {post.isOwner && menuOpen && <div className="absolute right-0 top-12 z-30 w-32 overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-black/5"><button type="button" onClick={() => { setMenuOpen(false); setEditing(true); }} className="flex min-h-11 w-full items-center gap-2 px-4 text-[10px] font-black text-[#173e78]"><Pencil size={14} /> 수정</button><button type="button" onClick={() => void remove()} className="flex min-h-11 w-full items-center gap-2 px-4 text-[10px] font-black text-[#d94e51]"><Trash2 size={14} /> 삭제</button></div>}
        </div>
      </header>

      {post.mediaUrls.length > 0 && <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pt-4">{post.mediaUrls.map((url, index) => <img key={url} src={url} alt={`${post.title} 사진 ${index + 1}`} className="aspect-[4/3] w-full shrink-0 snap-center rounded-3xl object-cover" />)}</div>}

      <div className="px-5 pb-8 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#f45f62] px-3 py-1.5 text-[9px] font-black text-white">{categoryLabels[post.category]}</span>
          {post.contentId && <span className="inline-flex items-center gap-1 rounded-full bg-[#eef1f6] px-3 py-1.5 text-[9px] font-black text-[#173e78]"><MapPin size={11} /> 관광지 연결</span>}
        </div>
        <h1 className="mt-5 text-[27px] font-black leading-[1.35] tracking-tight text-[#10284e]">{post.title}</h1>

        <div className="mt-5 flex items-center justify-between gap-4 border-b border-[#eee9e3] pb-5">
          <div><p className="text-[11px] font-black text-[#263550]">{post.authorName}</p><p className="mt-1 text-[9px] font-semibold text-[#9d9993]">{new Date(post.createdAt).toLocaleDateString(locale)}</p></div>
          {post.rating && <p className="inline-flex items-center gap-1 text-[11px] font-black text-[#f45f62]"><Star size={17} fill="currentColor" /> {post.rating}.0</p>}
        </div>

        <p className="mt-6 whitespace-pre-line text-[13px] font-medium leading-7 text-[#333943]">{post.content}</p>
        {post.updatedAt !== post.createdAt && <p className="mt-5 text-[9px] font-semibold text-[#a39f99]">수정됨 · {new Date(post.updatedAt).toLocaleDateString(locale)}</p>}

        {post.isOwner && <div className="mt-8 grid grid-cols-2 overflow-hidden rounded-2xl border border-[#e8e3dc] bg-white"><button type="button" onClick={() => setEditing(true)} className="flex min-h-12 items-center justify-center gap-2 border-r border-[#e8e3dc] text-[10px] font-black text-[#173e78]"><Pencil size={15} /> 수정</button><button type="button" onClick={() => void remove()} className="flex min-h-12 items-center justify-center gap-2 text-[10px] font-black text-[#d94e51]"><Trash2 size={15} /> 삭제</button></div>}
        {notice && <p className="mt-4 rounded-2xl bg-[#fff0ed] p-4 text-[10px] font-bold text-[#8d5550]" role="status">{notice}</p>}
      </div>

      {editing && <CommunityPostEditor post={post} onClose={() => setEditing(false)} onSaved={saved => { setPost(saved); setEditing(false); setNotice('수정 내용을 저장했습니다.'); }} />}
    </article>
  );
}

function CommunityDetailSkeleton() {
  return <div className="min-h-dvh bg-[#fffdfa] px-5 pt-6" aria-label="게시물을 불러오는 중" aria-busy="true"><div className="flex items-center justify-center gap-2 text-[10px] font-black text-[#173e78]"><LoaderCircle size={16} className="animate-spin" /> 게시물을 불러오는 중</div><SkeletonBox className="mt-6 aspect-[4/3] w-full rounded-3xl" /><SkeletonBox className="mt-6 h-6 w-4/5" /><SkeletonBox className="mt-4 h-4 w-2/5" /><SkeletonBox className="mt-8 h-3 w-full" /><SkeletonBox className="mt-3 h-3 w-full" /><SkeletonBox className="mt-3 h-3 w-3/4" /></div>;
}
