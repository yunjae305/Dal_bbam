'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bookmark, Check, LoaderCircle, Map as MapIcon, Share2, Sparkles, Trash2 } from 'lucide-react';
import type {
  CoursePlan,
  CourseRequest,
  Place,
  PlaceCategory
} from '@/shared/types';
import { PhoneStatus, HeaderBar } from '@/frontend/components/common/ui';
import { useLocale } from '@/frontend/i18n/locale-context';
import { uiMessages } from '@/shared/ui-messages';
import { plannerMessages } from '@/shared/planner-messages';
import { localizeCuratedCourse } from '@/shared/curated-course-copy';
import { addDateDays, todayLocalDate } from '@/frontend/schedule-utils';
import { CourseRouteMap } from '@/frontend/components/travel/course-route-map';

type Props = { places: Place[] };

type CuratedCourse = {
  id: string;
  title: string;
  description: string | null;
  transport: string;
  is_curated: boolean;
  is_ai_generated?: boolean;
  share_token?: string | null;
  metadata?: { theme?: PlaceCategory };
  course_places: Array<{
    order_index: number;
    reason: string | null;
    stay_minutes: number;
    places: {
      content_id: string;
      name: string;
      image_url: string | null;
    } | null;
  }> | null;
};

const categories: PlaceCategory[] = ['heritage', 'attraction', 'food', 'lodging', 'nature', 'experience', 'festival'];

