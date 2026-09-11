'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  Check,
  ChevronLeft,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  X
} from 'lucide-react';
import type { Badge, Place, PlaceCategory } from '@/shared/types';
import { placeCategories } from '@/shared/types';
import { getStampThemeProgress, type StampThemeId } from '@/shared/stamp-themes';
import { Metric } from '@/frontend/components/common/ui';
import { readLocationConsent, saveLocationConsent } from '@/frontend/location-consent';
import { acquirePosition, GeolocationAcquireError, type PositionSample } from '@/frontend/geolocation';
import { useLocale } from '@/frontend/i18n/locale-context';
import { uiMessages } from '@/shared/ui-messages';

type Props = { places: Place[]; onExplore?: () => void; onBack?: () => void };
type StampRow = {
  id: string;
  acquired_at: string;
  places: { content_id: string; name: string; image_url?: string | null } | null;
};
type StampTarget = {
  id: string;
  checkpointRequired: boolean;
  radiusMeters: number;
  sortOrder: number;
  place: {
    id: string;
    contentId: string;
    name: string;
    category: string;
    imageUrl: string | null;
    lat: number;
    lng: number;
  };
  artwork: { id: string; imageUrl: string; model: string; generatedAt: string | null } | null;
  artworkStatus: 'approved' | 'generating' | 'pending_review' | 'failed' | 'unavailable';
};
type StampReward = {
  id: string;
  title: string;
  description: string;
  rewardType: string;
  earnedAt?: string;
};
type Status = 'idle' | 'loading' | 'success' | 'duplicate' | 'outside' | 'accuracy' | 'checkpoint' | 'denied' | 'error';
type LoadError = { code: string; message: string };

const DEFAULT_MAX_ACCURACY_M = 100;
const GPS_ACQUIRE_TIMEOUT_MS = 15_000;

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function normalizedCategory(value: string): PlaceCategory {
  return placeCategories.includes(value as PlaceCategory) ? value as PlaceCategory : 'attraction';
}

