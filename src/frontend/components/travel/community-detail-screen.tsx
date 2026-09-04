'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Ban, Bookmark, Flag, LoaderCircle, MapPin, MoreHorizontal, Pencil, Send, Star, Trash2 } from 'lucide-react';
import type { CommunityComment, CommunityPost } from '@/shared/types';
import { ErrorState, SkeletonBox } from '@/frontend/components/common/feedback';
import { CommunityPostEditor } from '@/frontend/components/travel/community-post-editor';
import { useLocale } from '@/frontend/i18n/locale-context';
import { uiMessages } from '@/shared/ui-messages';

export function CommunityDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const { locale } = useLocale();
  const ui = uiMessages[locale].community;
  const categoryLabels: Record<CommunityPost['category'], string> = {
    review: ui.review,
    tip: ui.tip,
    food: ui.food,
    lodging: ui.lodging
  };
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [comment, setComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/community/${id}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.postLoadFailed);
      setPost(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ui.postLoadFailed);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id]);

  useEffect(() => {
    void fetch(`/api/community/${id}/comments`, { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json() as { data?: CommunityComment[]; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message ?? ui.commentsLoadFailed);
        setComments(payload.data ?? []);
      })
      .catch(cause => setNotice(cause instanceof Error ? cause.message : ui.commentsLoadFailed));
  }, [id, ui.commentsLoadFailed]);

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
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.bookmarkFailed);
    } catch (cause) {
      setPost(current => current ? { ...current, bookmarked: !next } : current);
      setNotice(cause instanceof Error ? cause.message : ui.bookmarkFailed);
    }
  }

  async function remove() {
    if (!post || !window.confirm(ui.deleteConfirm)) return;
    try {
      const response = await fetch(`/api/community/${post.id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.deleteFailed);
      router.replace('/community');
      router.refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : ui.deleteFailed);
    }
  }

  async function submitComment(event: React.FormEvent) {
    event.preventDefault();
    const content = comment.trim();
    if (!content || commentLoading) return;
    setCommentLoading(true);
    setNotice('');
    try {
      const response = await fetch(`/api/community/${id}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const payload = await response.json() as { data?: CommunityComment; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? ui.commentSaveFailed);
      setComments(current => [...current, payload.data!]);
      setComment('');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : ui.commentSaveFailed);
    } finally {
      setCommentLoading(false);
    }
  }

  async function deleteComment(commentId: string) {
    const response = await fetch(`/api/community/${id}/comments/${commentId}`, { method: 'DELETE' });
    if (response.ok) setComments(current => current.filter(item => item.id !== commentId));
    else setNotice(ui.commentDeleteFailed);
  }

  async function reportPost() {
    setMenuOpen(false);
    if (!window.confirm(ui.reportConfirm)) return;
    const response = await fetch(`/api/community/${id}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'other' })
    });
    setNotice(response.ok ? ui.reportSuccess : ui.reportFailed);
  }

  async function blockAuthor() {
    setMenuOpen(false);
    if (!window.confirm(ui.blockConfirm)) return;
    const response = await fetch(`/api/community/${id}/block`, { method: 'POST' });
    if (response.ok) router.replace('/community');
    else setNotice(ui.blockFailed);
  }

  if (loading) return <CommunityDetailSkeleton label={ui.detailLoading} />;
  if (error || !post) return <div className="min-h-[70dvh] bg-[#fffdfa] px-5 pt-12"><ErrorState title={ui.loadErrorTitle} description={error || ui.postNotFound} onRetry={() => void load()} /><Link href="/community" className="mx-auto mt-5 flex min-h-11 w-fit items-center gap-1 rounded-full bg-[#173e78] px-5 text-[10px] font-black text-white"><ArrowLeft size={14} /> {ui.backToList}</Link></div>;

  return (
    <article className="min-h-dvh bg-[#fffdfa] pb-10">
      <header className="sticky top-12 z-20 flex min-h-16 items-center justify-between border-b border-black/5 bg-[#fffdfa]/95 px-4 backdrop-blur">
        <Link href="/community" aria-label={ui.backToListLabel} className="grid min-h-11 min-w-11 place-items-center text-[#173e78]"><ArrowLeft size={24} /></Link>
        <p className="text-[16px] font-black text-[#173e78]">{categoryLabels[post.category]}</p>
        <div className="relative flex items-center">
          <button type="button" onClick={() => void toggleBookmark()} aria-label={post.bookmarked ? ui.bookmarkRemove : ui.bookmarkSave} aria-pressed={post.bookmarked} className={`grid min-h-11 min-w-11 place-items-center ${post.bookmarked ? 'text-[#f45f62]' : 'text-[#173e78]'}`}><Bookmark size={22} fill={post.bookmarked ? 'currentColor' : 'none'} /></button>
          <button type="button" onClick={() => setMenuOpen(current => !current)} aria-label={ui.postMenu} aria-expanded={menuOpen} className="grid min-h-11 min-w-11 place-items-center text-[#173e78]"><MoreHorizontal size={23} /></button>
          {menuOpen && <div className="absolute right-0 top-12 z-30 w-36 overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-black/5">{post.isOwner ? <><button type="button" onClick={() => { setMenuOpen(false); setEditing(true); }} className="flex min-h-11 w-full items-center gap-2 px-4 text-[10px] font-black text-[#173e78]"><Pencil size={14} /> {ui.edit}</button><button type="button" onClick={() => void remove()} className="flex min-h-11 w-full items-center gap-2 px-4 text-[10px] font-black text-[#d94e51]"><Trash2 size={14} /> {ui.delete}</button></> : <><button type="button" onClick={() => void reportPost()} className="flex min-h-11 w-full items-center gap-2 px-4 text-[10px] font-black text-[#b94f4a]"><Flag size={14} /> {ui.report}</button><button type="button" onClick={() => void blockAuthor()} className="flex min-h-11 w-full items-center gap-2 px-4 text-[10px] font-black text-[#333943]"><Ban size={14} /> {ui.blockAuthor}</button></>}</div>}
        </div>
      </header>

      {post.mediaUrls.length > 0 && <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pt-4">{post.mediaUrls.map((url, index) => <img key={url} src={url} alt={ui.photoAlt.replace('{title}', post.title).replace('{index}', String(index + 1))} className="aspect-[4/3] w-full shrink-0 snap-center rounded-3xl object-cover" />)}</div>}

      <div className="px-5 pb-8 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#f45f62] px-3 py-1.5 text-[9px] font-black text-white">{categoryLabels[post.category]}</span>
          {post.contentId && <span className="inline-flex items-center gap-1 rounded-full bg-[#eef1f6] px-3 py-1.5 text-[9px] font-black text-[#173e78]"><MapPin size={11} /> {ui.placeLinked}</span>}
        </div>
        <h1 className="mt-5 text-[27px] font-black leading-[1.35] tracking-tight text-[#10284e]">{post.title}</h1>

        <div className="mt-5 flex items-center justify-between gap-4 border-b border-[#eee9e3] pb-5">
          <div><p className="text-[11px] font-black text-[#263550]">{post.authorName}</p><p className="mt-1 text-[9px] font-semibold text-[#9d9993]">{new Date(post.createdAt).toLocaleDateString(locale)}</p></div>
          {post.rating && <p className="inline-flex items-center gap-1 text-[11px] font-black text-[#f45f62]"><Star size={17} fill="currentColor" /> {post.rating}.0</p>}
        </div>

        <p className="mt-6 whitespace-pre-line text-[13px] font-medium leading-7 text-[#333943]">{post.content}</p>
        {post.updatedAt !== post.createdAt && <p className="mt-5 text-[9px] font-semibold text-[#a39f99]">{ui.edited} · {new Date(post.updatedAt).toLocaleDateString(locale)}</p>}

        {post.isOwner && <div className="mt-8 grid grid-cols-2 overflow-hidden rounded-2xl border border-[#e8e3dc] bg-white"><button type="button" onClick={() => setEditing(true)} className="flex min-h-12 items-center justify-center gap-2 border-r border-[#e8e3dc] text-[10px] font-black text-[#173e78]"><Pencil size={15} /> {ui.edit}</button><button type="button" onClick={() => void remove()} className="flex min-h-12 items-center justify-center gap-2 text-[10px] font-black text-[#d94e51]"><Trash2 size={15} /> {ui.delete}</button></div>}
        {notice && <p className="mt-4 rounded-2xl bg-[#fff0ed] p-4 text-[10px] font-bold text-[#8d5550]" role="status">{notice}</p>}

        <section className="mt-9 border-t border-[#eee9e3] pt-7">
          <h2 className="text-[16px] font-black text-[#10284e]">{ui.comments} <span className="tabular-nums text-[#f45f62]">{comments.length}</span></h2>
          <form onSubmit={submitComment} className="mt-4 flex items-end gap-2">
            <label className="min-w-0 flex-1"><span className="sr-only">{ui.commentInput}</span><textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={1000} rows={2} placeholder={ui.commentPlaceholder} className="min-h-12 w-full resize-none rounded-2xl border border-[#e8e3dc] bg-white px-4 py-3 text-[12px] outline-none focus:border-[#173e78] focus:ring-4 focus:ring-[#173e78]/10" /></label>
            <button type="submit" disabled={!comment.trim() || commentLoading} aria-label={ui.commentPublish} className="grid min-h-12 min-w-12 place-items-center rounded-2xl bg-[#173e78] text-white transition-[transform,opacity] active:scale-[0.96] disabled:opacity-40">{commentLoading ? <LoaderCircle className="animate-spin" size={18} /> : <Send size={18} />}</button>
          </form>
          <div className="mt-5 grid gap-3">
            {comments.map(item => <article key={item.id} className="rounded-2xl bg-white p-4 ring-1 ring-black/5"><div className="flex items-center justify-between gap-3"><p className="text-[11px] font-black text-[#263550]">{item.authorName}</p><time className="text-[9px] tabular-nums text-[#9d9993]">{new Date(item.createdAt).toLocaleDateString(locale)}</time></div><p className="mt-2 whitespace-pre-line text-[12px] leading-6 text-[#4e565f]">{item.content}</p>{item.isOwner && <button type="button" onClick={() => void deleteComment(item.id)} className="mt-2 min-h-11 text-[10px] font-bold text-[#d94e51]">{ui.commentDelete}</button>}</article>)}
            {!comments.length && <p className="rounded-2xl bg-white p-5 text-center text-[11px] text-[#8f8b86]">{ui.firstComment}</p>}
          </div>
        </section>
      </div>

      {editing && <CommunityPostEditor post={post} onClose={() => setEditing(false)} onSaved={saved => { setPost(saved); setEditing(false); setNotice(ui.changesSaved); }} />}
    </article>
  );
}

function CommunityDetailSkeleton({ label }: { label: string }) {
  return <div className="min-h-dvh bg-[#fffdfa] px-5 pt-6" aria-label={label} aria-busy="true"><div className="flex items-center justify-center gap-2 text-[10px] font-black text-[#173e78]"><LoaderCircle size={16} className="animate-spin" /> {label}</div><SkeletonBox className="mt-6 aspect-[4/3] w-full rounded-3xl" /><SkeletonBox className="mt-6 h-6 w-4/5" /><SkeletonBox className="mt-4 h-4 w-2/5" /><SkeletonBox className="mt-8 h-3 w-full" /><SkeletonBox className="mt-3 h-3 w-full" /><SkeletonBox className="mt-3 h-3 w-3/4" /></div>;
}
