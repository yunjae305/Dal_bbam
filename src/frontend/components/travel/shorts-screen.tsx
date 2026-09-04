'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Heart, LoaderCircle, Pause, Share2, Volume2 } from 'lucide-react';
import type { ShortItem } from '@/shared/types';
import { EmptyState } from '@/frontend/components/common/feedback';
import { ShortVideoPlayer } from '@/frontend/components/travel/short-video-player';
import { useLocale } from '@/frontend/i18n/locale-context';
import { uiMessages } from '@/shared/ui-messages';

function useAutoplayEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setEnabled(!preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  return enabled;
}

function usePageVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

export function ShortsScreen() {
  const { locale, messages } = useLocale();
  const ui = uiMessages[locale].shorts;
  const [items, setItems] = useState<ShortItem[]>([]);
  const [activeTag, setActiveTag] = useState('');
  const [activeId, setActiveId] = useState('');
  const [loadedKey, setLoadedKey] = useState('');
  const [playingNarrationId, setPlayingNarrationId] = useState('');
  const [error, setError] = useState('');
  const [reactionsEnabled, setReactionsEnabled] = useState(true);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoplayEnabled = useAutoplayEnabled();
  const pageVisible = usePageVisible();
  const requestKey = `${locale}\u0000${activeTag}`;
  const loading = loadedKey !== requestKey;
  const visibleError = loading ? '' : error;
  const activeItemId = items.some(item => item.id === activeId) ? activeId : items[0]?.id ?? '';

  useEffect(() => {
    const controller = new AbortController();

    const params = new URLSearchParams({ lang: locale });
    if (activeTag) params.set('tag', activeTag);
    void fetch(`/api/shorts?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message ?? ui.loadFailed);
        setItems(Array.isArray(payload.data) ? payload.data : []);
        setReactionsEnabled(payload?.meta?.reactionsEnabled !== false && payload?.meta?.fallback !== true);
        setError('');
        setLoadedKey(requestKey);
      })
      .catch(cause => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setItems([]);
        setError(cause instanceof Error ? cause.message : ui.loadFailed);
        setLoadedKey(requestKey);
      });

    return () => {
      controller.abort();
      audioRef.current?.pause();
    };
  }, [locale, activeTag, requestKey, ui.loadFailed]);

  // A shared link is /shorts#<id>; the cards render after the fetch, so scroll once they exist.
  useEffect(() => {
    if (!items.length) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash || !items.some(item => item.id === hash)) return;
    const target = document.getElementById(hash);
    if (target) {
      target.scrollIntoView({ block: 'start' });
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [items]);

  useEffect(() => {
    const container = feedRef.current;
    if (!container || !items.length) return;

    const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-short-id]'));
    if (!('IntersectionObserver' in window)) return;

    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.shortId;
        if (id) ratios.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
      }
      const [bestId, bestRatio] = Array.from(ratios.entries())
        .sort((left, right) => right[1] - left[1])[0] ?? ['', 0];
      setActiveId(bestRatio >= 0.45 ? bestId : '');
    }, {
      rootMargin: '-12% 0px -18% 0px',
      threshold: [0, 0.25, 0.45, 0.65, 0.8, 1]
    });
    cards.forEach(card => observer.observe(card));
    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    if (!pageVisible || (playingNarrationId && playingNarrationId !== activeItemId)) {
      audioRef.current?.pause();
    }
  }, [activeItemId, pageVisible, playingNarrationId]);

  const tags = useMemo(
    () => Array.from(new Set(items.flatMap(item => item.tags))).slice(0, 10),
    [items]
  );

  function toggleAudio(item: ShortItem) {
    if (playingNarrationId === item.id) {
      audioRef.current?.pause();
      setPlayingNarrationId('');
      return;
    }

    audioRef.current?.pause();
    const source = item.audioUrl || `/api/ai/narrations/${encodeURIComponent(item.contentId)}/audio?lang=${locale}`;
    const audio = new Audio(source);
    audioRef.current = audio;
    audio.onpause = () => setPlayingNarrationId(current => current === item.id ? '' : current);
    audio.onended = () => setPlayingNarrationId(current => current === item.id ? '' : current);
    audio.onerror = () => {
      setPlayingNarrationId(current => current === item.id ? '' : current);
      setError(ui.audioFailed);
    };
    setPlayingNarrationId(item.id);
    void audio.play().catch(() => {
      setPlayingNarrationId('');
      setError(ui.audioFailed);
    });
  }

  async function react(item: ShortItem, action: 'like' | 'save') {
    if (!reactionsEnabled) {
      setError(ui.reactionsUnavailable);
      return;
    }
    const key = action === 'like' ? 'liked' : 'saved';
    const value = !item[key];
    setItems(current => current.map(entry => entry.id === item.id ? {
      ...entry,
      [key]: value,
      likeCount: action === 'like' ? Math.max(0, entry.likeCount + (value ? 1 : -1)) : entry.likeCount
    } : entry));

    try {
      const response = await fetch('/api/shorts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortId: item.id, action, value })
      });
      if (!response.ok) throw new Error();
    } catch {
      setItems(current => current.map(entry => entry.id === item.id ? {
        ...entry,
        [key]: !value,
        likeCount: action === 'like' ? Math.max(0, entry.likeCount + (value ? -1 : 1)) : entry.likeCount
      } : entry));
      setError(ui.reactionFailed);
    }
  }

  async function share(item: ShortItem) {
    const url = `${window.location.origin}/shorts#${encodeURIComponent(item.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: item.title, text: item.summary, url });
      else await navigator.clipboard.writeText(url);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(ui.shareFailed);
    }
  }

  return (
    <section className="h-[calc(100dvh-48px-72px-env(safe-area-inset-bottom))] snap-y snap-mandatory overflow-y-auto overscroll-y-contain bg-[#151719] text-white">
      <header className="sticky top-0 z-20 bg-[#151719]/90 px-5 pb-3 pt-5 backdrop-blur">
        <h1 className="text-balance text-xl font-black">{ui.title}</h1>
        <div className="mt-3 flex gap-2 overflow-x-auto" aria-label={ui.filters}>
          <TagButton active={!activeTag} onClick={() => setActiveTag('')}>{messages.common.all}</TagButton>
          {tags.map(tag => (
            <TagButton key={tag} active={activeTag === tag} onClick={() => setActiveTag(tag)}>#{tag}</TagButton>
          ))}
        </div>
      </header>

      {visibleError && <p className="mx-5 mb-3 rounded-xl bg-red-950/70 p-3 text-pretty text-[10px]" role="alert">{visibleError}</p>}
      {loading ? (
        <div className="grid min-h-[60dvh] place-items-center" role="status" aria-label={ui.loading}>
          <LoaderCircle className="animate-spin motion-reduce:animate-none" />
        </div>
      ) : !items.length ? (
        <div className="p-5 text-black"><EmptyState /></div>
      ) : (
        <div ref={feedRef} className="space-y-4 px-4 pb-24">
          {items.map(item => (
            <article
              key={item.id}
              id={item.id}
              data-short-id={item.id}
              className="relative aspect-[9/16] min-h-[70dvh] scroll-mt-28 snap-start snap-always overflow-hidden rounded-3xl bg-[#292c30] outline outline-1 -outline-offset-1 outline-white/10"
            >
              <ShortVideoPlayer
                key={`${item.id}:${item.youtubeVideoId ?? item.videoUrl ?? item.imageUrl}`}
                item={item}
                active={pageVisible && activeItemId === item.id && playingNarrationId !== item.id}
                autoPlay={autoplayEnabled}
                labels={uiMessages[locale].video}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/10" />
              <div className="absolute inset-x-0 bottom-0 p-5 pr-20">
                <p className="text-[9px] font-black text-white/70">{item.isAiGenerated ? 'AI TOUR STORY' : 'TOUR STORY'}</p>
                <h2 className="mt-2 text-balance text-xl font-black leading-tight">{item.title}</h2>
                <p className="mt-3 text-pretty text-[12px] leading-5 text-white/85">{item.summary}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.tags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setActiveTag(tag)}
                      className="min-h-11 rounded-full px-2 text-[10px] font-bold text-white/75 transition-colors duration-150 ease-out hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
                {item.isAiGenerated && (
                  <p className="mt-1 inline-flex items-center gap-1 text-[9px] text-white/60">
                    <Volume2 size={11} aria-hidden="true" /> {messages.ai.disclosure}
                  </p>
                )}
              </div>
              <div className="absolute bottom-6 right-3 z-10 flex flex-col gap-2">
                <ActionButton
                  label={playingNarrationId === item.id ? messages.ai.pause : messages.ai.listen}
                  pressed={playingNarrationId === item.id}
                  onClick={() => toggleAudio(item)}
                >
                  {playingNarrationId === item.id
                    ? <Pause size={20} fill="currentColor" />
                    : <Volume2 size={20} />}
                </ActionButton>
                {reactionsEnabled && <ActionButton
                  label={ui.likeCount.replace('{count}', String(item.likeCount))}
                  caption={String(item.likeCount)}
                  pressed={item.liked}
                  tabular
                  onClick={() => void react(item, 'like')}
                >
                  <Heart
                    size={20}
                    fill={item.liked ? 'currentColor' : 'none'}
                    className={`transition-colors duration-150 ease-out motion-reduce:transition-none ${item.liked ? 'text-[#ff665a]' : ''}`}
                  />
                </ActionButton>}
                {reactionsEnabled && <ActionButton
                  label={messages.common.save}
                  pressed={item.saved}
                  onClick={() => void react(item, 'save')}
                >
                  <Bookmark size={20} fill={item.saved ? 'currentColor' : 'none'} />
                </ActionButton>}
                <ActionButton label={messages.common.share} onClick={() => void share(item)}>
                  <Share2 size={20} />
                </ActionButton>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function TagButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 shrink-0 rounded-full px-3 text-[10px] font-black transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none ${active ? 'bg-white text-black' : 'bg-white/10 text-white'}`}
    >
      {children}
    </button>
  );
}

function ActionButton({
  label,
  caption,
  pressed,
  tabular = false,
  onClick,
  children
}: {
  label: string;
  caption?: string;
  pressed?: boolean;
  tabular?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className="flex min-h-11 min-w-11 w-14 flex-col items-center justify-center gap-1 rounded-xl text-center text-[8px] font-bold text-white drop-shadow transition-transform duration-150 ease-out active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
    >
      {children}
      <span className={tabular ? 'tabular-nums' : undefined}>{caption ?? label}</span>
    </button>
  );
}
