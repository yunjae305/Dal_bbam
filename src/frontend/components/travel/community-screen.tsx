'use client';

import { useEffect, useState } from 'react';
import { Bookmark, Camera, Heart, LoaderCircle, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { CommunityPost } from '@/shared/types';
import { createSupabaseBrowserClient } from '@/frontend/supabase/client';
import { EmptyState } from '@/frontend/components/common/feedback';
import { useLocale } from '@/frontend/i18n/locale-context';

type DraftForm = {
  category: CommunityPost['category'];
  title: string;
  content: string;
  rating: number;
};

const initialForm: DraftForm = {
  category: 'review',
  title: '',
  content: '',
  rating: 5
};

export function CommunityScreen() {
  const { locale, messages } = useLocale();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [category, setCategory] = useState('');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<DraftForm>(initialForm);
  const [editingId, setEditingId] = useState('');
  const [mediaId, setMediaId] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (bookmarkedOnly) params.set('bookmarked', 'true');
      const response = await fetch(`/api/community?${params}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '커뮤니티를 불러오지 못했습니다.');
      setPosts(payload.data);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '커뮤니티를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [category, bookmarkedOnly]);

  async function upload(file: File) {
    setBusy(true);
    setNotice('');
    try {
      const signResponse = await fetch('/api/community/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size })
      });
      const signPayload = await signResponse.json();
      if (!signResponse.ok) throw new Error(signPayload?.error?.message ?? '업로드를 준비하지 못했습니다.');
      const supabase = createSupabaseBrowserClient();
      if (!supabase) throw new Error('Supabase 브라우저 설정이 필요합니다.');

      const { error } = await supabase.storage
        .from('community-staging')
        .uploadToSignedUrl(signPayload.data.path, signPayload.data.token, file, {
          contentType: file.type
        });
      if (error) throw error;

      const completeResponse = await fetch('/api/community/uploads/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: signPayload.data.mediaId })
      });
      const completePayload = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(completePayload?.error?.message ?? '이미지 검사를 통과하지 못했습니다.');
      setMediaId(completePayload.data.mediaId);
      setPreviewUrl(completePayload.data.url);
      setNotice('이미지 안전 검사를 통과했습니다.');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '이미지를 업로드하지 못했습니다.');
      setMediaId('');
      setPreviewUrl('');
    } finally {
      setBusy(false);
    }
  }

  async function createStory() {
    if (!mediaId) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/community/story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId, lang: locale, notes: form.content })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '스토리 초안을 만들지 못했습니다.');
      setForm(current => ({ ...current, title: payload.data.title, content: payload.data.content }));
      setNotice(messages.community.explicitPublish);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '스토리 초안을 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch(editingId ? `/api/community/${editingId}` : '/api/community', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          rating: form.category === 'review' || form.category === 'food' || form.category === 'lodging' ? form.rating : undefined,
          mediaIds: editingId ? undefined : mediaId ? [mediaId] : []
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '게시하지 못했습니다.');
      setForm(initialForm);
      setEditingId('');
      setMediaId('');
      setPreviewUrl('');
      setFormOpen(false);
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '게시하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleBookmark(post: CommunityPost) {
    const next = !post.bookmarked;
    setPosts(current => current.map(item => item.id === post.id ? { ...item, bookmarked: next } : item));
    const response = await fetch(`/api/community/${post.id}/bookmark`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookmarked: next })
    });
    if (!response.ok) setPosts(current => current.map(item => item.id === post.id ? { ...item, bookmarked: !next } : item));
  }

  async function remove(post: CommunityPost) {
    if (!window.confirm('이 게시물을 삭제할까요?')) return;
    const response = await fetch(`/api/community/${post.id}`, { method: 'DELETE' });
    if (response.ok) setPosts(current => current.filter(item => item.id !== post.id));
  }

  function edit(post: CommunityPost) {
    setForm({
      category: post.category,
      title: post.title,
      content: post.content,
      rating: post.rating ?? 5
    });
    setEditingId(post.id);
    setNotice('본인 게시물을 수정하고 다시 안전 검사를 진행합니다.');
    setFormOpen(true);
  }

  return (
    <section className="min-h-dvh bg-[#f6f3ee] pb-28">
      <header className="sticky top-0 z-20 bg-[#f6f3ee]/90 px-5 pb-3 pt-5 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-[#ff5b4f]">TRAVEL TOGETHER</p>
            <h1 className="mt-1 text-xl font-black">{messages.community.title}</h1>
          </div>
          <button type="button" onClick={() => {
            setEditingId('');
            setForm(initialForm);
            setMediaId('');
            setPreviewUrl('');
            setFormOpen(true);
          }} className="grid h-10 w-10 place-items-center rounded-full bg-[#ff5b4f] text-white" aria-label={messages.community.newPost}><Plus /></button>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto">
          {[
            ['', messages.common.all],
            ['review', '후기'],
            ['tip', '꿀팁'],
            ['food', messages.categories.food],
            ['lodging', messages.categories.lodging]
          ].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setCategory(value)} className={`shrink-0 rounded-full px-3 py-2 text-[10px] font-black ${category === value ? 'bg-[#223c72] text-white' : 'bg-white'}`}>{label}</button>
          ))}
          <button type="button" onClick={() => setBookmarkedOnly(current => !current)} className={`shrink-0 rounded-full px-3 py-2 text-[10px] font-black ${bookmarkedOnly ? 'bg-[#ff5b4f] text-white' : 'bg-white'}`}><Bookmark size={12} className="mr-1 inline" /> 북마크</button>
        </div>
      </header>

      {notice && <p className="mx-5 mt-2 rounded-xl bg-[#fff0eb] p-3 text-[10px] font-bold text-[#9b4d45]" role="status">{notice}</p>}

      <div className="space-y-4 px-5 pt-4">
        {loading ? (
          <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin" /></div>
        ) : !posts.length ? (
          <EmptyState title="첫 여행 이야기를 기다리고 있어요" description="사진이나 여행 팁을 공유해 보세요." />
        ) : posts.map(post => (
          <article key={post.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            {post.mediaUrls[0] && <img src={post.mediaUrls[0]} alt={`${post.title} 첨부 사진`} className="h-52 w-full object-cover" />}
            <div className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[9px] font-black text-[#ff5b4f]">{post.category.toUpperCase()} · {post.authorName}</p>
                <button type="button" onClick={() => toggleBookmark(post)} aria-label="북마크"><Bookmark size={17} fill={post.bookmarked ? 'currentColor' : 'none'} className={post.bookmarked ? 'text-[#ff5b4f]' : ''} /></button>
              </div>
              <h2 className="mt-2 text-[15px] font-black">{post.title}</h2>
              {post.rating && <p className="mt-1 text-[11px] text-amber-500">{'★'.repeat(post.rating)}{'☆'.repeat(5 - post.rating)}</p>}
              <p className="mt-3 whitespace-pre-line text-[11px] leading-5 text-[#626b68]">{post.content}</p>
              <p className="mt-3 text-[9px] text-[#9aa19f]">{new Date(post.createdAt).toLocaleDateString(locale)}</p>
              {post.isOwner && (
                <div className="mt-3 flex gap-3 border-t pt-3 text-[9px] font-black">
                  <button type="button" onClick={() => edit(post)} className="inline-flex items-center gap-1"><Pencil size={12} /> 수정</button>
                  <button type="button" onClick={() => remove(post)} className="inline-flex items-center gap-1 text-red-600"><Trash2 size={12} /> 삭제</button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
          <div className="mx-auto mt-8 max-w-md rounded-3xl bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">{editingId ? messages.common.edit : messages.community.newPost}</h2>
              <button type="button" onClick={() => setFormOpen(false)} aria-label={messages.common.close}><X /></button>
            </div>
            <div className="mt-4 space-y-3">
              <select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value as CommunityPost['category'] }))} className="h-11 w-full rounded-xl bg-[#f3f4f5] px-3 text-[11px] font-bold">
                <option value="review">후기</option>
                <option value="tip">꿀팁</option>
                <option value="food">맛집</option>
                <option value="lodging">숙소</option>
              </select>
              <input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} maxLength={120} placeholder="제목" className="h-11 w-full rounded-xl bg-[#f3f4f5] px-3 text-[11px] outline-none" />
              <textarea value={form.content} onChange={event => setForm(current => ({ ...current, content: event.target.value }))} maxLength={5000} placeholder="여행 이야기를 적어 주세요." className="min-h-32 w-full rounded-xl bg-[#f3f4f5] p-3 text-[11px] leading-5 outline-none" />
              {form.category !== 'tip' && (
                <label className="block text-[10px] font-black">별점
                  <select value={form.rating} onChange={event => setForm(current => ({ ...current, rating: Number(event.target.value) }))} className="ml-2 rounded-lg bg-[#f3f4f5] p-2">
                    {[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value}점</option>)}
                  </select>
                </label>
              )}
              {!editingId && <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed text-[10px] font-black">
                <Camera size={15} /> 사진 선택
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }} />
              </label>}
              {previewUrl && (
                <div className="relative">
                  <img src={previewUrl} alt="업로드 미리보기" className="h-40 w-full rounded-xl object-cover" />
                  <button type="button" onClick={createStory} disabled={busy} className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-[9px] font-black shadow"><Sparkles size={13} /> {messages.community.storyDraft}</button>
                </div>
              )}
              <p className="text-[9px] leading-4 text-[#7a8380]">사진은 private staging에서 안전·개인정보 검사를 통과한 뒤에만 공개됩니다. AI 초안은 자동 게시되지 않습니다.</p>
              <button type="button" onClick={publish} disabled={busy || !form.title.trim() || !form.content.trim()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ff5b4f] text-[11px] font-black text-white disabled:opacity-50">
                {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Heart size={15} />} {editingId ? '검사 후 수정 저장' : '확인 후 게시'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
