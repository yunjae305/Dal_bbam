'use client';

import { useEffect, useMemo, useState } from 'react';
import { Award, Check, ChevronLeft, LoaderCircle, LockKeyhole, MapPin, ShieldCheck, X } from 'lucide-react';
import type { Badge, Place } from '@/shared/types';
import { getStampThemeProgress, type StampThemeId } from '@/shared/stamp-themes';
import { Metric } from '@/frontend/components/common/ui';
import { readLocationConsent, saveLocationConsent } from '@/frontend/location-consent';
import { useLocale } from '@/frontend/i18n/locale-context';

type Props = { places: Place[]; onExplore?: () => void; onBack?: () => void };
type StampRow = {
  id: string;
  acquired_at: string;
  places: { content_id: string; name: string; image_url?: string | null };
};
type Status = 'idle' | 'loading' | 'success' | 'duplicate' | 'outside' | 'accuracy' | 'denied' | 'error';

export function StampTourScreen({ places, onExplore, onBack }: Props) {
  const { locale, messages: localeMessages } = useLocale();
  const [stamps, setStamps] = useState<StampRow[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [consent, setConsent] = useState<boolean | null | 'loading'>('loading');
  const [pendingPlace, setPendingPlace] = useState<Place | null>(null);
  const [themeFilter, setThemeFilter] = useState<'all' | StampThemeId>('all');

  const acquired = useMemo(
    () => new Set(stamps.map(stamp => stamp.places.content_id)),
    [stamps]
  );
  const themeProgress = useMemo(() => getStampThemeProgress(places, acquired), [places, acquired]);
  const visiblePlaces = useMemo(() => {
    if (themeFilter === 'all') return places;
    const theme = themeProgress.find(item => item.theme.id === themeFilter)?.theme;
    return theme ? places.filter(place => theme.categories.includes(place.category)) : places;
  }, [places, themeFilter, themeProgress]);

  async function refresh() {
    setLoading(true);
    try {
      const [stampResponse, badgeResponse] = await Promise.all([
        fetch('/api/stamps', { cache: 'no-store' }),
        fetch(`/api/badges?lang=${locale}`, { cache: 'no-store' })
      ]);
      const stampPayload = await stampResponse.json();
      const badgePayload = await badgeResponse.json();
      if (stampResponse.ok) setStamps(stampPayload.data);
      if (badgeResponse.ok) setBadges(badgePayload.data.earned);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [locale]);
  useEffect(() => {
    readLocationConsent()
      .then(setConsent)
      .catch(() => setConsent(null));
  }, []);

  async function verify(place: Place) {
    if (consent !== true) {
      setPendingPlace(place);
      return;
    }
    verifyWithLocation(place);
  }

  function verifyWithLocation(place: Place) {
    setStatuses(current => ({ ...current, [place.contentId]: 'loading' }));
    setMessages(current => ({ ...current, [place.contentId]: '' }));
    if (!navigator.geolocation) {
      setStatuses(current => ({ ...current, [place.contentId]: 'error' }));
      setMessages(current => ({ ...current, [place.contentId]: '이 브라우저는 위치정보를 지원하지 않습니다.' }));
      return;
    }

    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const response = await fetch('/api/stamps/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            placeId: place.contentId,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyMeters: position.coords.accuracy
          })
        });
        const payload = await response.json();
        const result = payload.data ?? payload;
        if (response.ok) {
          if (!result.persisted) {
            throw new Error('스탬프가 저장되지 않았습니다. 다시 시도해 주세요.');
          }
          const status: Status = result.alreadyAcquired ? 'duplicate' : 'success';
          setStatuses(current => ({ ...current, [place.contentId]: status }));
          setMessages(current => ({
            ...current,
            [place.contentId]: result.alreadyAcquired
              ? '이미 획득한 스탬프입니다.'
              : `현장 확인 완료 · 거리 ${result.distanceMeters}m`
          }));
          await refresh();
        } else {
          const code = payload?.error?.code;
          const message = payload?.error?.message ?? payload?.error ?? '스탬프를 획득하지 못했습니다.';
          const status: Status = response.status === 422
            ? (code === 'LOW_ACCURACY' || String(message).includes('정확도') ? 'accuracy' : 'outside')
            : 'error';
          setStatuses(current => ({ ...current, [place.contentId]: status }));
          setMessages(current => ({ ...current, [place.contentId]: String(message) }));
        }
      } catch {
        setStatuses(current => ({ ...current, [place.contentId]: 'error' }));
        setMessages(current => ({ ...current, [place.contentId]: '네트워크 연결을 확인해 주세요.' }));
      }
    }, error => {
      setStatuses(current => ({ ...current, [place.contentId]: error.code === error.PERMISSION_DENIED ? 'denied' : 'error' }));
      setMessages(current => ({
        ...current,
        [place.contentId]: error.code === error.PERMISSION_DENIED
          ? '위치 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해 주세요.'
          : '현재 위치를 확인하지 못했습니다.'
      }));
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }

  async function grantConsent() {
    const place = pendingPlace;
    if (!place) return;
    setConsent('loading');
    try {
      await saveLocationConsent(true);
      setConsent(true);
      setPendingPlace(null);
      verifyWithLocation(place);
    } catch (error) {
      setConsent(null);
      setMessages(current => ({
        ...current,
        [place.contentId]: error instanceof Error ? error.message : '위치정보 동의를 저장하지 못했습니다.'
      }));
      setStatuses(current => ({ ...current, [place.contentId]: 'error' }));
    }
  }

  async function declineConsent() {
    setPendingPlace(null);
    setConsent(false);
    try {
      await saveLocationConsent(false);
    } catch {
      setConsent(null);
    }
  }

  const progress = places.length ? Math.min(100, (acquired.size / places.length) * 100) : 0;

  return (
    <section className="min-h-[calc(100dvh-40px)] bg-[#fbfaf8] px-5 pb-28 pt-5">
      {pendingPlace && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-5" role="dialog" aria-modal="true" aria-labelledby="stamp-consent-title">
          <div className="relative w-full max-w-[390px] rounded-3xl bg-white p-6 shadow-2xl">
            <button type="button" onClick={declineConsent} className="absolute right-4 top-4 text-[#7b817f]" aria-label={localeMessages.common.close}>
              <X size={19} />
            </button>
            <ShieldCheck size={28} className="text-[#2f7567]" />
            <h2 id="stamp-consent-title" className="mt-3 text-lg font-black">{localeMessages.map.consentTitle}</h2>
            <p className="mt-2 pr-3 text-[11px] leading-5 text-[#616a67]">{localeMessages.map.consentBody}</p>
            <p className="mt-3 rounded-xl bg-[#f5f1ea] p-3 text-[10px] font-bold text-[#5f645f]">
              {pendingPlace.name} 현장 반경 안에 있는지 한 번 확인하며, 원시 위치 이력은 저장하지 않습니다.
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={grantConsent} disabled={consent === 'loading'} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2f7567] px-4 py-3 text-[11px] font-black text-white disabled:opacity-50">
                {consent === 'loading' && <LoaderCircle size={14} className="animate-spin" />}
                {localeMessages.map.allow}
              </button>
              <button type="button" onClick={declineConsent} className="rounded-xl bg-[#eef1ef] px-4 py-3 text-[11px] font-black">
                {localeMessages.map.decline}
              </button>
            </div>
          </div>
        </div>
      )}
      {onBack && (
        <button className="mb-3 flex items-center gap-1 text-[12px] font-black text-[#6b7280]" type="button" onClick={onBack}>
          <ChevronLeft size={17} /> 전체보기
        </button>
      )}
      <div className="rounded-[24px] bg-white px-5 pb-5 pt-6 shadow-[0_16px_36px_rgba(18,24,40,.08)]">
        <p className="text-[11px] font-black text-[#ff6f5e]">현장에서 GPS로 확인하는</p>
        <h1 className="mt-1 text-[26px] font-black tracking-[-0.03em] text-[#202631]">경주 스탬프 투어</h1>

        <div className="mt-5 rounded-xl border border-[#f1e4dd] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span>관광지를 방문해 디지털 배지를 모아보세요</span>
            <span className="text-[#9aa1aa]">{acquired.size} / {places.length}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#fde5df]">
            <div className="h-full rounded-full bg-[#ff6b55] transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 text-center">
            <Metric value={String(acquired.size)} label="모은 스탬프" />
            <Metric value={String(badges.length)} label="획득한 배지" />
          </div>
        </div>

        {badges.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto">
            {badges.map(badge => (
              <div key={badge.id} className="min-w-[150px] rounded-xl bg-[#fff4ea] p-3">
                <Award size={18} className="text-[#ff755f]" />
                <p className="mt-2 text-[11px] font-black">{badge.name}</p>
                <p className="mt-1 text-[9px] leading-4 text-[#8d7768]">{badge.description}</p>
              </div>
            ))}
          </div>
        )}

        {themeProgress.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-black tracking-[-0.02em]">{localeMessages.stamps.themes}</h2>
              {themeFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setThemeFilter('all')}
                  className="rounded-full bg-[#eef1ef] px-3 py-1 text-[10px] font-black text-[#5f645f]"
                >
                  {localeMessages.common.all}
                </button>
              )}
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {themeProgress.map(({ theme, total, acquired: themeAcquired, completed }) => {
                const active = themeFilter === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setThemeFilter(current => (current === theme.id ? 'all' : theme.id))}
                    className={`min-w-[132px] shrink-0 rounded-xl border p-3 text-left transition ${active ? 'border-[#ff6b55] bg-[#fff2ee]' : 'border-[#ece5db] bg-[#faf8f5]'}`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-black text-[#202631]">{theme.name[locale]}</p>
                      {completed && (
                        <span className="grid h-4 w-4 place-items-center rounded-full bg-[#2f7567] text-white"><Check size={10} /></span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[9px] leading-3.5 text-[#8d8578]">{theme.description[locale]}</p>
                    <div className="mt-2 flex items-center justify-between text-[9px] font-bold text-[#9aa1aa]">
                      <span>{completed ? localeMessages.stamps.themeCompleted : localeMessages.stamps.themeProgress}</span>
                      <span>{themeAcquired} / {total}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#fde5df]">
                      <div
                        className={`h-full rounded-full transition-[width] ${completed ? 'bg-[#2f7567]' : 'bg-[#ff6b55]'}`}
                        style={{ width: `${total ? Math.min(100, (themeAcquired / total) * 100) : 0}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-black tracking-[-0.02em]">경주 스탬프 도감</h2>
            <p className="mt-1 text-[11px] font-bold text-[#8c929c]">장소에서 스탬프를 눌러 위치를 확인하세요.</p>
          </div>
          {loading && <LoaderCircle size={17} className="animate-spin text-[#ff6b55]" />}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          {visiblePlaces.map(place => {
            const collected = acquired.has(place.contentId);
            const status = statuses[place.contentId] ?? 'idle';
            const busy = status === 'loading';
            return (
              <article key={place.contentId} className="rounded-2xl bg-[#faf8f5] p-3 text-center">
                <span className={`relative mx-auto grid h-[76px] w-[76px] place-items-center overflow-hidden rounded-full border-4 ${collected ? 'border-[#fff2e8]' : 'border-[#ece5db]'}`}>
                  <img className={`h-full w-full object-cover ${collected ? '' : 'opacity-55'}`} src={place.image} alt={`${place.name} 스탬프`} />
                  {!collected && <span className="absolute inset-0 grid place-items-center bg-white/20"><LockKeyhole size={18} /></span>}
                  {collected && <span className="absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-[#ff6958] text-white"><Check size={13} /></span>}
                </span>
                <h3 className="mt-2 truncate text-[10px] font-black">{place.name}</h3>
                <button type="button" onClick={() => verify(place)} disabled={busy} className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#223c72] px-3 py-1.5 text-[9px] font-black text-white disabled:opacity-50">
                  {busy ? <LoaderCircle size={11} className="animate-spin" /> : <MapPin size={11} />}
                  {collected ? '다시 확인' : '현장 확인'}
                </button>
                {messages[place.contentId] && (
                  <p className={`mt-2 text-[8px] leading-3 ${status === 'success' || status === 'duplicate' ? 'text-[#39805e]' : 'text-[#a84d47]'}`}>
                    {messages[place.contentId]}
                  </p>
                )}
              </article>
            );
          })}
        </div>

        {onExplore && <button type="button" onClick={onExplore} className="mt-5 h-11 w-full rounded-xl bg-[#ff755f] text-[11px] font-black text-white">다른 여행 코스 보기</button>}
      </div>
    </section>
  );
}
