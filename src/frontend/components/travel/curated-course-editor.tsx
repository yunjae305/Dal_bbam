'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { SkeletonBox } from '@/frontend/components/common/feedback';
import { placeCategories, type Place, type PlaceCategory, type TransportMode } from '@/shared/types';
import { plannerMessages } from '@/shared/planner-messages';
import { uiMessages } from '@/shared/ui-messages';
import { useLocale } from '@/frontend/i18n/locale-context';
import { moveScheduleItem } from '@/frontend/schedule-utils';

type Stop = { contentId: string; reason: string; stayMinutes: number };
type CourseRow = {
  id: string; title: string; description: string; transport: TransportMode; metadata?: { theme?: PlaceCategory };
  course_places: Array<{ order_index: number; reason: string | null; stay_minutes: number; places: { content_id: string; name: string } | null }>;
};

export function CuratedCourseEditor({ places }: { places: Place[] }) {
  const { locale, messages } = useLocale();
  const ui = plannerMessages[locale];
  const courseUi = uiMessages[locale].course;
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [id, setId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [theme, setTheme] = useState<PlaceCategory>('heritage');
  const [transport, setTransport] = useState<TransportMode>('walking');
  const [stops, setStops] = useState<Stop[]>([]);
  const [placeId, setPlaceId] = useState(places[0]?.contentId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch('/api/admin/courses', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message ?? ui.failed);
    setCourses(payload.data ?? []);
  }, [ui.failed]);
  useEffect(() => { void load().catch(cause => setError(String(cause.message))).finally(() => setLoaded(true)); }, [load]);

  function reset() { setId(''); setTitle(''); setDescription(''); setStops([]); setNotice(''); }
  function edit(course: CourseRow) {
    setId(course.id); setTitle(course.title); setDescription(course.description ?? ''); setTheme(course.metadata?.theme ?? 'heritage'); setTransport(course.transport);
    setStops([...course.course_places].sort((a, b) => a.order_index - b.order_index).flatMap(stop => stop.places ? [{ contentId: stop.places.content_id, reason: stop.reason ?? '', stayMinutes: stop.stay_minutes }] : []));
  }
  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/courses', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id || undefined, title, description, theme, transport, stops }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.failed);
      setId(payload.data.id); await load(); setNotice(ui.saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : ui.failed); }
    finally { setBusy(false); }
  }
  async function remove(courseId: string) {
    if (!window.confirm(ui.deleteConfirm)) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/courses?id=${encodeURIComponent(courseId)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(ui.failed);
      if (id === courseId) reset();
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : ui.failed); }
    finally { setBusy(false); }
  }
  const field = 'mt-2 min-h-11 w-full rounded-xl bg-[#f4f5f6] px-3 text-xs';
  return <section className="mx-auto max-w-[640px] px-5 py-6">
    <h1 className="text-xl font-black">{ui.adminTitle}</h1>
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-3 rounded-xl bg-green-50 p-3 text-xs text-green-800">{notice}</p>}
    <button type="button" onClick={reset} disabled={busy} className="mt-4 min-h-11 rounded-xl bg-[#eef0f3] px-4 text-xs font-bold">{ui.newCourse}</button>
    <form onSubmit={event => { event.preventDefault(); void save(); }} className="mt-4 grid gap-4 rounded-2xl bg-white p-4 shadow-sm">
      <label className="text-xs font-bold">{ui.title}<input required maxLength={80} value={title} onChange={event => setTitle(event.target.value)} className={field} /></label>
      <label className="text-xs font-bold">{ui.description}<textarea maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} className={`${field} py-3`} /></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold">{ui.theme}<select value={theme} onChange={event => setTheme(event.target.value as PlaceCategory)} className={field}>{placeCategories.map(category => <option key={category} value={category}>{messages.categories[category]}</option>)}</select></label><label className="text-xs font-bold">{courseUi.transport}<select value={transport} onChange={event => setTransport(event.target.value as TransportMode)} className={field}>{(['walking', 'car', 'public'] as const).map(mode => <option key={mode} value={mode}>{courseUi[mode]}</option>)}</select></label></div>
      <label className="text-xs font-bold">{ui.pickPlace}<select value={placeId} onChange={event => setPlaceId(event.target.value)} className={field}>{places.map(place => <option key={place.contentId} value={place.contentId}>{place.name}</option>)}</select></label>
      <button type="button" disabled={!placeId || stops.length >= 20 || busy} onClick={() => { if (stops.some(stop => stop.contentId === placeId)) { setError(ui.duplicate); return; } setStops(current => [...current, { contentId: placeId, reason: '', stayMinutes: 60 }]); }} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#eef0f3] text-xs font-bold"><Plus size={15} />{ui.stops}</button>
      <ol className="space-y-3">{stops.map((stop, index) => <li key={stop.contentId} className="rounded-xl bg-[#faf8f4] p-3">
        <p className="text-xs font-black">{index + 1}. {places.find(place => place.contentId === stop.contentId)?.name ?? stop.contentId}</p>
        <label className="mt-2 block text-[11px]">{ui.reason}<input value={stop.reason} maxLength={500} onChange={event => setStops(current => current.map((item, i) => i === index ? { ...item, reason: event.target.value } : item))} className={field} /></label>
        <label className="mt-2 block text-[11px]">{ui.stay}<input type="number" min={15} max={240} required value={stop.stayMinutes} onChange={event => setStops(current => current.map((item, i) => i === index ? { ...item, stayMinutes: Number(event.target.value) } : item))} className={field} /></label>
        <div className="mt-2 flex gap-2"><button type="button" aria-label={ui.up} disabled={index === 0 || busy} onClick={() => setStops(current => moveScheduleItem(current, index, index - 1))} className="grid h-11 w-11 place-items-center rounded-lg bg-white disabled:opacity-30"><ChevronUp size={18} /></button><button type="button" aria-label={ui.down} disabled={index === stops.length - 1 || busy} onClick={() => setStops(current => moveScheduleItem(current, index, index + 1))} className="grid h-11 w-11 place-items-center rounded-lg bg-white disabled:opacity-30"><ChevronDown size={18} /></button><button type="button" aria-label={ui.remove} disabled={busy} onClick={() => setStops(current => current.filter((_, i) => i !== index))} className="grid h-11 w-11 place-items-center rounded-lg bg-red-50 text-red-700"><Trash2 size={16} /></button></div>
      </li>)}</ol>
      <button type="submit" disabled={busy || !title.trim() || !stops.length} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#223c72] text-xs font-bold text-white disabled:opacity-40">{busy && <LoaderCircle size={14} aria-hidden="true" className="animate-spin" />}{ui.save}</button>
    </form>
    <div className="mt-6 space-y-3" aria-busy={!loaded}>{!loaded ? Array.from({ length: 2 }, (_, index) => <SkeletonBox key={index} className="h-24 w-full" />) : courses.map(course => <article key={course.id} className="rounded-xl bg-white p-4 shadow-sm"><h2 className="text-sm font-bold">{course.title}</h2><div className="mt-3 flex gap-3"><button type="button" disabled={busy} onClick={() => edit(course)} className="min-h-11 rounded-lg bg-[#eef0f3] px-4 text-xs font-bold">{ui.edit}</button><button type="button" disabled={busy} onClick={() => void remove(course.id)} className="min-h-11 rounded-lg bg-red-50 px-4 text-xs font-bold text-red-700">{ui.remove}</button></div></article>)}</div>
  </section>;
}
