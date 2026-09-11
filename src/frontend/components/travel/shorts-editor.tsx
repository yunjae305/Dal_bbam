'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Film, Loader2, Play, Plus } from 'lucide-react';
import { useLocale } from '@/frontend/i18n/locale-context';
import { languages, type Lang, type Place } from '@/shared/types';
import type { AdminShortItem } from '@/shared/admin-shorts';
import { shortsAdminMessages } from '@/shared/shorts-admin-messages';
import { resolveShortVideoSource } from '@/shared/shorts-video';

const languageLabels: Record<Lang, string> = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文' };
type Filter = 'all' | 'published' | 'draft';
type EditorFields = {
  id: string; contentId: string; title: string; summary: string; lang: Lang; videoUrl: string;
  imageUrl: string; durationSeconds: string; tags: string; narration: string; isPublished: boolean;
};

function blankFields(contentId: string, lang: Lang): EditorFields {
  return { id: '', contentId, title: '', summary: '', lang, videoUrl: '', imageUrl: '', durationSeconds: '60', tags: '', narration: '', isPublished: false };
}

function fieldsFrom(item: AdminShortItem): EditorFields {
  return {
    id: item.id, contentId: item.contentId, title: item.title, summary: item.summary, lang: item.lang,
    videoUrl: item.youtubeVideoId ? `https://www.youtube.com/watch?v=${item.youtubeVideoId}` : item.videoUrl ?? '',
    imageUrl: item.imageUrl ?? '', durationSeconds: String(item.durationSeconds), tags: item.tags.join(', '),
    narration: item.narration, isPublished: item.isPublished
  };
}

