
-- ---------------------------------------------------------------
-- >> restore-prelude.sql
-- ---------------------------------------------------------------
-- ================================================================
-- DAL BBAM - Supabase restore script (2026-07-31)
--
-- How to run:
--   Supabase Dashboard -> SQL Editor -> New query -> paste this whole
--   file -> Run
--
-- Contents: dedupe prelude + the 5 files under supabase/migrations
-- in filename order. Safe to run multiple times.
-- ================================================================

-- Prelude: remove duplicate legacy cart rows so the unique index
-- created by the core schema migration cannot fail.
delete from public.cart_items a
using public.cart_items b
where a.user_id is not distinct from b.user_id
  and a.place_id = b.place_id
  and (a.created_at < b.created_at
    or (a.created_at = b.created_at and a.id < b.id));

-- ---------------------------------------------------------------
-- >> 20260709000000_tourism_core_schema.sql
-- ---------------------------------------------------------------
-- Non-destructive base schema for the tourism service.
-- This file intentionally precedes the actor_key migration so a fresh project can
-- apply the complete migration chain. Existing installations only receive missing
-- columns, indexes and policies.

create extension if not exists pgcrypto;

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  content_id text not null,
  content_type_id text null,
  category text not null default 'attraction',
  name text not null,
  description text null,
  overview text null,
  address text null,
  phone text null,
  opening_hours text null,
  homepage_url text null,
  lat double precision null,
  lng double precision null,
  image_url text null,
  tags text[] not null default '{}',
  source text not null default 'tour-api',
  source_updated_at timestamptz null,
  ai_description_ko text null,
  ai_description_en text null,
  ai_description_ja text null,
  ai_description_zh text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.places add column if not exists content_id text;
alter table public.places add column if not exists content_type_id text;
alter table public.places add column if not exists category text default 'attraction';
alter table public.places add column if not exists name text;
alter table public.places add column if not exists description text;
alter table public.places add column if not exists overview text;
alter table public.places add column if not exists address text;
alter table public.places add column if not exists phone text;
alter table public.places add column if not exists opening_hours text;
alter table public.places add column if not exists homepage_url text;
alter table public.places add column if not exists lat double precision;
alter table public.places add column if not exists lng double precision;
alter table public.places add column if not exists image_url text;
alter table public.places add column if not exists tags text[] default '{}';
alter table public.places add column if not exists source text default 'tour-api';
alter table public.places add column if not exists source_updated_at timestamptz;
alter table public.places add column if not exists ai_description_ko text;
alter table public.places add column if not exists ai_description_en text;
alter table public.places add column if not exists ai_description_ja text;
alter table public.places add column if not exists ai_description_zh text;
alter table public.places add column if not exists created_at timestamptz default now();
alter table public.places add column if not exists updated_at timestamptz default now();

create unique index if not exists places_content_id_unique
  on public.places (content_id) where content_id is not null;
create index if not exists places_category_idx on public.places (category);
create index if not exists places_coordinates_idx on public.places (lat, lng);

update public.places
set category = case category
  when '문화재' then 'heritage'
  when '관광지' then 'attraction'
  when '음식점' then 'food'
  when '숙박' then 'lodging'
  when '축제' then 'festival'
  when '자연' then 'nature'
  when '체험' then 'experience'
  else category
end
where category in ('문화재', '관광지', '음식점', '숙박', '축제', '자연', '체험');

create table if not exists public.place_translations (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  lang text not null,
  name text not null,
  description text null,
  overview text null,
  opening_hours text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, lang)
);

create table if not exists public.ai_narrations (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  lang text not null,
  title text not null,
  summary text not null,
  narration text not null,
  tags text[] not null default '{}',
  source_hash text not null,
  prompt_version text not null,
  model text not null,
  audio_path text null,
  is_ai_generated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, lang, source_hash, prompt_version)
);

