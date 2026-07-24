'use client';

import { useMemo, useState } from 'react';
import { Bookmark, Check, LoaderCircle, Share2, Sparkles } from 'lucide-react';
import type {
  CoursePlan,
  CourseRequest,
  Place,
  PlaceCategory
} from '@/shared/types';
import { PhoneStatus, HeaderBar } from '@/frontend/components/common/ui';
import { useLocale } from '@/frontend/i18n/locale-context';

type Props = { places: Place[] };

const categories: PlaceCategory[] = ['heritage', 'attraction', 'food', 'nature', 'experience', 'festival'];

export function AiCourseScreen({ places }: Props) {
  const { locale, messages } = useLocale();
  const [request, setRequest] = useState<CourseRequest>({
    purpose: '',
    days: 1,
    companion: 'solo',
    interests: ['heritage'],
    pace: 'balanced',
    transport: 'walking',
    lang: locale
  });
  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shareToken, setShareToken] = useState('');
  const [error, setError] = useState('');

  const byId = useMemo(() => new Map(places.map(place => [place.contentId, place])), [places]);

  function toggleInterest(category: PlaceCategory) {
    setRequest(current => ({
      ...current,
      interests: current.interests.includes(category)
        ? current.interests.filter(item => item !== category)
        : [...current.interests, category]
    }));
  }

  async function recommend() {
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      const response = await fetch('/api/courses/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, lang: locale })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '코스를 추천할 수 없습니다.');
      setPlan(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '코스를 추천할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function savePlan() {
    if (!plan) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: plan.title,
          description: plan.summary,
          isAiGenerated: plan.generatedBy === 'openai',
          transport: plan.transport,
          contentIds: plan.stops.map(stop => stop.contentId),
          reasons: plan.stops.map(stop => stop.reason),
          stayMinutes: plan.stops.map(stop => stop.stayMinutes)
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '코스를 저장할 수 없습니다.');
      setSaved(true);
      setShareToken(payload.data.share_token ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '코스를 저장할 수 없습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function sharePlan() {
    if (!shareToken) return;
    const url = `${window.location.origin}/courses/share/${shareToken}`;
    if (navigator.share) await navigator.share({ title: plan?.title, text: plan?.summary, url });
    else {
      await navigator.clipboard.writeText(url);
      setError('공유 링크를 복사했습니다.');
    }
  }

  return (
    <section className="min-h-[calc(100dvh-40px)] bg-[#fbfaf8]">
      <PhoneStatus />
      <HeaderBar title="AI 추천 코스" right={<Sparkles size={18} className="text-[#ff5b4f]" />} />
      <div className="px-5 pb-28">
        <p className="mt-4 text-[11px] font-black text-[#8d95a1]">실제 관광지 데이터로</p>
        <h1 className="mt-1 text-[22px] font-black leading-tight tracking-[-0.03em]">내 여행 조건에 맞는 코스를 만들어요</h1>

        <div className="mt-5 space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <label className="block text-[11px] font-black">
            여행 목적
            <input
              value={request.purpose}
              onChange={event => setRequest(current => ({ ...current, purpose: event.target.value }))}
              className="mt-2 h-10 w-full rounded-xl bg-[#f4f5f6] px-3 text-[12px] outline-none"
              maxLength={120}
              placeholder="예: 부모님과 신라 역사 여행"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="기간">
              <select value={request.days} onChange={event => setRequest(current => ({ ...current, days: Number(event.target.value) }))} className="h-10 w-full rounded-xl bg-[#f4f5f6] px-3 text-[11px]">
                {[1, 2, 3, 4, 5, 6, 7].map(day => <option key={day} value={day}>{day}일</option>)}
              </select>
            </Field>
            <Field label="동행">
              <select value={request.companion} onChange={event => setRequest(current => ({ ...current, companion: event.target.value as CourseRequest['companion'] }))} className="h-10 w-full rounded-xl bg-[#f4f5f6] px-3 text-[11px]">
                <option value="solo">혼자</option>
                <option value="couple">연인</option>
                <option value="family">가족</option>
                <option value="friends">친구</option>
                <option value="group">단체</option>
              </select>
            </Field>
            <Field label="여행 속도">
              <select value={request.pace} onChange={event => setRequest(current => ({ ...current, pace: event.target.value as CourseRequest['pace'] }))} className="h-10 w-full rounded-xl bg-[#f4f5f6] px-3 text-[11px]">
                <option value="relaxed">여유롭게</option>
                <option value="balanced">균형 있게</option>
                <option value="packed">알차게</option>
              </select>
            </Field>
            <Field label="교통수단">
              <select value={request.transport} onChange={event => setRequest(current => ({ ...current, transport: event.target.value as CourseRequest['transport'] }))} className="h-10 w-full rounded-xl bg-[#f4f5f6] px-3 text-[11px]">
                <option value="walking">도보</option>
                <option value="car">자동차</option>
                <option value="public">대중교통</option>
              </select>
            </Field>
          </div>
          <div>
            <p className="text-[11px] font-black">관심사</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {categories.map(category => {
                const active = request.interests.includes(category);
                return (
                  <button key={category} type="button" onClick={() => toggleInterest(category)} className={`rounded-full px-3 py-2 text-[10px] font-black ${active ? 'bg-[#ff5b4f] text-white' : 'bg-[#f1f2f4] text-[#727b87]'}`}>
                    {messages.categories[category]}
                  </button>
                );
              })}
            </div>
          </div>
          <button type="button" onClick={recommend} disabled={loading || !request.interests.length} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#223c72] text-[12px] font-black text-white disabled:opacity-50">
            {loading ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
            {messages.ai.recommend}
          </button>
        </div>

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-[11px] font-bold text-red-700" role="alert">{error}</p>}

        {plan && (
          <article className="mt-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase text-[#ff5b4f]">{plan.generatedBy === 'openai' ? 'AI plan' : 'Fallback plan'}</p>
                <h2 className="mt-1 text-[18px] font-black">{plan.title}</h2>
                <p className="mt-2 text-[11px] leading-5 text-[#727b87]">{plan.summary}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {shareToken && <button type="button" onClick={sharePlan} className="grid h-9 w-9 place-items-center rounded-full bg-[#eef3ee] text-[#2f7567]" aria-label="코스 공유"><Share2 size={16} /></button>}
                <button type="button" onClick={savePlan} disabled={saving || saved} className="grid h-9 w-9 place-items-center rounded-full bg-[#fff1ee] text-[#ff5b4f] disabled:opacity-60" aria-label="코스 저장">
                  {saved ? <Check size={17} /> : <Bookmark size={17} />}
                </button>
              </div>
            </div>
            <p className="mt-3 text-[10px] font-bold text-[#69727e]">{(plan.totalDistanceMeters / 1000).toFixed(1)}km · 약 {Math.round(plan.estimatedMinutes / 60)}시간</p>
            <ol className="mt-4 space-y-3">
              {plan.stops.map((stop, index) => {
                const place = stop.place ? {
                  name: stop.place.name,
                  image: stop.place.imageUrl
                } : byId.get(stop.contentId);
                return (
                  <li key={stop.contentId} className="grid grid-cols-[28px_54px_1fr] items-center gap-3">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-[#223c72] text-[10px] font-black text-white">{index + 1}</span>
                    <img src={place?.image || '/login-spring-bg.png'} alt={place?.name || '추천 장소'} className="h-12 w-14 rounded-lg object-cover" />
                    <div className="min-w-0">
                      <h3 className="truncate text-[12px] font-black">{place?.name || stop.contentId}</h3>
                      <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-[#7e8793]">{stop.reason} · {stop.stayMinutes}분</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </article>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-[11px] font-black">{label}<span className="mt-2 block">{children}</span></label>;
}