function validPoster(value: string) {
  if (!value) return true;
  if (value.length > 2048 || value.startsWith('//')) return false;
  try {
    const base = 'https://dal-bbam.invalid';
    const parsed = new URL(value, base);
    return !parsed.username && !parsed.password && (value.startsWith('/') ? parsed.origin === base : /^https:\/\//i.test(value) && parsed.protocol === 'https:');
  } catch { return false; }
}

export function ShortsEditor({ places }: { places: Place[] }) {
  const { locale } = useLocale();
  const ui = shortsAdminMessages[locale];
  const defaultPlace = places.find(place => place.category === 'heritage')?.contentId ?? places[0]?.contentId ?? '';
  const [form, setForm] = useState(() => blankFields(defaultPlace, locale));
  const [items, setItems] = useState<AdminShortItem[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const source = resolveShortVideoSource({ videoUrl: form.videoUrl });

  const load = useCallback(async (offset = 0, signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/admin/shorts?limit=20&offset=${offset}&status=${filter}`, { cache: 'no-store', signal });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.data)) throw new Error(payload?.error?.message ?? ui.failed);
      if (signal?.aborted) return;
      setItems(current => offset ? [...new Map([...current, ...payload.data].map(item => [item.id, item])).values()] : payload.data);
      setNextOffset(typeof payload.meta?.nextOffset === 'number' ? payload.meta.nextOffset : null);
    } catch (cause) {
      if (!signal?.aborted) setListError(cause instanceof Error ? cause.message : ui.failed);
    } finally {
      if (!signal?.aborted) setListLoading(false);
    }
  }, [filter, ui.failed]);

  useEffect(() => {
    const controller = new AbortController();
    void load(0, controller.signal);
    return () => controller.abort();
  }, [load]);

  function reload(offset = 0) {
    setListLoading(true); setListError('');
    void load(offset);
  }

  function change<K extends keyof EditorFields>(key: K, value: EditorFields[K]) {
    setForm(current => ({ ...current, [key]: value }));
    if (key === 'videoUrl' || key === 'imageUrl') setShowPreview(false);
    setNotice('');
  }

  function edit(item?: AdminShortItem) {
    setForm(item ? fieldsFrom(item) : blankFields(defaultPlace, locale));
    setError(''); setNotice(''); setShowPreview(false); setPreviewFailed(false);
    titleRef.current?.focus();
  }

  function mergeSaved(item: AdminShortItem) {
    setItems(current => {
      const matching = filter === 'all' || item.isPublished === (filter === 'published');
      if (!matching) return current.filter(row => row.id !== item.id);
      return current.some(row => row.id === item.id)
        ? current.map(row => row.id === item.id ? item : row) : [item, ...current];
    });
  }

  async function write(body: Record<string, unknown>, method: 'POST' | 'PATCH'): Promise<AdminShortItem> {
    const response = await fetch('/api/admin/shorts', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok || typeof payload.data?.id !== 'string' || typeof payload.data?.isPublished !== 'boolean') {
      throw new Error(payload?.error?.message ?? ui.failed);
    }
    return payload.data;
  }

  function validateVideo() {
    if (source.kind === 'none' || /^http:/i.test(form.videoUrl.trim())) { setError(ui.invalidVideo); return false; }
    if (!validPoster(form.imageUrl.trim())) { setError(ui.invalidPoster); return false; }
    return true;
  }

  async function refreshAfterMutation() {
    // Updated timestamps and filter membership both change offset pagination.
    // Drop the old cursor even if this reload fails; retry must start at page 1.
    setNextOffset(null); setListLoading(true); setListError('');
    await load(0);
  }

  async function save() {
    setError(''); setNotice('');
    const existingNarratedPoster = form.id && !form.videoUrl.trim() && form.imageUrl.trim() && form.narration.trim();
    if (existingNarratedPoster) {
      if (!validPoster(form.imageUrl.trim())) { setError(ui.invalidPoster); return; }
    } else if (!validateVideo()) return;
    const duration = Number(form.durationSeconds);
    const tags = [...new Set(form.tags.split(',').map(tag => tag.trim()).filter(Boolean))];
    if (!form.contentId || !form.title.trim() || !form.summary.trim() || !Number.isInteger(duration) || duration < 1 || duration > 600) {
      setError(ui.invalidFields); return;
    }
    if (tags.length > 6 || tags.some(tag => tag.length > 30)) { setError(ui.invalidTags); return; }
    setBusy(true);
    try {
      const saved = await write({
        ...(form.id ? { shortId: form.id } : {}), contentId: form.contentId, lang: form.lang,
        title: form.title.trim(), summary: form.summary.trim(), narration: form.narration.trim(),
        imageUrl: form.imageUrl.trim() || null, durationSeconds: duration, tags,
        videoUrl: source.kind === 'mp4' ? source.videoUrl : null,
        youtubeVideoId: source.kind === 'youtube' ? source.youtubeVideoId : null,
        isPublished: form.id ? form.isPublished : false
      }, form.id ? 'PATCH' : 'POST');
      mergeSaved(saved); setForm(fieldsFrom(saved)); setNotice(ui.saved);
      await refreshAfterMutation();
    } catch (cause) { setError(cause instanceof Error ? cause.message : ui.failed); }
    finally { setBusy(false); }
  }

  async function togglePublished(item: AdminShortItem) {
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await write({ shortId: item.id, isPublished: !item.isPublished }, 'PATCH');
      mergeSaved(saved);
      setForm(current => current.id === saved.id ? { ...current, isPublished: saved.isPublished } : current);
      setNotice(saved.isPublished ? ui.publishedNotice : ui.draftNotice);
      await refreshAfterMutation();
    } catch (cause) { setError(cause instanceof Error ? cause.message : ui.failed); }
    finally { setBusy(false); }
  }

  const field = 'mt-2 min-h-11 w-full rounded-xl border border-[#e5e8ed] bg-[#f8f9fb] px-3 text-sm font-normal text-[#253047] outline-none focus:border-[#4f6c9c] focus:ring-2 focus:ring-[#4f6c9c]/20';
  const secondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#eef1f6] px-4 text-xs font-bold text-[#294169] transition-colors hover:bg-[#e3e9f2] disabled:opacity-40';
  const disabled = busy || listLoading;
  return <section className="mx-auto max-w-[640px] px-5 py-6 text-[#253047]">
    <Link href="/admin/courses" className="inline-flex min-h-11 items-center text-xs font-bold text-[#52688c] underline underline-offset-4">{ui.courses}</Link>
    <div className="mt-2 flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#eaf0f9] text-[#294169]"><Film size={22} /></span><h1 className="text-xl font-black tracking-tight">{ui.heading}</h1></div>
    <p className="mt-3 text-sm leading-6 text-[#647085]">{ui.description}</p>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    <button type="button" onClick={() => edit()} disabled={disabled} className={`${secondary} mt-5`}><Plus size={16} />{ui.newVideo}</button>
    <form aria-label={ui.heading} onSubmit={event => { event.preventDefault(); void save(); }} className="mt-4 rounded-2xl border border-[#e5e8ed] bg-white p-4 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-3"><p className="text-xs font-semibold text-[#647085]">{ui.status}</p><span className={`rounded-full px-3 py-1 text-xs font-bold ${form.isPublished ? 'bg-green-50 text-green-800' : 'bg-[#eef1f6] text-[#52617a]'}`}>{form.isPublished ? ui.published : ui.draft}</span></div>
      <fieldset disabled={disabled} className="grid min-w-0 gap-4">
        <label className="text-xs font-bold">{ui.place}<select required value={form.contentId} onChange={event => change('contentId', event.target.value)} className={field}>
          {!places.length && <option value="">{ui.noPlaces}</option>}
          {form.contentId && !places.some(place => place.contentId === form.contentId) && <option value={form.contentId}>{form.contentId}</option>}
          {places.map(place => <option key={place.contentId} value={place.contentId}>{place.name}</option>)}
        </select></label>
        <label className="text-xs font-bold">{ui.title}<input ref={titleRef} required maxLength={120} value={form.title} onChange={event => change('title', event.target.value)} className={field} /></label>
        <label className="text-xs font-bold">{ui.summary}<textarea required maxLength={600} rows={3} value={form.summary} onChange={event => change('summary', event.target.value)} className={`${field} resize-y py-3`} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-bold">{ui.language}<select value={form.lang} onChange={event => change('lang', event.target.value as Lang)} className={field}>{languages.map(lang => <option key={lang} value={lang}>{languageLabels[lang]}</option>)}</select></label>
          <label className="text-xs font-bold">{ui.duration}<input required type="number" min={1} max={600} step={1} value={form.durationSeconds} onChange={event => change('durationSeconds', event.target.value)} className={field} /></label>
        </div>
        <label className="text-xs font-bold">{ui.videoUrl}<input required={!form.id} type="text" inputMode="url" maxLength={2048} spellCheck={false} value={form.videoUrl} onChange={event => change('videoUrl', event.target.value)} aria-describedby="short-video-hint" className={field} /><span id="short-video-hint" className="mt-2 block text-xs font-normal leading-5 text-[#647085]">{ui.videoHint}{form.id && <span className="mt-1 block">{ui.existingMediaHint}</span>}</span></label>
        <label className="text-xs font-bold">{ui.poster}<input type="text" inputMode="url" maxLength={2048} spellCheck={false} value={form.imageUrl} onChange={event => change('imageUrl', event.target.value)} aria-describedby="short-poster-hint" className={field} /><span id="short-poster-hint" className="mt-2 block text-xs font-normal leading-5 text-[#647085]">{ui.posterHint}</span></label>
        <label className="text-xs font-bold">{ui.tags}<input maxLength={190} value={form.tags} onChange={event => change('tags', event.target.value)} aria-describedby="short-tags-hint" className={field} /><span id="short-tags-hint" className="mt-2 block text-xs font-normal leading-5 text-[#647085]">{ui.tagsHint}</span></label>
        <label className="text-xs font-bold">{ui.transcript}<textarea maxLength={6000} rows={4} value={form.narration} onChange={event => change('narration', event.target.value)} aria-describedby="short-transcript-hint" className={`${field} resize-y py-3`} /><span id="short-transcript-hint" className="mt-2 block text-xs font-normal leading-5 text-[#647085]">{ui.transcriptHint}</span></label>
        <button type="submit" disabled={disabled || !form.contentId} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#223c72] px-4 text-sm font-bold text-white transition-colors hover:bg-[#182d58] disabled:opacity-40">{busy && <Loader2 size={16} className="animate-spin" />}{busy ? ui.saving : form.id ? ui.save : ui.saveDraft}</button>
      </fieldset>
      <div className="mt-5 border-t border-[#edf0f4] pt-4">
        <button type="button" disabled={busy} aria-expanded={showPreview} aria-controls="short-admin-preview" onClick={() => { setError(''); if (showPreview) { setShowPreview(false); return; } if (validateVideo()) { setPreviewFailed(false); setShowPreview(true); } }} className={secondary}><Play size={15} />{showPreview ? ui.closePreview : ui.preview}</button>
        <p className="mt-2 text-xs leading-5 text-[#647085]">{ui.previewHint}</p>
        {showPreview && <div id="short-admin-preview" className="mt-3 overflow-hidden rounded-xl bg-[#172132]">
          {source.kind === 'mp4' && <video controls playsInline preload="metadata" src={source.videoUrl} poster={form.imageUrl.trim() || undefined} aria-label={ui.preview} onError={() => setPreviewFailed(true)} className="mx-auto max-h-[480px] w-full" />}
          {source.kind === 'youtube' && <iframe title={ui.preview} src={`https://www.youtube-nocookie.com/embed/${source.youtubeVideoId}?playsinline=1&rel=0`} allow="encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen onError={() => setPreviewFailed(true)} className="aspect-video w-full border-0" />}
          {previewFailed && <p role="alert" className="p-3 text-sm text-white">{ui.previewFailed}</p>}
        </div>}
      </div>
    </form>
    <div className="mt-8 flex items-center justify-between gap-3"><h2 className="text-base font-black">{ui.library}</h2><label className="text-xs font-bold"><span className="sr-only">{ui.status}</span><select value={filter} disabled={disabled} onChange={event => { setListLoading(true); setListError(''); setFilter(event.target.value as Filter); }} className="min-h-11 rounded-xl border border-[#e5e8ed] bg-white px-3 text-xs font-semibold"><option value="all">{ui.all}</option><option value="draft">{ui.draft}</option><option value="published">{ui.published}</option></select></label></div>
    {listError && <div className="mt-3 rounded-xl bg-red-50 p-3"><p role="alert" className="text-sm text-red-800">{listError}</p><button type="button" disabled={listLoading || busy} onClick={() => reload()} className={`${secondary} mt-2`}>{ui.retry}</button></div>}
    {!listLoading && !listError && !items.length && <p className="py-6 text-sm text-[#647085]">{ui.empty}</p>}
    <div className="mt-3 space-y-3">{items.map(item => <article key={item.id} className="rounded-2xl border border-[#e5e8ed] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3"><h3 className="min-w-0 break-words text-sm font-bold">{item.title}</h3><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${item.isPublished ? 'bg-green-50 text-green-800' : 'bg-[#eef1f6] text-[#52617a]'}`}>{item.isPublished ? ui.published : ui.draft}</span></div>
      <p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-[#647085]">{item.summary}</p>
      <p className="mt-2 text-xs text-[#647085]">{places.find(place => place.contentId === item.contentId)?.name ?? item.contentId} · {languageLabels[item.lang]} · {item.durationSeconds}{ui.seconds}</p>
      {item.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{item.tags.map(tag => <span key={tag} className="max-w-full break-words rounded-md bg-[#f3f5f8] px-2 py-1 text-[11px] text-[#52617a]">#{tag}</span>)}</div>}
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={disabled} onClick={() => edit(item)} className={secondary}>{ui.edit}</button><button type="button" disabled={disabled} onClick={() => void togglePublished(item)} className="min-h-11 rounded-xl border border-[#d4ddea] px-4 text-xs font-bold text-[#294169] hover:bg-[#f3f6fb] disabled:opacity-40">{item.isPublished ? ui.unpublish : ui.publish}</button></div>
    </article>)}</div>
    {listLoading && <p role="status" className="py-4 text-center text-sm text-[#647085]">{ui.loading}</p>}
    {nextOffset !== null && <button type="button" disabled={disabled} onClick={() => reload(nextOffset)} className={`${secondary} mt-4 w-full`}>{ui.loadMore}</button>}
  </section>;
}
