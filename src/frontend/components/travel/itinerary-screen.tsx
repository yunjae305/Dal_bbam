'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, GripVertical, LoaderCircle, Pencil, Plus, Share2, Trash2, X } from 'lucide-react';
import type { Place } from '@/shared/types';
import { PhoneStatus, HeaderBar } from '@/frontend/components/common/ui';
import { EmptyState } from '@/frontend/components/common/feedback';
import { dateRange, moveScheduleItem } from '@/frontend/schedule-utils';

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
  const [schedules, setSchedules] = useState<RawSchedule[]>([]);
  const [activeId, setActiveId] = useState('');
  const [mode, setMode] = useState<'timeline' | 'calendar'>('timeline');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
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
      if (!response.ok) throw new Error(payload?.error?.message ?? '일정을 불러오지 못했습니다.');
      setSchedules(payload.data);
      setActiveId((current: string) => current || payload.data[0]?.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '일정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadSchedules(); }, []);

  async function createSchedule() {
    const today = new Date().toISOString().slice(0, 10);
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '나의 경주 여행', startDate: today, endDate: today })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '일정을 만들 수 없습니다.');
      setSchedules(current => [{ ...payload.data, schedule_places: [] }, ...current]);
      setActiveId(payload.data.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '일정을 만들 수 없습니다.');
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
            startTime: item.start_time || undefined,
            stayMinutes: item.stay_minutes,
            note: item.note || undefined
          }))
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '일정 순서를 저장하지 못했습니다.');
      setSchedules(current => current.map(schedule => schedule.id === active.id ? payload.data : schedule));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '일정을 저장하지 못했습니다.');
      await loadSchedules();
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
    if (dragIndex === null || dragIndex === targetIndex) return;
    const next = moveScheduleItem(sortedItems, dragIndex, targetIndex);
    setDragIndex(null);
    setSchedules(current => current.map(schedule =>
      schedule.id === active?.id
        ? { ...schedule, schedule_places: next.map((item, index) => ({ ...item, sort_order: index })) }
        : schedule
    ));
    void persistItems(next);
  }

  function moveAt(index: number, targetIndex: number) {
    const next = moveScheduleItem(sortedItems, index, targetIndex);
    if (next === sortedItems) return;
    setSchedules(current => current.map(schedule =>
      schedule.id === active?.id
        ? { ...schedule, schedule_places: next.map((item, sortOrder) => ({ ...item, sort_order: sortOrder })) }
        : schedule
    ));
    void persistItems(next);
  }

  function updateItem(index: number, patch: Partial<Pick<RawScheduleItem, 'visit_date' | 'start_time'>>) {
    const next = sortedItems.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    setSchedules(current => current.map(schedule =>
      schedule.id === active?.id ? { ...schedule, schedule_places: next } : schedule
    ));
    void persistItems(next);
  }

  async function updateScheduleMetadata() {
    if (!active) return;
    if (!draftTitle.trim() || !draftStartDate || !draftEndDate || draftEndDate < draftStartDate) {
      setError('올바른 제목과 시작일·종료일을 입력해 주세요.');
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
            startTime: item.start_time || undefined,
            stayMinutes: item.stay_minutes,
            note: item.note || undefined
          }))
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '일정을 수정하지 못했습니다.');
      setSchedules(current => current.map(schedule => schedule.id === active.id ? payload.data : schedule));
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '일정을 수정하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSchedule() {
    if (!active || !window.confirm(`“${active.title}” 일정을 삭제할까요?`)) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/schedules/${active.id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '일정을 삭제하지 못했습니다.');
      const remaining = schedules.filter(schedule => schedule.id !== active.id);
      setSchedules(remaining);
      setActiveId(remaining[0]?.id ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '일정을 삭제하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function share() {
    if (!active?.share_token) return;
    const url = `${window.location.origin}/schedule/share/${active.share_token}`;
    if (navigator.share) await navigator.share({ title: active.title, url });
    else await navigator.clipboard.writeText(url);
  }

  return (
    <section className="min-h-[calc(100dvh-40px)] bg-[#fbfaf8]">
      <PhoneStatus />
      <HeaderBar
        title={active?.title ?? '내 일정'}
        subtitle={active ? `${active.start_date} ~ ${active.end_date} · 장소 ${sortedItems.length}곳` : undefined}
        right={active ? <button type="button" onClick={share} aria-label="일정 공유"><Share2 size={18} /></button> : undefined}
      />
      <div className="px-5 pb-28">
        {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-[11px] font-bold text-red-700" role="alert">{error}</p>}
        {loading ? (
          <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin text-[#223c72]" /></div>
        ) : !active ? (
          <EmptyState
            title="아직 일정이 없어요"
            description="새 일정을 만들고 장바구니의 장소를 추가해 보세요."
            action={<button type="button" onClick={createSchedule} disabled={saving} className="rounded-full bg-[#223c72] px-5 py-2.5 text-[11px] font-black text-white">일정 만들기</button>}
          />
        ) : (
          <>
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {schedules.map(schedule => (
                <button key={schedule.id} type="button" onClick={() => setActiveId(schedule.id)} className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-black ${schedule.id === active.id ? 'bg-[#223c72] text-white' : 'bg-[#eef0f3]'}`}>
                  {schedule.title}
                </button>
              ))}
              <button type="button" onClick={createSchedule} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eef0f3]" aria-label="새 일정"><Plus size={15} /></button>
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(value => !value)} className="inline-flex items-center gap-1 rounded-full bg-[#eef0f3] px-3 py-2 text-[10px] font-black">
                {editing ? <X size={13} /> : <Pencil size={13} />} {editing ? '닫기' : '일정 수정'}
              </button>
              <button type="button" onClick={deleteSchedule} disabled={saving} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-2 text-[10px] font-black text-red-700 disabled:opacity-50">
                <Trash2 size={13} /> 삭제
              </button>
            </div>

            {editing && (
              <div className="mt-3 grid gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <label className="grid gap-1 text-[10px] font-black">
                  일정 제목
                  <input value={draftTitle} onChange={event => setDraftTitle(event.target.value)} maxLength={80} className="h-10 rounded-xl bg-[#f4f5f6] px-3 text-[11px] outline-none focus:ring-2 focus:ring-[#223c72]" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-[10px] font-black">
                    시작일
                    <input type="date" value={draftStartDate} onChange={event => setDraftStartDate(event.target.value)} className="h-10 min-w-0 rounded-xl bg-[#f4f5f6] px-2 text-[10px]" />
                  </label>
                  <label className="grid gap-1 text-[10px] font-black">
                    종료일
                    <input type="date" value={draftEndDate} min={draftStartDate} onChange={event => setDraftEndDate(event.target.value)} className="h-10 min-w-0 rounded-xl bg-[#f4f5f6] px-2 text-[10px]" />
                  </label>
                </div>
                <button type="button" onClick={updateScheduleMetadata} disabled={saving} className="h-10 rounded-xl bg-[#223c72] text-[11px] font-black text-white disabled:opacity-50">
                  {saving ? '저장 중…' : '변경 저장'}
                </button>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 rounded-xl bg-[#eef0f3] p-1">
              <button type="button" onClick={() => setMode('timeline')} className={`rounded-lg py-2 text-[10px] font-black ${mode === 'timeline' ? 'bg-white shadow-sm' : ''}`}>타임라인</button>
              <button type="button" onClick={() => setMode('calendar')} className={`rounded-lg py-2 text-[10px] font-black ${mode === 'calendar' ? 'bg-white shadow-sm' : ''}`}>캘린더</button>
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
                            {item.start_time?.slice(0, 5) || '시간 미정'} · {item.places.name}
                          </p>
                        )) : <p className="py-2 text-[10px] text-[#8d95a1]">아직 추가한 장소가 없습니다.</p>}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <ol className="mt-4 space-y-3">
                {sortedItems.map((item, index) => (
                  <li
                    key={`${item.places.content_id}-${index}`}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={event => event.preventDefault()}
                    onDrop={() => dropAt(index)}
                    className="grid grid-cols-[28px_52px_1fr_58px] items-center gap-3 rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-[#223c72] text-[10px] font-black text-white">{index + 1}</span>
                    <img src={item.places.image_url || '/login-spring-bg.png'} alt={item.places.name} className="h-12 w-[52px] rounded-lg object-cover" />
                    <div className="min-w-0">
                      <h3 className="truncate text-[12px] font-black">{item.places.name}</h3>
                      <p className="mt-1 text-[9px] text-[#8d95a1]">{item.stay_minutes}분</p>
                      <div className="mt-1 flex gap-1">
                        <select value={item.visit_date} onChange={event => updateItem(index, { visit_date: event.target.value })} aria-label={`${item.places.name} 방문일`} className="min-w-0 max-w-[110px] rounded bg-[#f4f5f6] px-1 py-1 text-[8px]">
                          {tripDays.map(day => <option key={day} value={day}>{day}</option>)}
                        </select>
                        <input type="time" value={item.start_time?.slice(0, 5) ?? ''} onChange={event => updateItem(index, { start_time: event.target.value || null })} aria-label={`${item.places.name} 방문 시간`} className="min-w-0 max-w-[74px] rounded bg-[#f4f5f6] px-1 py-1 text-[8px]" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <button type="button" onClick={() => moveAt(index, index - 1)} disabled={saving || index === 0} className="grid h-8 place-items-center rounded-lg bg-[#eef0f3] disabled:opacity-30" aria-label={`${item.places.name} 위로 이동`}><ChevronUp size={14} /></button>
                      <button type="button" onClick={() => moveAt(index, index + 1)} disabled={saving || index === sortedItems.length - 1} className="grid h-8 place-items-center rounded-lg bg-[#eef0f3] disabled:opacity-30" aria-label={`${item.places.name} 아래로 이동`}><ChevronDown size={14} /></button>
                      <GripVertical size={15} className="col-span-2 mx-auto text-[#a9afb7]" aria-label="데스크톱에서는 드래그하여 순서 변경" />
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-4 flex gap-2">
              <select value={placeToAdd} onChange={event => setPlaceToAdd(event.target.value)} className="h-11 min-w-0 flex-1 rounded-xl bg-white px-3 text-[11px] font-bold ring-1 ring-black/5">
                {places.map(place => <option key={place.contentId} value={place.contentId}>{place.name}</option>)}
              </select>
              <button type="button" onClick={addPlace} disabled={saving} className="flex h-11 items-center gap-1 rounded-xl bg-[#ff5b4f] px-4 text-[11px] font-black text-white disabled:opacity-50">
                {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />} 추가
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
