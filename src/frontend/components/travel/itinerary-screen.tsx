'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CalendarDays, ChevronDown, ChevronUp, GripVertical, LoaderCircle, Pencil, Plus, Share2, Trash2, X } from 'lucide-react';
import type { Place } from '@/shared/types';
import { PhoneStatus, HeaderBar } from '@/frontend/components/common/ui';
import { EmptyState } from '@/frontend/components/common/feedback';
import { dateRange, moveScheduleItem, todayLocalDate } from '@/frontend/schedule-utils';
import { useLocale } from '@/frontend/i18n/locale-context';
import { uiMessages } from '@/shared/ui-messages';
import { plannerMessages } from '@/shared/planner-messages';

type Props = { places: Place[] };
type RawScheduleItem = {
  id?: string;
  visit_date: string;
  start_time?: string | null;
  stay_minutes: number;
  sort_order: number;
  note?: string | null;
  places: {
    content_id: string;
    name: string;
    image_url?: string | null;
  };
};
type RawSchedule = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  share_token?: string | null;
  schedule_places: RawScheduleItem[];
};

export function ItineraryScreen({ places }: Props) {
  const { locale } = useLocale();
  const ui = uiMessages[locale].itinerary;
  const planner = plannerMessages[locale];
  const searchParams = useSearchParams();
  const [schedules, setSchedules] = useState<RawSchedule[]>([]);
  const [activeId, setActiveId] = useState(searchParams.get('id') ?? '');
  const [mode, setMode] = useState<'timeline' | 'calendar'>('timeline');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [touchDrag, setTouchDrag] = useState<{ from: number; over: number } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [placeToAdd, setPlaceToAdd] = useState(places[0]?.contentId ?? '');
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftStartDate, setDraftStartDate] = useState('');
  const [draftEndDate, setDraftEndDate] = useState('');

  const active = schedules.find(schedule => schedule.id === activeId) ?? schedules[0];
  const sortedItems = useMemo(
    () => [...(active?.schedule_places ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [active]
  );
  const tripDays = useMemo(
    () => active ? dateRange(active.start_date, active.end_date) : [],
    [active]
  );

  useEffect(() => {
    setDraftTitle(active?.title ?? '');
    setDraftStartDate(active?.start_date ?? '');
    setDraftEndDate(active?.end_date ?? '');
    setEditing(false);
  }, [active?.id, active?.title, active?.start_date, active?.end_date]);

  async function loadSchedules() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/schedules', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.loadFailed);
      setSchedules(payload.data);
      setActiveId((current: string) => current || payload.data[0]?.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ui.loadFailed);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadSchedules(); }, []);

  async function createSchedule() {
    const today = todayLocalDate();
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: ui.defaultTitle, startDate: today, endDate: today })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.createFailed);
      setSchedules(current => [{ ...payload.data, schedule_places: [] }, ...current]);
      setActiveId(payload.data.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ui.createFailed);
    } finally {
      setSaving(false);
    }
  }

  async function persistItems(nextItems: RawScheduleItem[]) {
    if (!active) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/schedules/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: nextItems.map(item => ({
            contentId: item.places.content_id,
            visitDate: item.visit_date,
            startTime: item.start_time?.slice(0, 5) || undefined,
            stayMinutes: item.stay_minutes,
            note: item.note || undefined
          }))
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.saveOrderFailed);
      setSchedules(current => current.map(schedule => schedule.id === active.id ? payload.data : schedule));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ui.saveFailed;
      await loadSchedules();
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function addPlace() {
    if (!active || !placeToAdd || sortedItems.some(item => item.places.content_id === placeToAdd)) return;
    const place = places.find(item => item.contentId === placeToAdd);
    if (!place) return;
    const next: RawScheduleItem[] = [...sortedItems, {
      visit_date: active.start_date,
      start_time: undefined,
      stay_minutes: 60,
      sort_order: sortedItems.length,
      places: {
        content_id: place.contentId,
        name: place.name,
        image_url: place.image
      }
    }];
    void persistItems(next);
  }

  function dropAt(targetIndex: number) {
    if (saving || dragIndex === null || dragIndex === targetIndex) return;
    const next = moveScheduleItem(sortedItems, dragIndex, targetIndex);
    setDragIndex(null);
    setSchedules(current => current.map(schedule =>
      schedule.id === active?.id
        ? { ...schedule, schedule_places: next.map((item, index) => ({ ...item, sort_order: index })) }
        : schedule
    ));
    void persistItems(next);
  }

  // HTML5 drag events never fire on touch screens, so the grip handle also
  // supports pointer-based dragging for the PWA use case.
  function startTouchDrag(event: React.PointerEvent, index: number) {
    if (saving || event.pointerType === 'mouse') return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setTouchDrag({ from: index, over: index });
  }

  function updateTouchDrag(event: React.PointerEvent) {
    if (!touchDrag || !listRef.current) return;
    const rows = Array.from(listRef.current.querySelectorAll('li'));
    if (!rows.length) return;
    const y = event.clientY;
    let over = touchDrag.over;
    rows.forEach((row, index) => {
      const rect = row.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) over = index;
    });
    if (y < rows[0].getBoundingClientRect().top) over = 0;
    if (y > rows[rows.length - 1].getBoundingClientRect().bottom) over = rows.length - 1;
    if (over !== touchDrag.over) setTouchDrag({ ...touchDrag, over });
  }

  function endTouchDrag() {
    if (!touchDrag) return;
    const { from, over } = touchDrag;
    setTouchDrag(null);
    if (from !== over) moveAt(from, over);
  }

  function moveAt(index: number, targetIndex: number) {
    if (saving) return;
    const next = moveScheduleItem(sortedItems, index, targetIndex);
    if (next === sortedItems) return;
    setSchedules(current => current.map(schedule =>
      schedule.id === active?.id
        ? { ...schedule, schedule_places: next.map((item, sortOrder) => ({ ...item, sort_order: sortOrder })) }
        : schedule
    ));
    void persistItems(next);
  }

  function updateItem(index: number, patch: Partial<Pick<RawScheduleItem, 'visit_date' | 'start_time' | 'stay_minutes' | 'note'>>) {
    if (saving) return;
    const next = sortedItems.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    setSchedules(current => current.map(schedule =>
      schedule.id === active?.id ? { ...schedule, schedule_places: next } : schedule
    ));
    void persistItems(next);
  }

  async function updateScheduleMetadata() {
    if (!active) return;
    if (!draftTitle.trim() || !draftStartDate || !draftEndDate || draftEndDate < draftStartDate) {
      setError(ui.invalidMetadata);
      return;
    }
    setSaving(true);
    setError('');
    const adjustedItems = sortedItems.map(item => ({
      ...item,
      visit_date: item.visit_date < draftStartDate || item.visit_date > draftEndDate
        ? draftStartDate
        : item.visit_date
    }));
    try {
      const response = await fetch(`/api/schedules/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draftTitle.trim(),
          startDate: draftStartDate,
          endDate: draftEndDate,
          items: adjustedItems.map(item => ({
            contentId: item.places.content_id,
            visitDate: item.visit_date,
            startTime: item.start_time?.slice(0, 5) || undefined,
            stayMinutes: item.stay_minutes,
            note: item.note || undefined
          }))
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.updateFailed);
      setSchedules(current => current.map(schedule => schedule.id === active.id ? payload.data : schedule));
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ui.updateFailed);
    } finally {
      setSaving(false);
    }
  }

  async function deleteSchedule() {
    if (!active || !window.confirm(ui.deleteConfirm.replace('{title}', active.title))) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/schedules/${active.id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.deleteFailed);
      const remaining = schedules.filter(schedule => schedule.id !== active.id);
      setSchedules(remaining);
      setActiveId(remaining[0]?.id ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ui.deleteFailed);
    } finally {
      setSaving(false);
    }
  }

  async function share() {
    if (!active?.share_token) return;
    const url = `${window.location.origin}/schedule/share/${active.share_token}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: active.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setNotice(ui.copied);
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(ui.shareFailed);
    }
  }

  return (
    <section className="min-h-[calc(100dvh-40px)] bg-[#fbfaf8]">
      <PhoneStatus />
      <HeaderBar
        title={active?.title ?? ui.header}
        subtitle={active ? ui.subtitle.replace('{start}', active.start_date).replace('{end}', active.end_date).replace('{count}', String(sortedItems.length)) : undefined}
        right={active ? <button type="button" onClick={share} aria-label={ui.shareLabel}><Share2 size={18} /></button> : undefined}
      />
      <div className="px-5 pb-28">
        <Link href="/courses" className="mt-3 block rounded-xl bg-[#eef0f3] p-3 text-center text-[11px] font-bold">{planner.addSchedule}</Link>
        {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-[11px] font-bold text-red-700" role="alert">{error}</p>}
        {notice && <p className="mt-3 rounded-xl bg-[#e8f2ed] p-3 text-[11px] font-bold text-[#2f7567]" role="status">{notice}</p>}
        {loading ? (
          <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin text-[#223c72]" /></div>
        ) : !active ? (
          <EmptyState
            title={ui.emptyTitle}
            description={ui.emptyDescription}
            action={<button type="button" onClick={createSchedule} disabled={saving} className="rounded-full bg-[#223c72] px-5 py-2.5 text-[11px] font-black text-white">{ui.create}</button>}
          />
        ) : (
          <>
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {schedules.map(schedule => (
                <button key={schedule.id} type="button" onClick={() => setActiveId(schedule.id)} className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-black ${schedule.id === active.id ? 'bg-[#223c72] text-white' : 'bg-[#eef0f3]'}`}>
                  {schedule.title}
                </button>
              ))}
              <button type="button" onClick={createSchedule} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eef0f3]" aria-label={ui.newSchedule}><Plus size={15} /></button>
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(value => !value)} className="inline-flex items-center gap-1 rounded-full bg-[#eef0f3] px-3 py-2 text-[10px] font-black">
                {editing ? <X size={13} /> : <Pencil size={13} />} {editing ? ui.close : ui.edit}
              </button>
              <button type="button" onClick={deleteSchedule} disabled={saving} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-2 text-[10px] font-black text-red-700 disabled:opacity-50">
                <Trash2 size={13} /> {ui.delete}
              </button>
            </div>

            {editing && (
              <div className="mt-3 grid gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <label className="grid gap-1 text-[10px] font-black">
                  {ui.title}
                  <input value={draftTitle} onChange={event => setDraftTitle(event.target.value)} maxLength={80} className="h-10 rounded-xl bg-[#f4f5f6] px-3 text-[11px] outline-none focus:ring-2 focus:ring-[#223c72]" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-[10px] font-black">
                    {ui.startDate}
                    <input type="date" value={draftStartDate} onChange={event => setDraftStartDate(event.target.value)} className="h-10 min-w-0 rounded-xl bg-[#f4f5f6] px-2 text-[10px]" />
                  </label>
                  <label className="grid gap-1 text-[10px] font-black">
                    {ui.endDate}
                    <input type="date" value={draftEndDate} min={draftStartDate} onChange={event => setDraftEndDate(event.target.value)} className="h-10 min-w-0 rounded-xl bg-[#f4f5f6] px-2 text-[10px]" />
                  </label>
                </div>
                <button type="button" onClick={updateScheduleMetadata} disabled={saving} className="h-10 rounded-xl bg-[#223c72] text-[11px] font-black text-white disabled:opacity-50">
                  {saving ? ui.saving : ui.saveChanges}
                </button>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 rounded-xl bg-[#eef0f3] p-1">
              <button type="button" onClick={() => setMode('timeline')} className={`rounded-lg py-2 text-[10px] font-black ${mode === 'timeline' ? 'bg-white shadow-sm' : ''}`}>{ui.timeline}</button>
              <button type="button" onClick={() => setMode('calendar')} className={`rounded-lg py-2 text-[10px] font-black ${mode === 'calendar' ? 'bg-white shadow-sm' : ''}`}>{ui.calendar}</button>
            </div>

            {mode === 'calendar' ? (
              <div className="mt-4 space-y-3">
                {tripDays.map(day => {
                  const dayItems = sortedItems.filter(item => item.visit_date === day);
                  return (
                    <section key={day} className="rounded-2xl bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-2 text-[12px] font-black"><CalendarDays size={16} /> {day}</div>
                      <div className="mt-3 space-y-2">
                        {dayItems.length ? dayItems.map(item => (
                          <p key={item.places.content_id} className="rounded-xl bg-[#f4f5f6] p-3 text-[11px] font-bold">
                            {item.start_time?.slice(0, 5) || ui.timeUndecided} · {item.places.name}
                          </p>
                        )) : <p className="py-2 text-[10px] text-[#8d95a1]">{ui.noPlaces}</p>}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <ol ref={listRef} className="mt-4 space-y-3">
                {sortedItems.map((item, index) => (
                  <li
                    key={`${item.places.content_id}-${index}`}
                    draggable={!saving}
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={event => event.preventDefault()}
                    onDrop={() => dropAt(index)}
                    className={`grid grid-cols-[28px_52px_1fr_58px] items-center gap-3 rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5 transition-shadow ${
                      touchDrag?.from === index ? 'opacity-70 ring-2 ring-[#223c72]' : ''
                    } ${touchDrag && touchDrag.over === index && touchDrag.from !== index ? 'ring-2 ring-[#ff5b4f]' : ''}`}
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-[#223c72] text-[10px] font-black text-white">{index + 1}</span>
                    <img src={item.places.image_url || '/login-spring-bg.png'} alt={item.places.name} className="h-12 w-[52px] rounded-lg object-cover" />
                    <div className="min-w-0">
                      <h3 className="truncate text-[12px] font-black">{item.places.name}</h3>
                      <p className="mt-1 text-[9px] text-[#8d95a1]">{ui.minutes.replace('{minutes}', String(item.stay_minutes))}</p>
                      <label className="mt-2 block text-[9px] text-[#68716e]">{planner.stay}<select disabled={saving} aria-label={`${item.places.name} ${planner.stay}`} value={item.stay_minutes} onChange={event => updateItem(index, { stay_minutes: Number(event.target.value) })} className="ml-1 min-h-10 rounded bg-[#f4f5f6] text-[10px]">{Array.from(new Set([15, 30, 45, 60, 90, 120, 180, 240, item.stay_minutes])).sort((a, b) => a - b).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                      <div className="mt-1 flex gap-1">
                        <select value={item.visit_date} onChange={event => updateItem(index, { visit_date: event.target.value })} aria-label={ui.visitDate.replace('{name}', item.places.name)} className="min-w-0 max-w-[110px] rounded bg-[#f4f5f6] px-1 py-1 text-[8px]">
                          {tripDays.map(day => <option key={day} value={day}>{day}</option>)}
                        </select>
                        <input type="time" value={item.start_time?.slice(0, 5) ?? ''} onChange={event => updateItem(index, { start_time: event.target.value || null })} aria-label={ui.visitTime.replace('{name}', item.places.name)} className="min-w-0 max-w-[74px] rounded bg-[#f4f5f6] px-1 py-1 text-[8px]" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <button type="button" onClick={() => moveAt(index, index - 1)} disabled={saving || index === 0} className="grid h-8 place-items-center rounded-lg bg-[#eef0f3] disabled:opacity-30" aria-label={ui.moveUp.replace('{name}', item.places.name)}><ChevronUp size={14} /></button>
                      <button type="button" onClick={() => moveAt(index, index + 1)} disabled={saving || index === sortedItems.length - 1} className="grid h-8 place-items-center rounded-lg bg-[#eef0f3] disabled:opacity-30" aria-label={ui.moveDown.replace('{name}', item.places.name)}><ChevronDown size={14} /></button>
                      <button
                        type="button"
                        onPointerDown={event => startTouchDrag(event, index)}
                        onPointerMove={updateTouchDrag}
                        onPointerUp={endTouchDrag}
                        onPointerCancel={() => setTouchDrag(null)}
                        className="col-span-2 grid h-8 w-full touch-none place-items-center rounded-lg bg-[#f7f8f9] text-[#a9afb7]"
                        aria-label={ui.drag.replace('{name}', item.places.name)}
                      >
                        <GripVertical size={15} />
                      </button>
                      <button type="button" disabled={saving} onClick={() => void persistItems(sortedItems.filter((_, itemIndex) => itemIndex !== index))} aria-label={planner.removePlace.replace('{name}', item.places.name)} className="col-span-2 grid min-h-11 place-items-center rounded-lg bg-red-50 text-red-700 disabled:opacity-40"><Trash2 size={15} /></button>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-4 flex gap-2">
              <select value={placeToAdd} aria-label={planner.pickPlace} onChange={event => setPlaceToAdd(event.target.value)} className="h-11 min-w-0 flex-1 rounded-xl bg-white px-3 text-[11px] font-bold ring-1 ring-black/5">
                {places.map(place => <option key={place.contentId} value={place.contentId}>{place.name}</option>)}
              </select>
              <button type="button" onClick={addPlace} disabled={saving} className="flex h-11 items-center gap-1 rounded-xl bg-[#ff5b4f] px-4 text-[11px] font-black text-white disabled:opacity-50">
                {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />} {ui.add}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
