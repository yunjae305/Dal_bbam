'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Heart, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import type { Category, Place, PlaceCategory } from '@/shared/types';
import { PhoneStatus, HeaderBar } from '@/frontend/components/common/ui';
import { EmptyState } from '@/frontend/components/common/feedback';
import { useLocale } from '@/frontend/i18n/locale-context';

type Props = { places: Place[]; userEmail?: string | null };
type CartRow = {
  id: string;
  created_at: string;
  places: {
    content_id: string;
    category: PlaceCategory;
    name: string;
    description?: string;
    address?: string;
    image_url?: string | null;
    tags?: string[] | null;
  };
};
type ScheduleRow = {
  id: string;
  start_date: string;
  schedule_places?: Array<{
    visit_date: string;
    start_time?: string;
    stay_minutes: number;
    note?: string;
    places: { content_id: string };
  }>;
};

export function TravelCartScreen({ places, userEmail }: Props) {
  const { messages } = useLocale();
  const [items, setItems] = useState<CartRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Category>('all');
  const [placeToAdd, setPlaceToAdd] = useState(places[0]?.contentId ?? '');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const categories = useMemo(
    () => Array.from(new Set(items.map(item => item.places.category))),
    [items]
  );
  const visible = items.filter(item => filter === 'all' || item.places.category === filter);

  async function loadCart() {
    setLoading(true);
    try {
      const response = await fetch('/api/cart', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '장바구니를 불러오지 못했습니다.');
      setItems(payload.data);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '장바구니를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadCart(); }, []);

  async function addPlace() {
    if (!placeToAdd) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId: placeToAdd })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '장소를 저장하지 못했습니다.');
      await loadCart();
      setNotice('장소를 장바구니에 저장했습니다.');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '장소를 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string) {
    setBusy(true);
    const response = await fetch(`/api/cart?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (response.ok) {
      setItems(current => current.filter(item => item.id !== id));
      setSelected(current => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    } else {
      const payload = await response.json();
      setNotice(payload?.error?.message ?? '장소를 삭제하지 못했습니다.');
    }
    setBusy(false);
  }

  function toggle(id: string) {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addToSchedule() {
    const selectedItems = items.filter(item => selected.has(item.id));
    if (!selectedItems.length) return;
    setBusy(true);
    setNotice('');
    try {
      const schedulesResponse = await fetch('/api/schedules', { cache: 'no-store' });
      const schedulesPayload = await schedulesResponse.json();
      if (!schedulesResponse.ok) throw new Error(schedulesPayload?.error?.message ?? '일정을 불러오지 못했습니다.');
      let schedule = schedulesPayload.data[0] as ScheduleRow | undefined;
      if (!schedule) {
        const today = new Date().toISOString().slice(0, 10);
        const createResponse = await fetch('/api/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: '장바구니 여행', startDate: today, endDate: today })
        });
        const createPayload = await createResponse.json();
        if (!createResponse.ok) throw new Error(createPayload?.error?.message ?? '일정을 만들지 못했습니다.');
        schedule = { ...createPayload.data, schedule_places: [] };
      }
      if (!schedule) throw new Error('일정을 준비하지 못했습니다.');
      const targetSchedule = schedule;

      const existing = targetSchedule.schedule_places ?? [];
      const existingIds = new Set(existing.map(item => item.places.content_id));
      const additions = selectedItems.filter(item => !existingIds.has(item.places.content_id));
      const nextItems = [
        ...existing.map(item => ({
          contentId: item.places.content_id,
          visitDate: item.visit_date,
          startTime: item.start_time,
          stayMinutes: item.stay_minutes,
          note: item.note
        })),
        ...additions.map(item => ({
          contentId: item.places.content_id,
          visitDate: targetSchedule.start_date,
          stayMinutes: 60
        }))
      ];

      const updateResponse = await fetch(`/api/schedules/${targetSchedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: nextItems })
      });
      const updatePayload = await updateResponse.json();
      if (!updateResponse.ok) throw new Error(updatePayload?.error?.message ?? '일정에 추가하지 못했습니다.');
      setSelected(new Set());
      setNotice(`${additions.length}곳을 일정에 추가했습니다.`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '일정에 추가하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="min-h-[calc(100dvh-40px)] bg-[#fbfaf8]">
      <PhoneStatus />
      <HeaderBar title="여행 장바구니" right={<Heart size={18} className="text-[#ff5146]" fill="currentColor" />} />
      <div className="px-5 pb-36">
        <div className="mt-3 flex gap-2">
          <select value={placeToAdd} onChange={event => setPlaceToAdd(event.target.value)} className="h-10 min-w-0 flex-1 rounded-xl bg-white px-3 text-[11px] font-bold ring-1 ring-black/5">
            {places.map(place => <option key={place.contentId} value={place.contentId}>{place.name}</option>)}
          </select>
          <button type="button" onClick={addPlace} disabled={busy} className="flex h-10 items-center gap-1 rounded-xl bg-[#ff5b4f] px-4 text-[10px] font-black text-white disabled:opacity-50">
            <Plus size={14} /> 저장
          </button>
        </div>

        {notice && <p className="mt-3 rounded-xl bg-[#fff3ef] p-3 text-[10px] font-bold text-[#9b4e45]" role="status">{notice}</p>}

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setFilter('all')} className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-black ${filter === 'all' ? 'bg-[#ff5b4f] text-white' : 'bg-[#f1f2f4]'}`}>
            {messages.common.all} ({items.length})
          </button>
          {categories.map(category => (
            <button key={category} type="button" onClick={() => setFilter(category)} className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-black ${filter === category ? 'bg-[#ff5b4f] text-white' : 'bg-[#f1f2f4]'}`}>
              {messages.categories[category]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin text-[#ff5b4f]" /></div>
        ) : !visible.length ? (
          <div className="mt-5"><EmptyState title="저장한 장소가 없어요" description="위 목록에서 장소를 골라 장바구니에 저장해 보세요." /></div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {visible.map(item => {
              const picked = selected.has(item.id);
              return (
                <article key={item.id} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
                  <button type="button" onClick={() => toggle(item.id)} className="relative block h-[96px] w-full text-left">
                    <img src={item.places.image_url || '/login-spring-bg.png'} alt={item.places.name} className="h-full w-full object-cover" />
                    <span className={`absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full ${picked ? 'bg-[#ff5b4f] text-white' : 'bg-white/90 text-[#ff5b4f]'}`}>
                      <Check size={14} strokeWidth={3} />
                    </span>
                  </button>
                  <div className="p-3">
                    <h3 className="truncate text-[11px] font-black">{item.places.name}</h3>
                    <p className="mt-1 truncate text-[9px] text-[#7f8791]">{messages.categories[item.places.category]} · {item.places.address}</p>
                    <button type="button" onClick={() => removeItem(item.id)} disabled={busy} className="mt-2 inline-flex items-center gap-1 text-[9px] font-black text-[#a34b45]"><Trash2 size={12} /> 삭제</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] left-1/2 z-30 flex h-14 w-full max-w-[430px] -translate-x-1/2 items-center justify-between bg-white px-5 shadow-[0_-8px_24px_rgba(0,0,0,.08)]">
          <span className="text-[11px] font-black">선택 <b className="text-[#ff5b4f]">{selected.size}곳</b> · {userEmail?.split('@')[0] ?? '여행자'}</span>
          <button type="button" onClick={addToSchedule} disabled={busy || !selected.size} className="rounded-xl bg-[#ff5b4f] px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-50">
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : '일정에 추가'}
          </button>
        </div>
      </div>
    </section>
  );
}
