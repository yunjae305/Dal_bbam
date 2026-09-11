'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { LoaderCircle, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { resolveShortVideoSource } from '@/shared/shorts-video';
import type { ShortItem } from '@/shared/types';
import { uiMessages } from '@/shared/ui-messages';

type Props = {
  item: ShortItem;
  active: boolean;
  autoPlay: boolean;
  labels?: (typeof uiMessages)['ko']['video'];
};

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.round(totalSeconds)) : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

export function ShortVideoPlayer({ item, active, autoPlay, labels }: Props) {
  const ui = labels ?? uiMessages.ko.video;
  const source = resolveShortVideoSource(item);
  const sourceKey = source.kind === 'youtube'
    ? `youtube:${source.youtubeVideoId}`
    : source.kind === 'mp4' ? `mp4:${source.videoUrl}` : 'none';
  const mediaId = `short-media-${useId().replace(/:/g, '')}`;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [playOverride, setPlayOverride] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [youtubeReady, setYoutubeReady] = useState(false);
  const [youtubeLoaded, setYoutubeLoaded] = useState(false);
  const [mediaBuffering, setMediaBuffering] = useState(false);
  const desiredPlaying = active && (playOverride ?? autoPlay) && !failed;

  const youtubeUrl = useMemo(() => {
    if (source.kind !== 'youtube') return '';
    const params = new URLSearchParams({
      enablejsapi: '1',
      playsinline: '1',
      mute: '1',
      controls: '0',
      rel: '0',
      loop: '1',
      playlist: source.youtubeVideoId,
      playerapiid: mediaId
    });
    return `https://www.youtube-nocookie.com/embed/${source.youtubeVideoId}?${params}`;
  }, [mediaId, source]);

  const commandYouTube = useCallback((func: string, args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({
      event: 'command',
      func,
      args
    }), 'https://www.youtube-nocookie.com');
  }, []);

  useEffect(() => {
    if (source.kind !== 'youtube') return;
    function receiveYouTubeEvent(event: MessageEvent) {
      if (event.origin !== 'https://www.youtube-nocookie.com' || event.source !== iframeRef.current?.contentWindow) return;
      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (payload?.event === 'onReady') {
          setYoutubeReady(true);
          commandYouTube('addEventListener', ['onError']);
          commandYouTube('addEventListener', ['onStateChange']);
        }
        // YouTube player state 3 is buffering; 1 is playing.
        if (payload?.event === 'onStateChange') {
          setPlaying(payload.info === 1);
          setMediaBuffering(payload.info === 3);
        }
        if (payload?.event === 'infoDelivery' && typeof payload.info?.playerState === 'number') {
          setPlaying(payload.info.playerState === 1);
          setMediaBuffering(payload.info.playerState === 3);
        }
        if (payload?.event === 'onError') {
          setFailed(true);
          setPlaying(false);
          setMediaBuffering(false);
        }
      } catch {
        // Ignore unrelated messages from the embedded player.
      }
    }
    window.addEventListener('message', receiveYouTubeEvent);
    return () => window.removeEventListener('message', receiveYouTubeEvent);
  }, [commandYouTube, source.kind]);

  // The IFrame API only starts reporting onReady/onStateChange after the parent
  // sends the "listening" handshake; repeat it until the player answers.
  useEffect(() => {
    if (source.kind !== 'youtube' || !youtubeLoaded || youtubeReady || failed) return;
    const send = () => iframeRef.current?.contentWindow?.postMessage(JSON.stringify({
      event: 'listening',
      id: mediaId,
      channel: 'widget'
    }), 'https://www.youtube-nocookie.com');
    send();
    const timer = window.setInterval(send, 250);
    const stop = window.setTimeout(() => window.clearInterval(timer), 8_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [failed, mediaId, source.kind, youtubeLoaded, youtubeReady]);

  useEffect(() => {
    if (source.kind === 'mp4' && videoRef.current) videoRef.current.muted = muted;
    if (source.kind === 'youtube' && youtubeReady && !failed) commandYouTube(muted ? 'mute' : 'unMute');
  }, [commandYouTube, failed, muted, source.kind, youtubeReady]);

  useEffect(() => {
    if (source.kind === 'mp4') {
      const video = videoRef.current;
      if (!video || failed) return;
      if (!desiredPlaying) {
        video.pause();
        return;
      }

      let cancelled = false;
      const playback = video.play();
      if (playback) {
        void playback.then(() => {
          if (!cancelled) setPlaying(true);
        }).catch(() => {
          if (!cancelled) setPlaying(false);
        });
      }
      return () => {
        cancelled = true;
        video.pause();
      };
    }

    if (source.kind === 'youtube' && youtubeReady && !failed) {
      commandYouTube(desiredPlaying ? 'playVideo' : 'pauseVideo');
    }
  }, [commandYouTube, desiredPlaying, failed, source.kind, sourceKey, youtubeReady]);

  function togglePlayback() {
    const next = !playing;
    setPlayOverride(next);
    if (source.kind === 'mp4' && videoRef.current) {
      if (next && active) {
        const playback = videoRef.current.play();
        if (playback) void playback.catch(() => setPlaying(false));
      } else {
        videoRef.current.pause();
        setPlaying(false);
      }
    }
    if (source.kind === 'youtube') {
      commandYouTube(next ? 'playVideo' : 'pauseVideo');
      setPlaying(next && active);
    }
  }

  function toggleMuted() {
    const next = !muted;
    setMuted(next);
    if (source.kind === 'mp4' && videoRef.current) videoRef.current.muted = next;
    if (source.kind === 'youtube') commandYouTube(next ? 'mute' : 'unMute');
  }

  const hasVideo = source.kind !== 'none' && !failed;
  // The embed reports nothing until its API handshake lands, so count that wait as buffering.
  const buffering = hasVideo && (mediaBuffering || (source.kind === 'youtube' && desiredPlaying && !youtubeReady));
  return (
    <div className="absolute inset-0 bg-[#292c30]">
      <img
        src={posterFailed ? '/login-spring-bg.webp' : item.imageUrl}
        alt={hasVideo ? '' : item.title}
        className="absolute inset-0 h-full w-full object-cover outline outline-1 -outline-offset-1 outline-white/10"
        onError={() => setPosterFailed(true)}
      />

      {source.kind === 'mp4' && !failed && (
        <video
          ref={videoRef}
          id={mediaId}
          src={source.videoUrl}
          poster={item.imageUrl}
          muted={muted}
          playsInline
          loop
          preload="metadata"
          disablePictureInPicture
          aria-label={ui.videoLabel.replace('{title}', item.title)}
          className="absolute inset-0 h-full w-full object-cover outline outline-1 -outline-offset-1 outline-white/10"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onWaiting={() => setMediaBuffering(true)}
          onStalled={() => setMediaBuffering(true)}
          onPlaying={() => setMediaBuffering(false)}
          onCanPlay={() => setMediaBuffering(false)}
          onError={() => {
            setFailed(true);
            setPlaying(false);
            setMediaBuffering(false);
          }}
        />
      )}

      {source.kind === 'youtube' && !failed && (
        <iframe
          ref={iframeRef}
          id={mediaId}
          src={youtubeUrl}
          title={ui.youtubeTitle.replace('{title}', item.title)}
          tabIndex={-1}
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="pointer-events-none absolute inset-0 h-full w-full border-0 outline outline-1 -outline-offset-1 outline-white/10"
          onLoad={() => setYoutubeLoaded(true)}
          onError={() => {
            setFailed(true);
            setPlaying(false);
          }}
        />
      )}

      <div className="absolute left-3 top-3 z-10 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-black tabular-nums text-white shadow-sm ring-1 ring-white/10 backdrop-blur">
        {formatDuration(item.durationSeconds)}
      </div>

      {buffering && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <LoaderCircle size={34} aria-hidden="true" className="animate-spin text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]" />
          <span role="status" className="sr-only">{ui.buffering}</span>
        </div>
      )}

      {failed && (
        <p role="status" className="absolute left-3 right-3 top-14 z-10 rounded-xl bg-black/65 px-3 py-2 text-pretty text-[10px] font-bold text-white backdrop-blur">
          {ui.failed}
        </p>
      )}

      {hasVideo && (
        <div className="absolute right-3 top-3 z-10 flex gap-2">
          <MediaButton
            label={playing ? ui.pause : ui.play}
            pressed={playing}
            controls={mediaId}
            onClick={togglePlayback}
          >
            {playing
              ? <Pause size={18} fill="currentColor" />
              : <Play size={18} fill="currentColor" className="translate-x-px" />}
          </MediaButton>
          <MediaButton
            label={muted ? ui.unmute : ui.mute}
            pressed={!muted}
            controls={mediaId}
            onClick={toggleMuted}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </MediaButton>
        </div>
      )}
    </div>
  );
}

function MediaButton({
  label,
  pressed,
  controls,
  onClick,
  children
}: {
  label: string;
  pressed: boolean;
  controls: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-controls={controls}
      onClick={onClick}
      className="grid min-h-11 min-w-11 place-items-center rounded-full bg-black/55 text-white shadow-sm ring-1 ring-white/10 backdrop-blur transition-[transform,background-color] duration-150 ease-out hover:bg-black/70 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}