create table if not exists public.shorts (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  narration_id uuid null references public.ai_narrations(id) on delete set null,
  lang text not null default 'ko',
  title text not null,
  summary text not null,
  narration text not null,
  image_url text null,
  audio_url text null,
  duration_seconds integer not null default 60,
  tags text[] not null default '{}',
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.short_interactions (
  id uuid primary key default gen_random_uuid(),
  actor_key text not null,
  short_id uuid not null references public.shorts(id) on delete cascade,
  liked boolean not null default false,
  saved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (actor_key, short_id)
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  actor_key text null,
  title text not null,
  description text null,
  transport text not null default 'walking',
  is_ai_generated boolean not null default false,
  is_curated boolean not null default false,
  share_token text null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.courses add column if not exists actor_key text;
alter table public.courses add column if not exists transport text default 'walking';
alter table public.courses add column if not exists is_curated boolean default false;
alter table public.courses add column if not exists share_token text;
alter table public.courses add column if not exists metadata jsonb default '{}';
alter table public.courses add column if not exists updated_at timestamptz default now();

create unique index if not exists courses_share_token_unique
  on public.courses (share_token) where share_token is not null;
create index if not exists courses_actor_idx on public.courses (actor_key, created_at desc);

update public.courses
set actor_key = 'supabase:' || user_id::text
where actor_key is null and user_id is not null;

create table if not exists public.course_places (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  order_no integer not null default 0,
  order_index integer not null default 0,
  reason text null,
  stay_minutes integer not null default 60,
  unique (course_id, place_id)
);

alter table public.course_places add column if not exists order_no integer default 0;
alter table public.course_places add column if not exists order_index integer default 0;
alter table public.course_places add column if not exists reason text;
alter table public.course_places add column if not exists stay_minutes integer default 60;

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  actor_key text null,
  title text not null,
  start_date date not null,
  end_date date not null,
  share_token text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schedules add column if not exists actor_key text;
alter table public.schedules add column if not exists share_token text;
alter table public.schedules add column if not exists updated_at timestamptz default now();
create index if not exists schedules_actor_idx on public.schedules (actor_key, start_date);
create unique index if not exists schedules_share_token_unique
  on public.schedules (share_token) where share_token is not null;

update public.schedules
set actor_key = 'supabase:' || user_id::text
where actor_key is null and user_id is not null;

create table if not exists public.schedule_places (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  visit_date date not null,
  start_time time null,
  stay_minutes integer not null default 60,
  sort_order integer not null default 0,
  note text null,
  created_at timestamptz not null default now(),
  unique (schedule_id, visit_date, sort_order)
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  actor_key text null,
  place_id uuid not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.cart_items add column if not exists actor_key text;
drop index if exists public.cart_items_actor_place_unique;
create unique index cart_items_actor_place_unique
  on public.cart_items (actor_key, place_id);
create index if not exists cart_items_actor_idx on public.cart_items (actor_key, created_at desc);

update public.cart_items
set actor_key = 'supabase:' || user_id::text
where actor_key is null and user_id is not null;

create table if not exists public.stamps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  actor_key text null,
  place_id uuid not null references public.places(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision null,
  distance_m double precision null
);

create table if not exists public.badge_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ko text not null,
  name_en text not null,
  name_ja text not null,
  name_zh text not null,
  description_ko text not null,
  description_en text not null,
  description_ja text not null,
  description_zh text not null,
  icon text not null default 'award',
  stamp_threshold integer null,
  course_id uuid null references public.courses(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  actor_key text not null,
  badge_id uuid not null references public.badge_definitions(id) on delete cascade,
  earned_at timestamptz not null default now(),
  unique (actor_key, badge_id)
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  actor_key text not null,
  author_name text not null default '여행자',
  category text not null,
  place_id uuid null references public.places(id) on delete set null,
  title text not null,
  content text not null,
  rating smallint null,
  status text not null default 'published',
  moderation jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_rating_range check (rating is null or rating between 1 and 5)
);

create index if not exists community_posts_feed_idx
  on public.community_posts (status, created_at desc);
create index if not exists community_posts_place_idx
  on public.community_posts (place_id, created_at desc);

create table if not exists public.community_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid null references public.community_posts(id) on delete cascade,
  actor_key text not null,
  staging_path text not null,
  public_path text null,
  mime_type text not null,
  size_bytes bigint not null,
  status text not null default 'staged',
  moderation jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.community_bookmarks (
  id uuid primary key default gen_random_uuid(),
  actor_key text not null,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (actor_key, post_id)
);

create table if not exists public.location_consents (
  id uuid primary key default gen_random_uuid(),
  actor_key text not null,
  consent_version text not null,
  granted boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists location_consents_actor_idx
  on public.location_consents (actor_key, created_at desc);

create table if not exists public.place_events (
  id bigint generated by default as identity primary key,
  actor_key text null,
  place_id uuid not null references public.places(id) on delete cascade,
  event_type text not null,
  event_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists place_events_ranking_idx
  on public.place_events (event_date desc, event_type, place_id);

create table if not exists public.api_rate_limits (
  actor_key text not null,
  scope text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  primary key (actor_key, scope, window_started_at)
);

create or replace function public.replace_schedule_places(
  p_schedule_id uuid,
  p_actor_key text,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.schedules
    where id = p_schedule_id and actor_key = p_actor_key
  ) then
    raise exception 'schedule_not_found';
  end if;

  delete from public.schedule_places where schedule_id = p_schedule_id;

  insert into public.schedule_places (
    schedule_id, place_id, visit_date, start_time, stay_minutes, sort_order, note
  )
  select
    p_schedule_id,
    item.place_id,
    item.visit_date,
    item.start_time,
    item.stay_minutes,
    item.sort_order,
    item.note
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as item(
    place_id uuid,
    visit_date date,
    start_time time,
    stay_minutes integer,
    sort_order integer,
    note text
  );
end;
$$;

revoke all on function public.replace_schedule_places(uuid, text, jsonb) from public, anon, authenticated;

-- Seed badge definitions without overwriting administrator changes.
insert into public.badge_definitions (
  code, name_ko, name_en, name_ja, name_zh,
  description_ko, description_en, description_ja, description_zh,
  icon, stamp_threshold
) values
  ('first-step', '첫 발자국', 'First Step', '最初の一歩', '第一步',
   '첫 스탬프를 획득했어요.', 'Earn your first stamp.', '最初のスタンプを獲得しました。', '获得第一枚印章。',
   'footprints', 1),
  ('silla-explorer', '신라 탐험가', 'Silla Explorer', '新羅探検家', '新罗探险家',
   '스탬프 3개를 획득했어요.', 'Earn three stamps.', 'スタンプを3個獲得しました。', '获得三枚印章。',
   'crown', 3),
  ('gyeongju-master', '경주 여행 달인', 'Gyeongju Master', '慶州旅行の達人', '庆州旅行达人',
   '스탬프 7개를 획득했어요.', 'Earn seven stamps.', 'スタンプを7個獲得しました。', '获得七枚印章。',
   'award', 7)
on conflict (code) do nothing;

-- Public catalogue content is readable. User-owned tables stay server-only for
-- custom JWT compatibility; Supabase-authenticated users still receive explicit
-- own-row policies.
alter table public.places enable row level security;
alter table public.place_translations enable row level security;
alter table public.ai_narrations enable row level security;
alter table public.shorts enable row level security;
alter table public.short_interactions enable row level security;
alter table public.courses enable row level security;
alter table public.course_places enable row level security;
alter table public.schedules enable row level security;
alter table public.schedule_places enable row level security;
alter table public.cart_items enable row level security;
alter table public.badge_definitions enable row level security;
alter table public.user_badges enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_media enable row level security;
alter table public.community_bookmarks enable row level security;
alter table public.location_consents enable row level security;
alter table public.place_events enable row level security;
alter table public.api_rate_limits enable row level security;

drop policy if exists "Public places are readable" on public.places;
create policy "Public places are readable" on public.places
  for select to anon, authenticated using (true);
drop policy if exists "Public translations are readable" on public.place_translations;
create policy "Public translations are readable" on public.place_translations
  for select to anon, authenticated using (true);
drop policy if exists "Public narrations are readable" on public.ai_narrations;
create policy "Public narrations are readable" on public.ai_narrations
  for select to anon, authenticated using (true);
drop policy if exists "Published shorts are readable" on public.shorts;
create policy "Published shorts are readable" on public.shorts
  for select to anon, authenticated using (is_published);
drop policy if exists "Badge definitions are readable" on public.badge_definitions;
create policy "Badge definitions are readable" on public.badge_definitions
  for select to anon, authenticated using (true);
drop policy if exists "Published community posts are readable" on public.community_posts;
create policy "Published community posts are readable" on public.community_posts
  for select to anon, authenticated using (status = 'published');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('community-staging', 'community-staging', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('community-public', 'community-public', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('narration-audio', 'narration-audio', true, 10485760, array['audio/mpeg'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- >> 20260710000000_backend_auth_stamps.sql
-- ---------------------------------------------------------------
-- JWT/카카오 사용자도 Supabase Auth 사용자와 같은 stamps 테이블을 사용한다.
-- 직접 JWT 사용자는 service-role 서버 클라이언트로만 접근하며 actor_key로 분리한다.

alter table public.stamps
  add column if not exists actor_key text;

update public.stamps
set actor_key = 'supabase:' || user_id::text
where actor_key is null and user_id is not null;

update public.stamps
set actor_key = 'legacy:' || id::text
where actor_key is null;

alter table public.stamps
  alter column user_id drop not null;

alter table public.stamps
  alter column actor_key set not null;

create unique index if not exists stamps_actor_place_unique
  on public.stamps (actor_key, place_id);

create index if not exists stamps_actor_acquired_at_idx
  on public.stamps (actor_key, acquired_at desc);

alter table public.stamps enable row level security;

drop policy if exists "Users can read own stamps" on public.stamps;
create policy "Users can read own stamps"
  on public.stamps for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can create own stamps" on public.stamps;
create policy "Users can create own stamps"
  on public.stamps for insert
  to authenticated
  with check (user_id = auth.uid() and actor_key = 'supabase:' || auth.uid()::text);

-- ---------------------------------------------------------------
-- >> 20260717000000_social_users.sql
-- ---------------------------------------------------------------
-- Social identities are deliberately separate from Supabase Auth password accounts.
-- Equal email addresses never imply account linking.

create table if not exists public.social_users (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_user_id text not null,
  email text null,
  display_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  constraint social_users_provider_user_id_unique unique (provider, provider_user_id),
  constraint social_users_provider_not_blank check (length(btrim(provider)) > 0),
  constraint social_users_provider_user_id_not_blank check (length(btrim(provider_user_id)) > 0)
);

create index if not exists social_users_email_idx
  on public.social_users (email)
  where email is not null;

alter table public.social_users enable row level security;

-- Social identities are accessed only from server code with SUPABASE_SECRET_KEY.
revoke all on table public.social_users from anon, authenticated;

-- ---------------------------------------------------------------
-- >> 20260724000000_sprint2_hardening.sql
-- ---------------------------------------------------------------
-- Sprint 0~2 privacy hardening: retain verification distance/accuracy, not raw GPS history.
alter table public.stamps
  alter column lat drop not null,
  alter column lng drop not null;

update public.stamps
set lat = null, lng = null
where lat is not null or lng is not null;

-- Consume AI/API quotas atomically under concurrent load.
create or replace function public.consume_api_rate_limit(
  p_actor_key text,
  p_scope text,
  p_window_started_at timestamptz,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_actor_key is null or p_scope is null or p_limit < 1 then
    return false;
  end if;

  insert into public.api_rate_limits (
    actor_key,
    scope,
    window_started_at,
    request_count
  ) values (
    p_actor_key,
    p_scope,
    p_window_started_at,
    1
  )
  on conflict (actor_key, scope, window_started_at)
  do update
    set request_count = public.api_rate_limits.request_count + 1
    where public.api_rate_limits.request_count < p_limit
  returning request_count into v_count;

  return v_count is not null and v_count <= p_limit;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, timestamptz, integer)
  from public, anon, authenticated;

grant execute on function public.consume_api_rate_limit(text, text, timestamptz, integer)
  to service_role;

-- Existing schedule replacement is also invoked only by the server-side service client.
grant execute on function public.replace_schedule_places(uuid, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------
-- >> 20260731000000_restore_schema_repair.sql
-- ---------------------------------------------------------------
-- Repairs column drift on tables that predate the 20260709 core schema.
-- The core migration only creates these tables when missing, so installations
-- restored from a pre-migration backup keep the legacy shape. Safe to run
-- repeatedly; every statement no-ops on an up-to-date database.

-- schedule_places: legacy shape was (schedule_id, place_id, visit_date, order_index, memo).
alter table public.schedule_places add column if not exists start_time time;
alter table public.schedule_places add column if not exists stay_minutes integer not null default 60;
alter table public.schedule_places add column if not exists sort_order integer not null default 0;
alter table public.schedule_places add column if not exists note text;
alter table public.schedule_places add column if not exists created_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'schedule_places' and column_name = 'order_index'
  ) then
    update public.schedule_places set sort_order = coalesce(order_index, 0) where sort_order = 0;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'schedule_places' and column_name = 'memo'
  ) then
    update public.schedule_places set note = memo where note is null;
  end if;
end $$;

-- Renumber per day so the uniqueness constraint below can always be created.
with ranked as (
  select id,
    row_number() over (
      partition by schedule_id, visit_date
      order by sort_order, created_at, id
    ) - 1 as rn
  from public.schedule_places
)
update public.schedule_places sp
set sort_order = ranked.rn
from ranked
where sp.id = ranked.id and sp.sort_order <> ranked.rn;

create unique index if not exists schedule_places_schedule_date_order_unique
  on public.schedule_places (schedule_id, visit_date, sort_order);

-- stamps: verification stores accuracy/distance instead of raw GPS history.
alter table public.stamps add column if not exists accuracy_m double precision;
alter table public.stamps add column if not exists distance_m double precision;
