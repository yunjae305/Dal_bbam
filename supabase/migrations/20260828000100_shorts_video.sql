alter table public.shorts
  add column if not exists video_url text null,
  add column if not exists youtube_video_id text null;

alter table public.shorts
  drop constraint if exists shorts_youtube_video_id_format,
  drop constraint if exists shorts_video_url_format,
  drop constraint if exists shorts_single_video_source;

alter table public.shorts
  add constraint shorts_youtube_video_id_format
    check (youtube_video_id is null or youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  add constraint shorts_video_url_format
    check (video_url is null or video_url ~* '^(https?://|/[^/]).*\.mp4([?#].*)?$'),
  add constraint shorts_single_video_source
    check (video_url is null or youtube_video_id is null);

comment on column public.shorts.video_url is
  'Direct HTTP(S) or same-origin MP4 source for a vertical short.';
comment on column public.shorts.youtube_video_id is
  'Normalized 11-character YouTube video ID; URLs are normalized by the API.';

create index if not exists short_interactions_short_idx
  on public.short_interactions (short_id);
