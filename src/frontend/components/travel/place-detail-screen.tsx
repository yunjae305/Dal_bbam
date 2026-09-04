'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, ChevronLeft, LoaderCircle, MapPin, Pause, Play, Share2, Volume2 } from 'lucide-react';
import type { Narration, PlaceDetail } from '@/shared/types';
import { EmptyState } from '@/frontend/components/common/feedback';
import { useLocale } from '@/frontend/i18n/locale-context';
import { uiMessages } from '@/shared/ui-messages';

export function PlaceDetailScreen({ contentId }: { contentId: string }) {
  const router = useRouter();
  const { locale, messages } = useLocale();
  const ui = uiMessages[locale].place;
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [narration, setNarration] = useState<Narration | null>(null);
  const [loading, setLoading] = useState(true);
  const [narrationLoading, setNarrationLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setLoading(true);
    // Narration and its cached audio belong to the previous language.
    setNarration(null);
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
    fetch(`/api/places/${encodeURIComponent(contentId)}?lang=${locale}`, { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message ?? ui.loadFailed);
        setPlace(payload.data);
        const key = 'dal-bbam-recent-places';
        const previous = JSON.parse(window.localStorage.getItem(key) || '[]') as string[];
        window.localStorage.setItem(key, JSON.stringify([contentId, ...previous.filter(id => id !== contentId)].slice(0, 8)));
        const viewKey = `dal-bbam-view:${contentId}`;
        if (!window.sessionStorage.getItem(viewKey)) {
          window.sessionStorage.setItem(viewKey, 'pending');
          void fetch(`/api/places/${encodeURIComponent(contentId)}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'view' }),
            keepalive: true
          }).then(response => {
            if (!response.ok) window.sessionStorage.removeItem(viewKey);
            else window.sessionStorage.setItem(viewKey, 'recorded');
          }).catch(() => window.sessionStorage.removeItem(viewKey));
        }
      })
      .catch(error => setNotice(error instanceof Error ? error.message : ui.loadFailed))
      .finally(() => setLoading(false));
  }, [contentId, locale, ui.loadFailed]);
  useEffect(() => () => audioRef.current?.pause(), []);

  async function loadNarration() {
    setNarrationLoading(true);
    setNotice('');
    try {
      const response = await fetch(`/api/ai/narrations/${encodeURIComponent(contentId)}?lang=${locale}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? ui.narrationFailed);
      setNarration(payload.data);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : ui.narrationFailed);
    } finally {
      setNarrationLoading(false);
    }
  }

  function playNarration() {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    const audio = audioRef.current ?? new Audio(`/api/ai/narrations/${encodeURIComponent(contentId)}/audio?lang=${locale}`);
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.onerror = () => {
      setPlaying(false);
      setNotice(ui.audioFailed);
    };
    audio.play().then(() => setPlaying(true)).catch(() => {
      setPlaying(false);
      setNotice(ui.audioFailed);
    });
  }

  async function addToCart() {
    try {
      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId })
      });
      const payload = await response.json().catch(() => null);
      setNotice(response.ok ? ui.cartSaved : payload?.error?.message ?? ui.saveFailed);
    } catch {
      setNotice(ui.saveFailed);
    }
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: place?.name, text: place?.description, url });
      } else {
        await navigator.clipboard.writeText(url);
        setNotice(ui.copied);
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setNotice(ui.shareFailed);
    }
  }

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push('/map');
  }

  if (loading) return <div className="grid min-h-dvh place-items-center"><LoaderCircle className="animate-spin" /></div>;
  if (!place) return <main className="p-5"><EmptyState title={ui.notFound} description={notice} /></main>;

  return (
    <main className="min-h-dvh bg-[#f7f4ef] pb-28">
      <div className="relative h-[42dvh] min-h-[300px]">
        <img src={place.imageUrl} alt={place.name} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/35" />
        <button type="button" onClick={goBack} className="absolute left-4 top-5 grid h-10 w-10 place-items-center rounded-full bg-black/30 text-white backdrop-blur" aria-label={ui.backToMap}><ChevronLeft /></button>
        <button type="button" onClick={share} className="absolute right-4 top-5 grid h-10 w-10 place-items-center rounded-full bg-black/30 text-white backdrop-blur" aria-label={messages.common.share}><Share2 size={18} /></button>
        <div className="absolute inset-x-5 bottom-5 text-white">
          <p className="text-[10px] font-black">{messages.categories[place.category]} · {place.source}</p>
          <h1 className="mt-2 text-3xl font-black">{place.name}</h1>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-white/80"><MapPin size={13} /> {place.address}</p>
        </div>
      </div>

      <div className="space-y-4 px-5 pt-5">
        {notice && <p className="rounded-xl bg-[#fff0eb] p-3 text-[10px] font-bold text-[#9b4d45]" role="status">{notice}</p>}
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-[14px] font-black">{ui.information}</h2>
          <p className="mt-3 whitespace-pre-line text-[12px] leading-6 text-[#616a67]">{place.overview || place.description}</p>
          <dl className="mt-4 space-y-2 text-[10px]">
            {place.openingHours && <div><dt className="font-black">{ui.hours}</dt><dd className="mt-1 text-[#6f7875]">{place.openingHours}</dd></div>}
            {place.phone && <div><dt className="font-black">{ui.phone}</dt><dd className="mt-1 text-[#6f7875]">{place.phone}</dd></div>}
          </dl>
        </section>

        <section className="rounded-2xl bg-[#223c72] p-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-1 text-[9px] font-black text-white/60"><Volume2 size={12} /> {messages.ai.narration}</p>
              <h2 className="mt-2 text-[16px] font-black">{narration?.title ?? ui.narrationPrompt}</h2>
            </div>
            {narration && <button type="button" onClick={playNarration} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[#223c72]" aria-label={playing ? messages.ai.pause : messages.ai.listen}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>}
          </div>
          {narration ? (
            <>
              <p className="mt-3 text-[11px] leading-5 text-white/80">{narration.narration}</p>
              <p className="mt-3 text-[9px] text-white/55">{narration.isAiGenerated ? messages.ai.disclosure : messages.ai.fallback}</p>
            </>
          ) : (
            <button type="button" onClick={loadNarration} disabled={narrationLoading} className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[10px] font-black text-[#223c72]">
              {narrationLoading ? <LoaderCircle size={14} className="animate-spin" /> : <Volume2 size={14} />} {messages.ai.narration}
            </button>
          )}
        </section>

        <button type="button" onClick={addToCart} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ff5b4f] text-[12px] font-black text-white"><Bookmark size={17} /> {ui.saveToCart}</button>
      </div>
    </main>
  );
}
