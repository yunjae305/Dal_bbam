'use client';

import { useEffect, useRef, useState } from 'react';
import { Bookmark, Heart, LoaderCircle, Pause, Play, Share2, Volume2 } from 'lucide-react';
import type { ShortItem } from '@/shared/types';
import { EmptyState } from '@/frontend/components/common/feedback';
import { useLocale } from '@/frontend/i18n/locale-context';

export function ShortsScreen() {
  const { locale, messages } = useLocale();
  const [items, setItems] = useState<ShortItem[]>([]);
  const [activeTag, setActiveTag] = useState('');
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState('');
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ lang: locale });
      if (activeTag) params.set('tag', activeTag);
      const response = await fetch(`/api/shorts?${params}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '쇼츠를 불러오지 못했습니다.');
      setItems(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '쇼츠를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [locale, activeTag]);
  useEffect(() => () => audioRef.current?.pause(), []);

  const tags = Array.from(new Set(items.flatMap(item => item.tags))).slice(0, 10);

  function toggleAudio(item: ShortItem) {
    if (playingId === item.id) {
      audioRef.current?.pause();
      setPlayingId('');
      return;
    }
    audioRef.current?.pause();
    const source = item.audioUrl || `/api/ai/narrations/${encodeURIComponent(item.contentId)}/audio?lang=${locale}`;
    const audio = new Audio(source);
    audioRef.current = audio;
    audio.onended = () => setPlayingId('');
    audio.onerror = () => {
      setPlayingId('');
      setError('음성을 재생하지 못했습니다.');
    };
    setPlayingId(item.id);
    void audio.play();
  }

  async function react(item: ShortItem, action: 'like' | 'save') {
    const key = action === 'like' ? 'liked' : 'saved';
    const value = !item[key];
    setItems(current => current.map(entry => entry.id === item.id ? {
      ...entry,
      [key]: value,
      likeCount: action === 'like' ? Math.max(0, entry.likeCount + (value ? 1 : -1)) : entry.likeCount
    } : entry));

    const response = await fetch('/api/shorts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shortId: item.id, action, value })
    });
    if (!response.ok) {
      setError('샘플 쇼츠의 반응은 데이터 동기화 후 저장됩니다.');
    }
  }

  async function share(item: ShortItem) {
    const url = `${window.location.origin}/shorts#${encodeURIComponent(item.id)}`;
    if (navigator.share) await navigator.share({ title: item.title, text: item.summary, url });
    else await navigator.clipboard.writeText(url);
  }

  return (
    <section className="min-h-dvh bg-[#151719] pb-24 text-white">
      <header className="sticky top-0 z-20 bg-[#151719]/90 px-5 pb-3 pt-5 backdrop-blur">
        <h1 className="text-xl font-black">경주 쇼츠</h1>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          <button type="button" onClick={() => setActiveTag('')} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black ${!activeTag ? 'bg-white text-black' : 'bg-white/10'}`}>{messages.common.all}</button>
          {tags.map(tag => <button key={tag} type="button" onClick={() => setActiveTag(tag)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black ${activeTag === tag ? 'bg-white text-black' : 'bg-white/10'}`}>#{tag}</button>)}
        </div>
      </header>

      {error && <p className="mx-5 mb-3 rounded-xl bg-red-950/70 p-3 text-[10px]" role="alert">{error}</p>}
      {loading ? (
        <div className="grid min-h-[60dvh] place-items-center"><LoaderCircle className="animate-spin" /></div>
      ) : !items.length ? (
        <div className="p-5 text-black"><EmptyState /></div>
      ) : (
        <div className="snap-y snap-mandatory space-y-4 px-4">
          {items.map(item => (
            <article key={item.id} id={item.id} className="relative min-h-[70dvh] snap-start overflow-hidden rounded-3xl bg-[#292c30]">
              <img src={item.imageUrl} alt={item.title} className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/10" />
              <div className="absolute inset-x-0 bottom-0 p-5 pr-20">
                <p className="text-[9px] font-black text-white/70">{item.isAiGenerated ? 'AI TOUR STORY' : 'TOUR STORY'}</p>
                <h2 className="mt-2 text-xl font-black leading-tight">{item.title}</h2>
                <p className="mt-3 text-[12px] leading-5 text-white/85">{item.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.tags.map(tag => <button key={tag} type="button" onClick={() => setActiveTag(tag)} className="text-[10px] font-bold text-white/75">#{tag}</button>)}
                </div>
                {item.isAiGenerated && <p className="mt-3 inline-flex items-center gap-1 text-[9px] text-white/60"><Volume2 size={11} /> {messages.ai.disclosure}</p>}
              </div>
              <div className="absolute bottom-6 right-4 flex flex-col gap-4">
                <ActionButton label={playingId === item.id ? messages.ai.pause : messages.ai.listen} onClick={() => toggleAudio(item)}>
                  {playingId === item.id ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                </ActionButton>
                <ActionButton label={`좋아요 ${item.likeCount}`} onClick={() => react(item, 'like')}>
                  <Heart size={20} fill={item.liked ? 'currentColor' : 'none'} className={item.liked ? 'text-[#ff665a]' : ''} />
                </ActionButton>
                <ActionButton label={messages.common.save} onClick={() => react(item, 'save')}>
                  <Bookmark size={20} fill={item.saved ? 'currentColor' : 'none'} />
                </ActionButton>
                <ActionButton label={messages.common.share} onClick={() => share(item)}><Share2 size={20} /></ActionButton>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="flex w-14 flex-col items-center gap-1 text-center text-[8px] font-bold text-white drop-shadow" aria-label={label}>{children}<span>{label}</span></button>;
}
