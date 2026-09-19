'use client';

import { useEffect, useState } from 'react';
import { Camera, LoaderCircle, MapPin, Sparkles, Star, X } from 'lucide-react';
import type { CommunityPost, PlaceSummary } from '@/shared/types';
import { communityCopy } from '@/shared/community';
import { createSupabaseBrowserClient } from '@/frontend/supabase/client';
import { useLocale } from '@/frontend/i18n/locale-context';
import { uiMessages } from '@/shared/ui-messages';

type DraftForm = {
  category: CommunityPost['category'];
  title: string;
  content: string;
  rating: number;
  contentId: string;
};

type Props = {
  post?: CommunityPost;
  initialPlace?: Pick<PlaceSummary, 'contentId' | 'name' | 'category'>;
  onClose: () => void;
  onSaved: (post: CommunityPost) => void | Promise<void>;
};

export function CommunityPostEditor({ post, initialPlace, onClose, onSaved }: Props) {
  const { locale, messages } = useLocale();
  const ui = uiMessages[locale].community;
  const copy = communityCopy[locale];
  const categories: Array<{ value: CommunityPost['category']; label: string }> = [
    { value: 'review', label: ui.review },
    { value: 'tip', label: ui.tip },
    { value: 'food', label: ui.food },
    { value: 'lodging', label: ui.lodging }
  ];
  const [form, setForm] = useState<DraftForm>({
    category: post?.category ?? (initialPlace?.category === 'food' || initialPlace?.category === 'lodging' ? initialPlace.category : 'review'),
    title: post?.title ?? '',
    content: post?.content ?? '',
    rating: post?.rating ?? 5,
    contentId: post?.contentId ?? initialPlace?.contentId ?? ''
  });
  const [mediaId, setMediaId] = useState('');
  const [previewUrl, setPreviewUrl] = useState(post?.mediaUrls[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [moderationReady, setModerationReady] = useState<boolean | null>(null);
  const [places, setPlaces] = useState<PlaceSummary[]>([]);
  const [placeError, setPlaceError] = useState('');

  const dirty = form.title !== (post?.title ?? '') ||
    form.content !== (post?.content ?? '') ||
    form.category !== (post?.category ?? 'review') ||
    form.rating !== (post?.rating ?? 5) || form.contentId !== (post?.contentId ?? initialPlace?.contentId ?? '') || Boolean(mediaId);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/places?lang=${locale}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(copy.placesFailed); return response.json(); })
      .then(payload => setPlaces(Array.isArray(payload.data) ? payload.data : []))
      .catch(error => { if (!controller.signal.aborted) setPlaceError(error instanceof Error ? error.message : copy.placesFailed); });
    return () => controller.abort();
  }, [locale, copy.placesFailed]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || busy) return;
      if (!dirty || window.confirm(ui.discardConfirm)) onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, dirty, onClose, ui.discardConfirm]);

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
    if (!busy && (!dirty || window.confirm(ui.discardConfirm))) onClose();
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
      if (!signResponse.ok) throw new Error(signPayload?.error?.message ?? ui.uploadPrepareFailed);
      const supabase = createSupabaseBrowserClient();
      if (!supabase) throw new Error(ui.browserConfigRequired);

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
      if (!completeResponse.ok) throw new Error(completePayload?.error?.message ?? ui.imageRejected);
      setMediaId(completePayload.data.mediaId);
      setPreviewUrl(completePayload.data.url);
      setNotice(completePayload.data.privacyCheck === 'unavailable' ? copy.imageScanUnavailable : ui.imageApproved);
      if (moderationReady && !form.title.trim() && !form.content.trim()) {
        await createStory(completePayload.data.mediaId, false);
      }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : ui.imageUploadFailed);
      setMediaId('');
      setPreviewUrl(post?.mediaUrls[0] ?? '');
    } finally {
      setBusy(false);
    }
  }

  async function createStory(selectedMediaId = mediaId, replaceText = true) {
    if (!selectedMediaId) return;
    setBusy(true);
    setNotice(copy.storyPreparing);
    try {
      const response = await fetch('/api/community/story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: selectedMediaId, lang: locale, notes: form.content })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.storyFailed);
      setForm(current => ({
        ...current,
        title: replaceText || !current.title.trim() ? payload.data.title : current.title,
        content: replaceText || !current.content.trim() ? payload.data.content : current.content
      }));
      setNotice(messages.community.explicitPublish);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : ui.storyFailed);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch(post ? `/api/community/${post.id}` : '/api/community', {
        method: post ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          contentId: form.contentId || (post ? null : undefined),
          rating: form.category === 'tip' ? (post ? null : undefined) : form.rating,
          mediaIds: post ? undefined : mediaId ? [mediaId] : []
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.saveFailed);
      await onSaved(payload.data);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : ui.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  const ratingEnabled = form.category !== 'tip';
  const requiresPlace = form.category === 'food' || form.category === 'lodging';
  const visiblePlaces = places.filter(place => !requiresPlace || place.category === form.category);
  const knownPlaceMatches = (initialPlace?.contentId === form.contentId && initialPlace.category === form.category) ||
    (post?.contentId === form.contentId && post.placeCategory === form.category);
  const missingPlace = requiresPlace && (!form.contentId || (places.length > 0 && !knownPlaceMatches && !visiblePlaces.some(place => place.contentId === form.contentId)));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f8f6f1]" role="dialog" aria-modal="true" aria-labelledby="community-editor-title">
      <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-[#fffdfa] px-5 pb-10">
        <header className="sticky top-0 z-10 -mx-5 flex min-h-16 items-center justify-between border-b border-black/5 bg-[#fffdfa]/95 px-5 backdrop-blur">
          <button type="button" onClick={requestClose} className="min-h-11 min-w-11 text-left text-[12px] font-black text-[#173e78]">{ui.cancel}</button>
          <h1 id="community-editor-title" className="text-[18px] font-black text-[#173e78]">{post ? ui.editPost : ui.newPost}</h1>
          <button type="button" onClick={() => void submit()} disabled={busy || missingPlace || !form.title.trim() || !form.content.trim()} className="min-h-11 min-w-11 text-right text-[12px] font-black text-[#ff5b4f] disabled:opacity-40">{ui.save}</button>
        </header>

        <section className="pt-7">
          <h2 className="text-[23px] font-black tracking-tight text-[#173e78]">{ui.prompt}</h2>
          <div className="mt-5 grid grid-cols-4 gap-2" aria-label={ui.categoryLabel}>
            {categories.map(item => (
              <button key={item.value} type="button" onClick={() => setForm(current => ({ ...current, category: item.value }))} aria-pressed={form.category === item.value} className={`min-h-11 rounded-2xl text-[11px] font-black ${form.category === item.value ? 'bg-[#ff5b4f] text-white' : 'border border-[#e2ddd5] bg-white text-[#173e78]'}`}>{item.label}</button>
            ))}
          </div>

          <label className="mt-6 block text-[12px] font-black text-[#173e78]">
            <span className="flex items-center gap-2"><MapPin size={16} />{copy.place}</span>
            <select value={form.contentId} onChange={event => setForm(current => ({ ...current, contentId: event.target.value }))} required={requiresPlace} className="mt-2 min-h-12 w-full rounded-2xl border border-[#e2ddd5] bg-white px-3 text-[12px] font-semibold">
              <option value="">{requiresPlace ? copy.choosePlace : copy.optionalPlace}</option>
              {form.contentId && !places.some(place => place.contentId === form.contentId) && <option value={form.contentId}>{post?.placeName ?? initialPlace?.name ?? form.contentId}</option>}
              {visiblePlaces.map(place => <option key={place.contentId} value={place.contentId}>{place.name}</option>)}
            </select>
            <span className="mt-2 block text-[10px] font-medium text-[#69717e]">{requiresPlace ? copy.placeRequired : copy.placeHint}</span>
          </label>
          {placeError && <p role="status" className="mt-2 text-xs text-red-700">{placeError}</p>}

          <div className="mt-6">
            <div className="flex items-center justify-between"><p className="text-[12px] font-black text-[#173e78]">{ui.photo}</p>{!post && <p className="text-[9px] text-[#8f8b86]">{ui.fileHint}</p>}</div>
            {previewUrl ? (
              <div className="relative mt-3 overflow-hidden rounded-3xl bg-[#ece8e2]">
                <img src={previewUrl} alt={ui.previewAlt} className="aspect-[16/10] w-full object-cover" />
                {mediaId && <button type="button" onClick={() => void createStory()} disabled={busy} className="absolute bottom-3 right-3 inline-flex min-h-10 items-center gap-1 rounded-full bg-white px-4 text-[10px] font-black text-[#173e78] shadow"><Sparkles size={14} /> {ui.aiDraft}</button>}
                {!post && <button type="button" onClick={() => { setMediaId(''); setPreviewUrl(''); setNotice(''); }} disabled={busy} className="absolute left-3 top-3 inline-flex min-h-9 items-center rounded-full bg-black/55 px-3 text-[10px] font-black text-white backdrop-blur">{ui.removePhoto}</button>}
              </div>
            ) : !post && (
              <label className="mt-3 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-[#cfc8bf] bg-[#f7f4ef] text-[10px] font-black text-[#6f747c]">
                <Camera size={22} className="text-[#ff5b4f]" /> {ui.addPhoto}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} />
              </label>
            )}
          </div>

          <label className="mt-6 block text-[12px] font-black text-[#173e78]">{ui.title}
            <input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} maxLength={120} placeholder={ui.titlePlaceholder} className="mt-2 min-h-12 w-full rounded-2xl border border-[#e2ddd5] bg-white px-4 text-[12px] font-semibold outline-none" />
            <span className="mt-1 block text-right text-[9px] font-medium text-[#98938d]">{form.title.length}/120</span>
          </label>

          <label className="mt-4 block text-[12px] font-black text-[#173e78]">{ui.content}
            <textarea value={form.content} onChange={event => setForm(current => ({ ...current, content: event.target.value }))} maxLength={5000} placeholder={ui.contentPlaceholder} className="mt-2 min-h-40 w-full resize-none rounded-2xl border border-[#e2ddd5] bg-white p-4 text-[12px] font-semibold leading-6 outline-none" />
            <span className="mt-1 block text-right text-[9px] font-medium text-[#98938d]">{form.content.length}/5000</span>
          </label>

          {ratingEnabled && <fieldset className="mt-4 rounded-2xl border border-[#e2ddd5] bg-white p-4"><legend className="px-1 text-[12px] font-black text-[#173e78]">{ui.rating}</legend><div className="mt-1 flex justify-between">{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" onClick={() => setForm(current => ({ ...current, rating: value }))} className="grid min-h-11 min-w-11 place-items-center" aria-label={ui.points.replace('{value}', String(value))}><Star size={27} className={value <= form.rating ? 'fill-[#ff5b4f] text-[#ff5b4f]' : 'text-[#d5d0ca]'} /></button>)}</div></fieldset>}

          <p className="mt-5 rounded-2xl bg-[#fff0ed] p-4 text-[10px] font-bold leading-5 text-[#8d5550]">{ui.privacyNote}</p>
          {moderationReady === false && <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[10px] font-bold leading-5 text-amber-800" role="status">{copy.imageScanUnavailable}</p>}
          {notice && <p className="mt-3 rounded-2xl bg-[#f1eee9] p-4 text-[10px] font-bold leading-5 text-[#765b57]" role="status">{notice}</p>}

          <button type="button" onClick={() => void submit()} disabled={busy || missingPlace || !form.title.trim() || !form.content.trim()} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#ff5b4f] text-[12px] font-black text-white shadow-lg shadow-red-200/60 disabled:opacity-40">
            {busy ? <LoaderCircle size={17} className="animate-spin" /> : post ? ui.saveChanges : ui.publish}
          </button>
        </section>
      </div>
      <button type="button" onClick={requestClose} className="fixed right-3 top-3 hidden" aria-label={ui.close}><X /></button>
    </div>
  );
}
