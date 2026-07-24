'use client';

import { useEffect, useState } from 'react';
import { Clock, LoaderCircle, MapPin } from 'lucide-react';
import { EmptyState } from '@/frontend/components/common/feedback';

type SharedPlace = {
  content_id: string;
  name: string;
  address: string;
  image_url?: string | null;
};

type SharedItem = {
  order_index?: number;
  sort_order?: number;
  reason?: string | null;
  stay_minutes: number;
  visit_date?: string;
  start_time?: string | null;
  places: SharedPlace;
};

type SharedData = {
  title: string;
  description?: string | null;
  transport?: string;
  start_date?: string;
  end_date?: string;
  course_places?: SharedItem[];
  schedule_places?: SharedItem[];
};

export function SharedPlanScreen({ kind, token }: { kind: 'course' | 'schedule'; token: string }) {
  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const path = kind === 'course' ? 'courses' : 'schedules';
    fetch(`/api/${path}/share/${encodeURIComponent(token)}`)
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message ?? '공유 내용을 불러오지 못했습니다.');
        setData(payload.data);
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : '공유 내용을 불러오지 못했습니다.'));
  }, [kind, token]);

  if (error) return <div className="p-5"><EmptyState title="공유 링크를 열 수 없어요" description={error} /></div>;
  if (!data) return <div className="grid min-h-[60dvh] place-items-center"><LoaderCircle className="animate-spin" /></div>;

  const items = [...(data.course_places ?? data.schedule_places ?? [])].sort((a, b) =>
    (a.order_index ?? a.sort_order ?? 0) - (b.order_index ?? b.sort_order ?? 0)
  );
  return (
    <section className="mx-auto max-w-[700px] px-5 py-8">
      <p className="text-[10px] font-black text-[#ff5b4f]">SHARED {kind.toUpperCase()}</p>
      <h1 className="mt-2 text-2xl font-black">{data.title}</h1>
      {data.description && <p className="mt-3 text-[12px] leading-6 text-[#68716e]">{data.description}</p>}
      {data.start_date && <p className="mt-2 text-[10px] font-bold text-[#7d8582]">{data.start_date} ~ {data.end_date}</p>}
      <ol className="mt-6 space-y-3">
        {items.map((item, index) => (
          <li key={`${item.places.content_id}-${index}`} className="grid grid-cols-[32px_72px_1fr] items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#223c72] text-[10px] font-black text-white">{index + 1}</span>
            <img src={item.places.image_url || '/login-spring-bg.png'} alt={item.places.name} className="h-16 w-[72px] rounded-xl object-cover" />
            <div className="min-w-0">
              <h2 className="truncate text-[13px] font-black">{item.places.name}</h2>
              <p className="mt-1 truncate text-[9px] text-[#7a8380]"><MapPin size={11} className="mr-1 inline" />{item.places.address}</p>
              <p className="mt-2 text-[9px] text-[#7a8380]"><Clock size={11} className="mr-1 inline" />{item.stay_minutes}분 {item.start_time ? `· ${item.start_time}` : ''}</p>
              {item.reason && <p className="mt-1 line-clamp-2 text-[9px] text-[#7a8380]">{item.reason}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