export function StampTourScreen({ places, onExplore, onBack }: Props) {
  const { locale, messages: localeMessages } = useLocale();
  const ui = uiMessages[locale].stamp;
  const [stamps, setStamps] = useState<StampRow[]>([]);
  const [targets, setTargets] = useState<StampTarget[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [rewards, setRewards] = useState<StampReward[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [badgeWarning, setBadgeWarning] = useState(false);
  const [consent, setConsent] = useState<boolean | null | 'loading'>('loading');
  const [pendingPlace, setPendingPlace] = useState<Place | null>(null);
  const [themeFilter, setThemeFilter] = useState<'all' | StampThemeId>('all');
  const [checkpointToken, setCheckpointToken] = useState('');
  const [checkpointTarget, setCheckpointTarget] = useState('');
  const [failedImages, setFailedImages] = useState<Record<string, true>>({});
  const [maxAccuracy, setMaxAccuracy] = useState(DEFAULT_MAX_ACCURACY_M);
  const [lastFix, setLastFix] = useState<PositionSample | null>(null);

  const targetByContentId = useMemo(
    () => new Map(targets.map(target => [target.place.contentId, target])),
    [targets]
  );
  const placeByContentId = useMemo(
    () => new Map(places.map(place => [place.contentId, place])),
    [places]
  );
  const fallbackPhotoByContentId = useMemo(() => {
    const photos = new Map<string, string>();
    for (const target of targets) {
      const photo = target.place.imageUrl || placeByContentId.get(target.place.contentId)?.image;
      if (photo) photos.set(target.place.contentId, photo);
    }
    return photos;
  }, [placeByContentId, targets]);
  const cataloguePlaces = useMemo(() => targets.map(target => {
    const existing = placeByContentId.get(target.place.contentId);
    const image = target.artwork?.imageUrl || fallbackPhotoByContentId.get(target.place.contentId) || '/login-spring-bg.webp';
    return existing ? { ...existing, image } : {
      id: target.place.contentId,
      contentId: target.place.contentId,
      category: normalizedCategory(target.place.category),
      name: target.place.name,
      description: ui.fallbackDescription,
      address: ui.fallbackAddress,
      distance: ui.fieldCheck,
      rating: 0,
      bestTime: ui.hoursCheck,
      image,
      tags: [ui.tag],
      coordinates: [target.place.lat, target.place.lng] as [number, number],
      translations: {},
      source: 'database' as const
    };
  }), [fallbackPhotoByContentId, placeByContentId, targets, ui]);
  const acquired = useMemo(
    () => new Set(stamps.map(stamp => stamp.places?.content_id).filter((value): value is string => Boolean(value))),
    [stamps]
  );
  const acquiredTargetCount = useMemo(
    () => cataloguePlaces.filter(place => acquired.has(place.contentId)).length,
    [acquired, cataloguePlaces]
  );
  const themeProgress = useMemo(
    () => getStampThemeProgress(cataloguePlaces, acquired),
    [cataloguePlaces, acquired]
  );
  const visiblePlaces = useMemo(() => {
    if (themeFilter === 'all') return cataloguePlaces;
    const theme = themeProgress.find(item => item.theme.id === themeFilter)?.theme;
    return theme ? cataloguePlaces.filter(place => theme.categories.includes(place.category)) : cataloguePlaces;
  }, [cataloguePlaces, themeFilter, themeProgress]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setBadgeWarning(false);
    try {
      const [stampResponse, badgeResponse] = await Promise.all([
        fetch(`/api/stamps?lang=${locale}`, { cache: 'no-store' }),
        fetch(`/api/badges?lang=${locale}`, { cache: 'no-store' })
      ]);
      const stampPayload = await stampResponse.json().catch(() => null);
      const badgePayload = await badgeResponse.json().catch(() => null);
      if (!stampResponse.ok) {
        throw {
          code: stampPayload?.error?.code ?? 'STAMPS_READ_FAILED',
          message: stampPayload?.error?.message ?? ui.loadFailed
        } satisfies LoadError;
      }
      const nextTargets = stampPayload?.meta?.targets;
      if (!Array.isArray(nextTargets)) {
        throw { code: 'STAMP_TARGETS_MISSING', message: ui.targetsMissing } satisfies LoadError;
      }
      setStamps(Array.isArray(stampPayload.data) ? stampPayload.data : []);
      setTargets(nextTargets);
      setRewards(Array.isArray(stampPayload?.meta?.rewards?.earned) ? stampPayload.meta.rewards.earned : []);
      const configuredAccuracy = Number(stampPayload?.meta?.maxAccuracyMeters);
      if (Number.isFinite(configuredAccuracy) && configuredAccuracy > 0) setMaxAccuracy(configuredAccuracy);
      if (badgeResponse.ok && Array.isArray(badgePayload?.data?.earned)) {
        setBadges(badgePayload.data.earned);
      } else {
        setBadgeWarning(true);
      }
    } catch (error) {
      const failure = error as Partial<LoadError>;
      setLoadError({
        code: failure?.code ?? 'NETWORK_ERROR',
        message: failure?.message ?? ui.retryNetwork
      });
      setStamps([]);
      setTargets([]);
      setRewards([]);
      setBadges([]);
    } finally {
      setLoading(false);
    }
  }, [locale, ui]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    readLocationConsent().then(setConsent).catch(() => setConsent(null));
    const params = new URLSearchParams(window.location.search);
    const token = params.get('checkin')?.trim() ?? '';
    const target = params.get('target')?.trim() ?? '';
    if (token.length >= 16 && token.length <= 256) {
      setCheckpointToken(token);
      setCheckpointTarget(target);
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('checkin');
      cleanUrl.searchParams.delete('target');
      window.history.replaceState(null, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    }
  }, []);

  function usableCheckpoint(place: Place): string {
    if (!checkpointToken) return '';
    return !checkpointTarget || checkpointTarget === place.contentId ? checkpointToken : '';
  }

  function clearCheckpoint() {
    setCheckpointToken('');
    setCheckpointTarget('');
    const url = new URL(window.location.href);
    url.searchParams.delete('checkin');
    url.searchParams.delete('target');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  async function verify(place: Place) {
    const target = targetByContentId.get(place.contentId);
    if (target?.checkpointRequired && !usableCheckpoint(place)) {
      setStatuses(current => ({ ...current, [place.contentId]: 'checkpoint' }));
      setMessages(current => ({ ...current, [place.contentId]: ui.checkpointFirst }));
      return;
    }
    if (consent !== true) {
      setPendingPlace(place);
      return;
    }
    void verifyWithLocation(place);
  }

  async function verifyWithLocation(place: Place) {
    setStatuses(current => ({ ...current, [place.contentId]: 'loading' }));
    setMessages(current => ({ ...current, [place.contentId]: ui.gpsWaiting }));

    let position: PositionSample;
    try {
      position = await acquirePosition({
        maxAccuracyMeters: maxAccuracy,
        timeoutMs: GPS_ACQUIRE_TIMEOUT_MS,
        onSample: sample => setMessages(current => ({
          ...current,
          [place.contentId]: ui.gpsSearching
            .replace('{accuracy}', String(Math.round(sample.accuracy)))
            .replace('{max}', String(maxAccuracy))
        }))
      });
    } catch (error) {
      const code = error instanceof GeolocationAcquireError ? error.code : 'unavailable';
      setStatuses(current => ({ ...current, [place.contentId]: code === 'denied' ? 'denied' : 'error' }));
      setMessages(current => ({
        ...current,
        [place.contentId]: code === 'denied'
          ? ui.permissionDenied
          : code === 'unsupported'
            ? ui.geoUnsupported
            : code === 'timeout'
              ? ui.gpsTimeout
              : ui.locationFailed
      }));
      return;
    }
    setLastFix(position);

    try {
      const usedCheckpoint = usableCheckpoint(place);
      const response = await fetch('/api/stamps/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: place.contentId,
          lat: position.lat,
          lng: position.lng,
          accuracyMeters: position.accuracy,
          checkpointToken: usedCheckpoint || undefined
        })
      });
      const payload = await response.json().catch(() => null);
      const result = payload?.data ?? payload;
      if (response.ok) {
        if (!result?.persisted) throw new Error(ui.persistFailed);
        const status: Status = result.alreadyAcquired ? 'duplicate' : 'success';
        const delayed = Array.isArray(result.postProcessingWarnings) && result.postProcessingWarnings.length > 0;
        setStatuses(current => ({ ...current, [place.contentId]: status }));
        setMessages(current => ({
          ...current,
          [place.contentId]: result.alreadyAcquired
            ? ui.duplicate
            : ui.verified
              .replace('{distance}', String(result.distanceMeters))
              .replace('{delay}', delayed ? ui.rewardDelay : '')
        }));
        if (usedCheckpoint) clearCheckpoint();
        await refresh();
      } else {
        const code = payload?.error?.code ?? 'STAMP_VERIFY_FAILED';
        const message = payload?.error?.message ?? ui.obtainFailed;
        const status: Status = code === 'LOW_ACCURACY' || code === 'ACCURACY_REQUIRED'
          ? 'accuracy'
          : code.startsWith('CHECKPOINT_')
            ? 'checkpoint'
            : response.status === 422
              ? 'outside'
              : 'error';
        setStatuses(current => ({ ...current, [place.contentId]: status }));
        setMessages(current => ({ ...current, [place.contentId]: String(message) }));
      }
    } catch (error) {
      setStatuses(current => ({ ...current, [place.contentId]: 'error' }));
      setMessages(current => ({
        ...current,
        [place.contentId]: error instanceof Error && error.message === ui.persistFailed
          ? error.message
          : ui.networkError
      }));
    }
  }

  async function grantConsent() {
    const place = pendingPlace;
    if (!place) return;
    setConsent('loading');
    try {
      await saveLocationConsent(true);
      setConsent(true);
      setPendingPlace(null);
      void verifyWithLocation(place);
    } catch (error) {
      setConsent(null);
      setMessages(current => ({
        ...current,
        [place.contentId]: error instanceof Error ? error.message : ui.consentSaveFailed
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

  const progress = cataloguePlaces.length ? Math.min(100, (acquiredTargetCount / cataloguePlaces.length) * 100) : 0;

  return (
    <section className="min-h-[calc(100dvh-40px)] bg-[#fbfaf8] px-5 pb-28 pt-5 antialiased">
      {pendingPlace && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-5" role="dialog" aria-modal="true" aria-labelledby="stamp-consent-title">
          <div className="relative w-full max-w-[390px] rounded-3xl bg-white p-6 shadow-2xl">
            <button type="button" onClick={declineConsent} className="absolute right-3 top-3 grid min-h-11 min-w-11 place-items-center rounded-full text-[#7b817f] transition-[transform,background-color] active:scale-[0.96]" aria-label={localeMessages.common.close}>
              <X size={19} />
            </button>
            <ShieldCheck size={28} strokeWidth={2} className="text-[#2f7567]" />
            <h2 id="stamp-consent-title" className="mt-3 text-balance text-lg font-black">{localeMessages.map.consentTitle}</h2>
            <p className="mt-2 pr-3 text-pretty text-[11px] leading-5 text-[#616a67]">{localeMessages.map.consentBody}</p>
            <p className="mt-3 rounded-xl bg-[#f5f1ea] p-3 text-pretty text-[10px] font-bold text-[#5f645f]">
              {ui.consentDetail.replace('{name}', pendingPlace.name)}
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={grantConsent} disabled={consent === 'loading'} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#2f7567] px-4 py-3 text-[11px] font-black text-white transition-transform active:scale-[0.96] disabled:opacity-50">
                {consent === 'loading' && <LoaderCircle size={14} className="animate-spin" />}
                {localeMessages.map.allow}
              </button>
              <button type="button" onClick={declineConsent} className="min-h-11 rounded-xl bg-[#eef1ef] px-4 py-3 text-[11px] font-black transition-transform active:scale-[0.96]">
                {localeMessages.map.decline}
              </button>
            </div>
          </div>
        </div>
      )}

      {onBack && (
        <button className="mb-3 flex min-h-11 items-center gap-1 rounded-xl px-2 text-[12px] font-black text-[#6b7280] transition-transform active:scale-[0.96]" type="button" onClick={onBack}>
          <ChevronLeft size={17} /> {ui.backAll}
        </button>
      )}

      <div className="rounded-[24px] bg-white px-5 pb-5 pt-6 shadow-[0_16px_36px_rgba(18,24,40,.08)]">
        <p className="text-[11px] font-black text-[#ff6f5e]">{ui.eyebrow}</p>
        <h1 className="mt-1 text-balance text-[26px] font-black tracking-[-0.03em] text-[#202631]">{ui.title}</h1>

        {checkpointToken && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-[#edf7f3] p-4 text-[#276354]" role="status">
            <QrCode size={20} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] font-black">{ui.checkpointScanned}</p>
              <p className="mt-1 text-pretty text-[9px] leading-4">{checkpointTarget ? ui.checkpointLinked : ui.checkpointThis}</p>
            </div>
          </div>
        )}

        {loadError && (
          <div className="mt-4 rounded-2xl bg-[#fff1ee] p-4" role="alert">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="mt-0.5 shrink-0 text-[#b94f4a]" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black text-[#8f3935]">{ui.loadErrorTitle}</p>
                <p className="mt-1 text-pretty text-[9px] leading-4 text-[#8f5a56]">{loadError.message}</p>
                <p className="mt-1 font-mono text-[8px] text-[#aa7772]">{loadError.code}</p>
              </div>
            </div>
            <button type="button" onClick={() => void refresh()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#8f3935] px-4 text-[10px] font-black text-white transition-transform active:scale-[0.96]">
              <RefreshCw size={14} /> {ui.retry}
            </button>
          </div>
        )}

        <div className="mt-5 rounded-2xl bg-[#fffaf7] p-4 shadow-[inset_0_0_0_1px_rgba(75,45,34,.08)]">
          <div className="flex items-center justify-between gap-3 text-[11px] font-bold">
            <span className="text-pretty">{ui.progressPrompt}</span>
            <span className="shrink-0 tabular-nums text-[#9aa1aa]">{acquiredTargetCount} / {cataloguePlaces.length}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#fde5df]">
            <div className="h-full rounded-full bg-[#ff6b55] transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          {lastFix && (
            <p className="mt-2 text-[9px] font-bold text-[#9aa1aa]" role="status">
              {ui.lastFix.replace('{accuracy}', String(Math.round(lastFix.accuracy)))}
            </p>
          )}
          <div className="mt-4 grid grid-cols-3 text-center tabular-nums">
            <Metric value={String(acquiredTargetCount)} label={ui.collected} />
            <Metric value={String(badges.length)} label={ui.badges} />
            <Metric value={String(rewards.length)} label={ui.rewards} />
          </div>
        </div>

        {badgeWarning && (
          <p className="mt-3 rounded-xl bg-[#fff7df] px-3 py-2 text-pretty text-[9px] font-bold text-[#866d2f]">
            {ui.badgeWarning}
          </p>
        )}

        {rewards.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {rewards.map(reward => (
              <div key={reward.id} className="min-w-[166px] rounded-2xl bg-[#edf7f3] p-3 shadow-[inset_0_0_0_1px_rgba(47,117,103,.10)]">
                <TicketCheck size={18} className="text-[#2f7567]" />
                <p className="mt-2 text-[11px] font-black">{reward.title}</p>
                <p className="mt-1 text-pretty text-[9px] leading-4 text-[#58736c]">{reward.description}</p>
              </div>
            ))}
          </div>
        )}

        {badges.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {badges.map(badge => (
              <div key={badge.id} className="min-w-[150px] rounded-2xl bg-[#fff4ea] p-3">
                <Award size={18} className="text-[#ff755f]" />
                <p className="mt-2 text-[11px] font-black">{badge.name}</p>
                <p className="mt-1 text-pretty text-[9px] leading-4 text-[#8d7768]">{badge.description}</p>
              </div>
            ))}
          </div>
        )}

        {!loadError && themeProgress.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-balance text-[17px] font-black tracking-[-0.02em]">{localeMessages.stamps.themes}</h2>
              {themeFilter !== 'all' && (
                <button type="button" onClick={() => setThemeFilter('all')} className="min-h-10 rounded-full bg-[#eef1ef] px-4 text-[10px] font-black text-[#5f645f] transition-transform active:scale-[0.96]">
                  {localeMessages.common.all}
                </button>
              )}
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {themeProgress.map(({ theme, total, acquired: themeAcquired, completed }) => {
                const active = themeFilter === theme.id;
                return (
                  <button key={theme.id} type="button" aria-pressed={active} onClick={() => setThemeFilter(current => current === theme.id ? 'all' : theme.id)} className={`min-h-24 min-w-[132px] shrink-0 rounded-2xl border p-3 text-left transition-[transform,background-color,border-color] active:scale-[0.96] ${active ? 'border-[#ff6b55] bg-[#fff2ee]' : 'border-[#ece5db] bg-[#faf8f5]'}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-black text-[#202631]">{theme.name[locale]}</p>
                      {completed && <span className="grid h-4 w-4 place-items-center rounded-full bg-[#2f7567] text-white"><Check size={10} /></span>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-pretty text-[9px] leading-3.5 text-[#8d8578]">{theme.description[locale]}</p>
                    <div className="mt-2 flex items-center justify-between text-[9px] font-bold tabular-nums text-[#9aa1aa]">
                      <span>{completed ? localeMessages.stamps.themeCompleted : localeMessages.stamps.themeProgress}</span>
                      <span>{themeAcquired} / {total}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5 flex min-h-11 items-center justify-between gap-3">
          <div>
            <h2 className="text-balance text-[17px] font-black tracking-[-0.02em]">{ui.catalogueTitle}</h2>
            <p className="mt-1 text-pretty text-[11px] font-bold text-[#8c929c]">{ui.catalogueDescription}</p>
          </div>
          {loading && <LoaderCircle size={18} className="shrink-0 animate-spin text-[#ff6b55]" aria-label={ui.loading} />}
        </div>

        {!loading && !loadError && cataloguePlaces.length === 0 && (
          <div className="mt-4 rounded-2xl bg-[#f5f1ea] p-5 text-center">
            <MapPin size={24} className="mx-auto text-[#8c8175]" />
            <p className="mt-2 text-[11px] font-black">{ui.emptyTitle}</p>
            <p className="mt-1 text-pretty text-[9px] leading-4 text-[#8c8175]">{ui.emptyDescription}</p>
          </div>
        )}

        {!loadError && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            {visiblePlaces.map(place => {
              const target = targetByContentId.get(place.contentId);
              const collected = acquired.has(place.contentId);
              const status = statuses[place.contentId] ?? 'idle';
              const busy = status === 'loading';
              const hasCheckpoint = Boolean(usableCheckpoint(place));
              const fallbackPhoto = fallbackPhotoByContentId.get(place.contentId);
              const primaryImageFailed = Boolean(failedImages[place.image]);
              const fallbackImageFailed = Boolean(fallbackPhoto && failedImages[fallbackPhoto]);
              const displayImage = primaryImageFailed
                ? target?.artwork && fallbackPhoto && !fallbackImageFailed
                  ? fallbackPhoto
                  : '/login-spring-bg.webp'
                : place.image;
              return (
                <article key={place.contentId} className="rounded-2xl bg-[#faf8f5] p-3 text-center shadow-[inset_0_0_0_1px_rgba(28,24,20,.05)]">
                  <span className={`relative mx-auto grid h-[88px] w-[88px] place-items-center overflow-hidden rounded-full border-4 ${collected ? 'border-[#fff2e8]' : 'border-[#ece5db]'}`} style={{ outline: '1px solid oklch(0 0 0 / 0.1)' }}>
                    <img
                      className={`h-full w-full object-cover ${collected ? '' : 'opacity-60'}`}
                      src={displayImage}
                      alt={ui.stampAlt.replace('{name}', place.name)}
                      onError={() => setFailedImages(current => current[displayImage]
                        ? current
                        : { ...current, [displayImage]: true })}
                    />
                    {!collected && <span className="absolute inset-0 grid place-items-center bg-white/15"><LockKeyhole size={18} /></span>}
                    {collected && <span className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-[#ff6958] text-white"><Check size={14} /></span>}
                  </span>
                  <div className="mt-2 flex min-h-5 justify-center">
                    {target?.artwork && primaryImageFailed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0ed] px-2 py-1 text-[8px] font-black text-[#9b443e]">
                        <AlertCircle size={9} /> {ui.artDisplayFailed}{fallbackPhoto && !fallbackImageFailed ? ui.photoFallback : ''}
                      </span>
                    ) : target?.artwork ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#efeafe] px-2 py-1 text-[8px] font-black text-[#6650a5]" title={ui.modelTitle.replace('{model}', target.artwork.model)}>
                        <Sparkles size={9} /> {ui.approvedArt}
                      </span>
                    ) : target?.artworkStatus === 'failed' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0ed] px-2 py-1 text-[8px] font-black text-[#9b443e]">
                        <AlertCircle size={9} /> {ui.artGenerationFailed}{fallbackPhoto ? ui.photoFallback : ''}
                      </span>
                    ) : target?.artworkStatus === 'generating' || target?.artworkStatus === 'pending_review' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7df] px-2 py-1 text-[8px] font-black text-[#866d2f]">
                        <Sparkles size={9} /> {target.artworkStatus === 'generating' ? ui.artGenerating : ui.artPending}{fallbackPhoto ? ui.photoFallback : ''}
                      </span>
                    ) : primaryImageFailed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0ed] px-2 py-1 text-[8px] font-black text-[#9b443e]">
                        <AlertCircle size={9} /> {ui.attractionPhotoFailed}
                      </span>
                    ) : fallbackPhoto ? (
                      <span className="rounded-full bg-[#eeeae4] px-2 py-1 text-[8px] font-bold text-[#81786e]">{ui.photoNoAi}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7df] px-2 py-1 text-[8px] font-black text-[#866d2f]">
                        <AlertCircle size={9} /> {ui.imagePreparing}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 truncate text-[10px] font-black">{place.name}</h3>
                  {target?.checkpointRequired && (
                    <p className={`mt-1 inline-flex items-center gap-1 text-[8px] font-black ${hasCheckpoint ? 'text-[#2f7567]' : 'text-[#9a6b43]'}`}>
                      <QrCode size={9} /> {hasCheckpoint ? ui.qrReady : ui.qrRequired}
                    </p>
                  )}
                  <button type="button" onClick={() => void verify(place)} disabled={busy || loading} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-[#223c72] px-3 text-[9px] font-black text-white transition-transform active:scale-[0.96] disabled:opacity-50">
                    {busy ? <LoaderCircle size={12} className="animate-spin" /> : <MapPin size={12} />}
                    {collected ? ui.recheck : ui.check}
                  </button>
                  {lastFix && (
                    <p className="mt-1 text-pretty text-[8px] leading-3 text-[#8c929c]">
                      {ui.distanceHint
                        .replace('{distance}', String(Math.round(haversineMeters(lastFix, { lat: place.coordinates[0], lng: place.coordinates[1] }))))
                        .replace('{radius}', String(target?.radiusMeters ?? 150))}
                    </p>
                  )}
                  {messages[place.contentId] && (
                    <p className={`mt-2 text-pretty text-[8px] leading-3 ${status === 'success' || status === 'duplicate' ? 'text-[#39805e]' : 'text-[#a84d47]'}`} role={status === 'success' || status === 'duplicate' ? 'status' : 'alert'}>
                      {messages[place.contentId]}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {onExplore && <button type="button" onClick={onExplore} className="mt-5 min-h-11 w-full rounded-xl bg-[#ff755f] text-[11px] font-black text-white transition-transform active:scale-[0.96]">{ui.explore}</button>}
      </div>
    </section>
  );
}
