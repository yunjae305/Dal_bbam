'use client';

import { useEffect, useState } from 'react';
import { Camera, LoaderCircle, MapPin, Sparkles, Star, X } from 'lucide-react';
import type { CommunityPost } from '@/shared/types';
import { createSupabaseBrowserClient } from '@/frontend/supabase/client';
import { useLocale } from '@/frontend/i18n/locale-context';

type DraftForm = {
  category: CommunityPost['category'];
  title: string;
  content: string;
  rating: number;
};

type Props = {
  post?: CommunityPost;
  onClose: () => void;
  onSaved: (post: CommunityPost) => void | Promise<void>;
};

const categories: Array<{ value: CommunityPost['category']; label: string }> = [
  { value: 'review', label: '후기' },
  { value: 'tip', label: '꿀팁' },
  { value: 'food', label: '맛집' },
  { value: 'lodging', label: '숙소' }
];

export function CommunityPostEditor({ post, onClose, onSaved }: Props) {
  const { locale, messages } = useLocale();
  const [form, setForm] = useState<DraftForm>({
    category: post?.category ?? 'review',
    title: post?.title ?? '',
    content: post?.content ?? '',
    rating: post?.rating ?? 5
  });
  const [mediaId, setMediaId] = useState('');
  const [previewUrl, setPreviewUrl] = useState(post?.mediaUrls[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [moderationReady, setModerationReady] = useState<boolean | null>(null);

  const dirty = form.title !== (post?.title ?? '') ||
    form.content !== (post?.content ?? '') ||
    form.category !== (post?.category ?? 'review') ||
    form.rating !== (post?.rating ?? 5) || Boolean(mediaId);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || busy) return;
      if (!dirty || window.confirm('작성 중인 내용을 버리고 닫을까요?')) onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, dirty, onClose]);

  useEffect(() => {
    let active = true;
    void fetch('/api/health', { cache: 'no-store' })
      .then(response => response.json())
      .then(payload => {
        if (active) setModerationReady(Boolean(payload?.readiness?.ai));
      })
      .catch(() => {
        if (active) setModerationReady(null);
      });
    return () => { active = false; };
  }, []);

  function requestClose() {
    if (!busy && (!dirty || window.confirm('작성 중인 내용을 버리고 닫을까요?'))) onClose();
  }

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
      setPreviewUrl(post?.mediaUrls[0] ?? '');
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

  async function submit() {
    if (moderationReady === false) {
      setNotice('현재 안전 검사 서비스가 설정되지 않아 게시물을 저장할 수 없습니다. 관리자에게 OpenAI 설정을 요청해 주세요.');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch(post ? `/api/community/${post.id}` : '/api/community', {
        method: post ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          rating: form.category === 'tip' ? (post ? null : undefined) : form.rating,
          mediaIds: post ? undefined : mediaId ? [mediaId] : []
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '게시물을 저장하지 못했습니다.');
      await onSaved(payload.data);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '게시물을 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const ratingEnabled = form.category !== 'tip';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f8f6f1]" role="dialog" aria-modal="true" aria-labelledby="community-editor-title">
      <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-[#fffdfa] px-5 pb-10">
        <header className="sticky top-0 z-10 -mx-5 flex min-h-16 items-center justify-between border-b border-black/5 bg-[#fffdfa]/95 px-5 backdrop-blur">
          <button type="button" onClick={requestClose} className="min-h-11 min-w-11 text-left text-[12px] font-black text-[#173e78]">취소</button>
          <h1 id="community-editor-title" className="text-[18px] font-black text-[#173e78]">{post ? '게시글 수정' : '새 게시글'}</h1>
          <button type="button" onClick={() => void submit()} disabled={busy || moderationReady === false || !form.title.trim() || !form.content.trim()} className="min-h-11 min-w-11 text-right text-[12px] font-black text-[#f45f62] disabled:opacity-40">저장</button>
        </header>

        <section className="pt-7">
          <h2 className="text-[23px] font-black tracking-tight text-[#173e78]">어떤 이야기를 나눌까요?</h2>
          <div className="mt-5 grid grid-cols-4 gap-2" aria-label="게시글 카테고리">
            {categories.map(item => (
              <button key={item.value} type="button" onClick={() => setForm(current => ({ ...current, category: item.value }))} aria-pressed={form.category === item.value} className={`min-h-11 rounded-2xl text-[11px] font-black ${form.category === item.value ? 'bg-[#f45f62] text-white' : 'border border-[#e2ddd5] bg-white text-[#173e78]'}`}>{item.label}</button>
            ))}
          </div>

          {post?.contentId && <div className="mt-6 flex min-h-12 items-center gap-2 rounded-2xl bg-[#f4f1ed] px-4 text-[11px] font-bold text-[#173e78]"><MapPin size={16} /> 연결된 관광지 · {post.contentId}</div>}

          <div className="mt-6">
            <div className="flex items-center justify-between"><p className="text-[12px] font-black text-[#173e78]">사진</p>{!post && <p className="text-[9px] text-[#8f8b86]">JPEG·PNG·WebP, 10MB 이하</p>}</div>
            {previewUrl ? (
              <div className="relative mt-3 overflow-hidden rounded-3xl bg-[#ece8e2]">
                <img src={previewUrl} alt="게시글 사진 미리보기" className="aspect-[16/10] w-full object-cover" />
                {mediaId && <button type="button" onClick={() => void createStory()} disabled={busy} className="absolute bottom-3 right-3 inline-flex min-h-10 items-center gap-1 rounded-full bg-white px-4 text-[10px] font-black text-[#173e78] shadow"><Sparkles size={14} /> AI 초안</button>}
              </div>
            ) : !post && (
              <label className="mt-3 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-[#cfc8bf] bg-[#f7f4ef] text-[10px] font-black text-[#6f747c]">
                <Camera size={22} className="text-[#f45f62]" /> 여행 사진을 추가해 주세요
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
              </label>
            )}
          </div>

          <label className="mt-6 block text-[12px] font-black text-[#173e78]">제목
            <input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} maxLength={120} placeholder="제목을 입력해 주세요" className="mt-2 min-h-12 w-full rounded-2xl border border-[#e2ddd5] bg-white px-4 text-[12px] font-semibold outline-none" />
            <span className="mt-1 block text-right text-[9px] font-medium text-[#98938d]">{form.title.length}/120</span>
          </label>

          <label className="mt-4 block text-[12px] font-black text-[#173e78]">내용
            <textarea value={form.content} onChange={event => setForm(current => ({ ...current, content: event.target.value }))} maxLength={5000} placeholder="경주 여행 이야기를 들려주세요" className="mt-2 min-h-40 w-full resize-none rounded-2xl border border-[#e2ddd5] bg-white p-4 text-[12px] font-semibold leading-6 outline-none" />
            <span className="mt-1 block text-right text-[9px] font-medium text-[#98938d]">{form.content.length}/5000</span>
          </label>

          {ratingEnabled && <fieldset className="mt-4 rounded-2xl border border-[#e2ddd5] bg-white p-4"><legend className="px-1 text-[12px] font-black text-[#173e78]">별점</legend><div className="mt-1 flex justify-between">{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" onClick={() => setForm(current => ({ ...current, rating: value }))} className="grid min-h-11 min-w-11 place-items-center" aria-label={`${value}점`}><Star size={27} className={value <= form.rating ? 'fill-[#f45f62] text-[#f45f62]' : 'text-[#d5d0ca]'} /></button>)}</div></fieldset>}

          <p className="mt-5 rounded-2xl bg-[#fff0ed] p-4 text-[10px] font-bold leading-5 text-[#8d5550]">사진과 글은 안전·개인정보 검사 후 공개됩니다. AI 초안은 자동으로 게시되지 않습니다.</p>
          {moderationReady === false && <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[10px] font-bold leading-5 text-amber-800" role="alert">현재 안전 검사 서비스가 설정되지 않아 작성·수정을 완료할 수 없습니다. 배포 또는 데모 환경에 OpenAI 설정이 필요합니다.</p>}
          {notice && <p className="mt-3 rounded-2xl bg-[#f1eee9] p-4 text-[10px] font-bold leading-5 text-[#765b57]" role="status">{notice}</p>}

          <button type="button" onClick={() => void submit()} disabled={busy || moderationReady === false || !form.title.trim() || !form.content.trim()} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#f45f62] text-[12px] font-black text-white shadow-lg shadow-red-200/60 disabled:opacity-40">
            {busy ? <LoaderCircle size={17} className="animate-spin" /> : post ? '수정 내용 저장' : '게시하기'}
          </button>
        </section>
      </div>
      <button type="button" onClick={requestClose} className="fixed right-3 top-3 hidden" aria-label="닫기"><X /></button>
    </div>
  );
}