export function AiCourseScreen({ places }: Props) {
  const { locale, messages } = useLocale();
  const searchParams = useSearchParams();
  const ui = uiMessages[locale].course;
  const planner = plannerMessages[locale];
  const requestedInterest = searchParams.get('interest');
  const [request, setRequest] = useState<CourseRequest>({
    purpose: '',
    startTime: '09:00',
    days: 1,
    companion: 'solo',
    interests: [categories.includes(requestedInterest as PlaceCategory) ? requestedInterest as PlaceCategory : 'heritage'],
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
  const [notice, setNotice] = useState('');
  const [curated, setCurated] = useState<CuratedCourse[]>([]);
  const [myCourses, setMyCourses] = useState<CuratedCourse[]>([]);
  const [startDate, setStartDate] = useState(todayLocalDate);
  const [scheduleId, setScheduleId] = useState('');
  const [theme, setTheme] = useState<PlaceCategory | 'all'>('all');
  const [showMap, setShowMap] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const byId = useMemo(() => new Map(places.map(place => [place.contentId, place])), [places]);

  const loadCourses = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/courses', { signal, cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json() as { data?: CuratedCourse[] };
      const courses = payload.data ?? [];
      setCurated(courses.filter(course => course.is_curated));
      setMyCourses(courses.filter(course => !course.is_curated));
    } catch {
      // The recommendation form still works without the course lists.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadCourses(controller.signal);
    return () => controller.abort();
  }, [loadCourses]);

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
    setNotice('');
    setSaved(false);
    setShareToken('');
    setScheduleId('');
    setShowMap(false);
    try {
      const response = await fetch('/api/courses/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, lang: locale })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.loadRecommendFailed);
      setPlan(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ui.loadRecommendFailed);
    } finally {
      setLoading(false);
    }
  }

  async function createItinerary() {
    if (!plan || !startDate) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: plan.title, startDate, endDate: addDateDays(startDate, (plan.days ?? 1) - 1),
          items: plan.stops.map(stop => ({
            contentId: stop.contentId, visitDate: addDateDays(startDate, stop.dayIndex ?? 0),
            startTime: stop.startTime, stayMinutes: stop.stayMinutes, note: stop.reason
          }))
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? planner.scheduleFailed);
      setScheduleId(payload.data.id);
      setNotice(planner.scheduleCreated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : planner.scheduleFailed);
    } finally { setSaving(false); }
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
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.saveFailed);
      setSaved(true);
      setShareToken(payload.data.share_token ?? '');
      setNotice(ui.savedNotice);
      void loadCourses();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ui.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function shareCourse(token: string, title?: string, text?: string | null) {
    if (!token) return;
    const url = `${window.location.origin}/courses/share/${token}`;
    setError('');
    try {
      if (navigator.share) {
        await navigator.share({ title, text: text ?? undefined, url });
      } else {
        await navigator.clipboard.writeText(url);
        setNotice(ui.copied);
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(ui.shareFailed);
    }
  }

  function sharePlan() {
    return shareCourse(shareToken, plan?.title, plan?.summary);
  }

  // Saved courses had a share button but no way to remove them.
  async function deleteCourse(course: CuratedCourse) {
    if (!window.confirm(ui.deleteCourseConfirm.replace('{title}', course.title))) return;
    setDeletingId(course.id);
    setError('');
    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(course.id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error();
      setMyCourses(current => current.filter(item => item.id !== course.id));
    } catch {
      setError(ui.deleteCourseFailed);
    } finally {
      setDeletingId('');
    }
  }

  return (
    <section className="min-h-[calc(100dvh-40px)] bg-[#fbfaf8]">
      <PhoneStatus />
      <HeaderBar title={ui.header} right={<Sparkles size={18} className="text-[#ff5b4f]" />} />
      <div className="px-5 pb-28">
        <p className="mt-4 text-[11px] font-black text-[#8d95a1]">{ui.eyebrow}</p>
        <h1 className="mt-1 text-[22px] font-black leading-tight tracking-[-0.03em]">{ui.headline}</h1>

        <div className="mt-5 space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <label className="block text-[11px] font-black">
            {ui.purpose}
            <input
              value={request.purpose}
              onChange={event => setRequest(current => ({ ...current, purpose: event.target.value }))}
              className="mt-2 h-10 w-full rounded-xl bg-[#f4f5f6] px-3 text-[12px] outline-none"
              maxLength={120}
              placeholder={ui.purposePlaceholder}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label={planner.startTime}>
              <input type="time" min="06:00" max="18:59" value={request.startTime} onChange={event => setRequest(current => ({ ...current, startTime: event.target.value }))} className="h-11 w-full rounded-xl bg-[#f4f5f6] px-3 text-[11px]" />
            </Field>
            <Field label={ui.duration}>
              <select value={request.days} onChange={event => setRequest(current => ({ ...current, days: Number(event.target.value) }))} className="h-10 w-full rounded-xl bg-[#f4f5f6] px-3 text-[11px]">
                {[1, 2, 3, 4, 5, 6, 7].map(day => <option key={day} value={day}>{ui.days.replace('{day}', String(day))}</option>)}
              </select>
            </Field>
            <Field label={ui.companion}>
              <select value={request.companion} onChange={event => setRequest(current => ({ ...current, companion: event.target.value as CourseRequest['companion'] }))} className="h-10 w-full rounded-xl bg-[#f4f5f6] px-3 text-[11px]">
                <option value="solo">{ui.solo}</option>
                <option value="couple">{ui.couple}</option>
                <option value="family">{ui.family}</option>
                <option value="friends">{ui.friends}</option>
                <option value="group">{ui.group}</option>
              </select>
            </Field>
            <Field label={ui.pace}>
              <select value={request.pace} onChange={event => setRequest(current => ({ ...current, pace: event.target.value as CourseRequest['pace'] }))} className="h-10 w-full rounded-xl bg-[#f4f5f6] px-3 text-[11px]">
                <option value="relaxed">{ui.relaxed}</option>
                <option value="balanced">{ui.balanced}</option>
                <option value="packed">{ui.packed}</option>
              </select>
            </Field>
            <Field label={ui.transport}>
              <select value={request.transport} onChange={event => setRequest(current => ({ ...current, transport: event.target.value as CourseRequest['transport'] }))} className="h-10 w-full rounded-xl bg-[#f4f5f6] px-3 text-[11px]">
                <option value="walking">{ui.walking}</option>
                <option value="car">{ui.car}</option>
                <option value="public">{ui.public}</option>
              </select>
            </Field>
          </div>
          <div>
            <p className="text-[11px] font-black">{ui.interests}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {categories.map(category => {
                const active = request.interests.includes(category);
                return (
                  <button key={category} type="button" aria-pressed={active} onClick={() => toggleInterest(category)} className={`min-h-11 rounded-full px-3 py-2 text-[10px] font-black ${active ? 'bg-[#ff5b4f] text-white' : 'bg-[#f1f2f4] text-[#727b87]'}`}>
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
        {notice && <p className="mt-4 rounded-xl bg-[#e8f2ed] p-3 text-[11px] font-bold text-[#2f7567]" role="status">{notice}</p>}

        {plan && (
          <article className="mt-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase text-[#ff5b4f]">{plan.generatedBy === 'openai' ? ui.aiPlan : ui.fallbackPlan}</p>
                <h2 className="mt-1 text-[18px] font-black">{plan.title}</h2>
                <p className="mt-2 text-[11px] leading-5 text-[#727b87]">{plan.summary}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {shareToken && <button type="button" onClick={sharePlan} className="grid h-9 w-9 place-items-center rounded-full bg-[#eef3ee] text-[#2f7567]" aria-label={ui.shareLabel}><Share2 size={16} /></button>}
                <button type="button" onClick={savePlan} disabled={saving || saved} className="grid h-9 w-9 place-items-center rounded-full bg-[#fff1ee] text-[#ff5b4f] disabled:opacity-60" aria-label={ui.saveLabel}>
                  {saving ? <LoaderCircle size={16} aria-hidden="true" className="animate-spin" /> : saved ? <Check size={17} /> : <Bookmark size={17} />}
                </button>
              </div>
            </div>
            <p className="mt-3 text-[10px] font-bold text-[#69727e]">{ui.durationSummary.replace('{distance}', (plan.totalDistanceMeters / 1000).toFixed(1)).replace('{hours}', String(Math.round(plan.estimatedMinutes / 60)))}</p>
            <p className="mt-2 text-[10px] leading-5 text-[#69727e]">{plan.timingSource === 'map-provider' ? planner.provider : planner.estimate}</p>
            <button type="button" onClick={() => setShowMap(value => !value)} aria-expanded={showMap} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#eef0f3] px-3 text-[11px] font-bold"><MapIcon size={15} />{planner.map}</button>
            {showMap && <CourseRouteMap plan={plan} />}
            <ol className="mt-4 space-y-3">
              {plan.stops.map((stop, index) => {
                const place = stop.place ? {
                  name: stop.place.name,
                  image: stop.place.imageUrl
                } : byId.get(stop.contentId);
                return (
                  <li key={stop.contentId} className="grid grid-cols-[28px_54px_1fr] items-center gap-3">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-[#223c72] text-[10px] font-black text-white">{index + 1}</span>
                    <img src={place?.image || '/login-spring-bg.png'} alt={place?.name || ui.recommendedPlace} className="h-12 w-14 rounded-lg object-cover" />
                    <div className="min-w-0">
                      <h3 className="truncate text-[12px] font-black">{place?.name || stop.contentId}</h3>
                      <p className="mt-1 text-[10px] font-bold tabular-nums text-[#223c72]">{planner.day.replace('{day}', String((stop.dayIndex ?? 0) + 1))} · {stop.startTime}–{stop.endTime}{Boolean(stop.travelMinutes) && ` · ${planner.transfer.replace('{minutes}', String(stop.travelMinutes))}`}</p>
                      <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-[#7e8793]">{stop.reason} · {ui.minutes.replace('{minutes}', String(stop.stayMinutes))}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-5 grid gap-3 border-t border-black/5 pt-4">
              <Field label={planner.startDate}><input type="date" value={startDate} onChange={event => { setStartDate(event.target.value); setScheduleId(''); }} className="h-11 w-full rounded-xl bg-[#f4f5f6] px-3 text-xs" /></Field>
              {scheduleId ? <Link href={`/schedule?id=${encodeURIComponent(scheduleId)}`} className="grid min-h-11 place-items-center rounded-xl bg-[#2f7567] px-3 text-xs font-bold text-white">{planner.openSchedule}</Link> :
                <button type="button" onClick={createItinerary} disabled={saving || !startDate || !plan.stops.length} className="min-h-11 rounded-xl bg-[#223c72] px-3 text-xs font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle size={16} className="mx-auto animate-spin" /> : planner.addSchedule}</button>}
            </div>
          </article>
        )}

        {myCourses.length > 0 && (
          <div className="mt-7">
            <h2 className="text-[16px] font-black tracking-[-0.02em]">{ui.myCoursesTitle}</h2>
            <p className="mt-1 text-[10px] font-bold text-[#8d95a1]">{ui.myCoursesDescription}</p>
            <div className="mt-3 space-y-3">
              {myCourses.map(course => {
                const stops = [...(course.course_places ?? [])].sort((a, b) => a.order_index - b.order_index);
                return (
                  <article key={course.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="inline-flex items-center gap-1 rounded-full bg-[#fff1ee] px-2 py-0.5 text-[9px] font-black text-[#ff5b4f]">
                          <Sparkles size={10} /> {course.is_ai_generated ? ui.aiPlan : ui.fallbackPlan}
                        </p>
                        <h3 className="mt-2 truncate text-[15px] font-black">{course.title}</h3>
                        <p className="mt-1 truncate text-[10px] text-[#727b87]">
                          {stops.map(stop => stop.places?.name ?? ui.deletedPlace).join(' → ')}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {course.share_token && (
                          <button type="button" onClick={() => void shareCourse(course.share_token ?? '', course.title, course.description)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eef3ee] text-[#2f7567]" aria-label={ui.shareLabel}>
                            <Share2 size={16} />
                          </button>
                        )}
                        <button type="button" onClick={() => void deleteCourse(course)} disabled={deletingId === course.id} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-700 disabled:opacity-50" aria-label={ui.deleteCourseLabel.replace('{title}', course.title)}>
                          {deletingId === course.id ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {curated.length > 0 && (
          <div className="mt-7">
            <h2 className="text-[16px] font-black tracking-[-0.02em]">{ui.curatedTitle}</h2>
            <p className="mt-1 text-[10px] font-bold text-[#8d95a1]">{ui.curatedDescription}</p>
            <label className="mt-3 block text-[10px] font-bold">{planner.theme}<select value={theme} onChange={event => setTheme(event.target.value as PlaceCategory | 'all')} className="ml-2 min-h-11 rounded-xl bg-white px-3"><option value="all">{planner.themeAll}</option>{categories.map(category => <option key={category} value={category}>{messages.categories[category]}</option>)}</select></label>
            <div className="mt-3 space-y-4">
              {curated.filter(course => theme === 'all' || course.metadata?.theme === theme).map(original => {
                const course = localizeCuratedCourse(original, locale);
                const stops = [...(course.course_places ?? [])].sort((a, b) => a.order_index - b.order_index);
                return (
                  <article key={course.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="inline-flex items-center gap-1 rounded-full bg-[#eef3ee] px-2 py-0.5 text-[9px] font-black text-[#2f7567]">
                          <MapIcon size={10} /> {({ walking: ui.walking, car: ui.car, public: ui.public }[course.transport] ?? course.transport)} {ui.courseSuffix}
                        </p>
                        <h3 className="mt-2 text-[15px] font-black">{course.title}</h3>
                        {course.description && (
                          <p className="mt-1 text-[10px] leading-4 text-[#727b87]">{course.description}</p>
                        )}
                      </div>
                      {course.share_token && <button type="button" onClick={() => void shareCourse(course.share_token ?? '', course.title, course.description)} aria-label={ui.shareLabel} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#eef3ee] text-[#2f7567]"><Share2 size={16} /></button>}
                    </div>
                    <ol className="mt-3 space-y-2">
                      {stops.map((stop, index) => (
                        <li key={`${course.id}-${stop.order_index}`}>
                          {stop.places ? (
                            <Link
                              href={`/places/${encodeURIComponent(stop.places.content_id)}`}
                              className="grid grid-cols-[22px_44px_1fr] items-center gap-2 rounded-xl p-1 transition-colors hover:bg-[#faf8f4]"
                            >
                              <span className="grid h-5 w-5 place-items-center rounded-full bg-[#2f7567] text-[9px] font-black text-white">{index + 1}</span>
                              <img src={stop.places.image_url || '/login-spring-bg.png'} alt={stop.places.name} className="h-9 w-11 rounded-lg object-cover" />
                              <span className="min-w-0">
                                <span className="block truncate text-[11px] font-black">{stop.places.name}</span>
                                <span className="mt-0.5 block truncate text-[9px] text-[#7e8793]">{stop.reason} · {ui.minutes.replace('{minutes}', String(stop.stay_minutes))}</span>
                              </span>
                            </Link>
                          ) : (
                            <span className="text-[10px] text-[#7e8793]">{ui.deletedPlace}</span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-[11px] font-black">{label}<span className="mt-2 block">{children}</span></label>;
}
