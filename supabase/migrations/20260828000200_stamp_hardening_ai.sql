-- Production stamp catalogue, AI artwork provenance, on-site proof and rewards.
-- Existing place/stamp rows remain valid; current coordinate-bearing places are
-- explicitly backfilled as active stamp targets.

begin;

create table if not exists public.stamp_targets (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null unique references public.places(id) on delete cascade,
  is_active boolean not null default false,
  checkpoint_required boolean not null default false,
  radius_m integer null check (radius_m is null or radius_m between 25 and 1000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Existing rows are registered as inactive candidates. The sync script then
-- activates only the configured/curated launch catalogue.
insert into public.stamp_targets (place_id, is_active, sort_order)
select id, false, row_number() over (order by created_at, id)::integer - 1
from public.places
where lat between 35.65 and 36.12
  and lng between 128.95 and 129.58
on conflict (place_id) do nothing;

create index if not exists stamp_targets_active_order_idx
  on public.stamp_targets (is_active, sort_order, created_at);

create table if not exists public.stamp_artworks (
  id uuid primary key default gen_random_uuid(),
  stamp_target_id uuid not null references public.stamp_targets(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'generating'
    check (status in ('generating', 'pending_review', 'approved', 'rejected', 'archived', 'failed')),
  prompt text not null,
  prompt_hash text not null,
  model text not null,
  storage_path text null,
  public_url text null,
  mime_type text null,
  failure_reason text null,
  requested_by text not null default 'admin-api',
  reviewed_by text null,
  review_note text null,
  generated_at timestamptz null,
  approved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stamp_artworks_ready_payload_check check (
    (status <> 'pending_review'
      or (storage_path is not null and mime_type is not null and generated_at is not null))
    and (status <> 'approved'
      or (storage_path is not null and public_url is not null and mime_type is not null and generated_at is not null))
  ),
  unique (stamp_target_id, version)
);

create unique index if not exists stamp_artworks_one_generating_idx
  on public.stamp_artworks (stamp_target_id)
  where status = 'generating';
create unique index if not exists stamp_artworks_one_approved_idx
  on public.stamp_artworks (stamp_target_id)
  where status = 'approved';
create index if not exists stamp_artworks_target_created_idx
  on public.stamp_artworks (stamp_target_id, created_at desc);

create table if not exists public.stamp_checkpoint_tokens (
  id uuid primary key default gen_random_uuid(),
  stamp_target_id uuid not null references public.stamp_targets(id) on delete cascade,
  token_hash text not null unique,
  token_hint text not null,
  label text null,
  is_active boolean not null default true,
  expires_at timestamptz not null,
  max_uses integer not null default 5000 check (max_uses between 1 and 100000),
  uses_count integer not null default 0 check (uses_count >= 0),
  last_used_at timestamptz null,
  issued_by text not null default 'admin-api',
  created_at timestamptz not null default now()
);

create index if not exists stamp_checkpoint_tokens_target_active_idx
  on public.stamp_checkpoint_tokens (stamp_target_id, is_active, expires_at);

create table if not exists public.stamp_reward_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text not null,
  stamp_threshold integer not null check (stamp_threshold > 0),
  reward_type text not null default 'digital_title'
    check (reward_type = 'digital_title'),
  reward_value text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_stamp_rewards (
  id uuid primary key default gen_random_uuid(),
  actor_key text not null,
  reward_id uuid not null references public.stamp_reward_definitions(id) on delete cascade,
  earned_at timestamptz not null default now(),
  redeemed_at timestamptz null,
  unique (actor_key, reward_id)
);

create index if not exists user_stamp_rewards_actor_idx
  on public.user_stamp_rewards (actor_key, earned_at desc);

insert into public.stamp_reward_definitions
  (code, title, description, stamp_threshold, reward_type, reward_value)
values
  ('stamp-first-visit', '첫 달밤 여행자', '첫 현장 스탬프를 획득한 여행자 칭호', 1, 'digital_title', '첫 달밤 여행자'),
  ('stamp-three-places', '신라길 탐험가', '서로 다른 관광지 세 곳을 방문한 여행자 칭호', 3, 'digital_title', '신라길 탐험가'),
  ('stamp-seven-places', '경주 달밤 마스터', '경주 스탬프 일곱 개를 완성한 여행자 칭호', 7, 'digital_title', '경주 달밤 마스터')
on conflict (code) do nothing;

alter table public.stamps add column if not exists stamp_target_id uuid null
  references public.stamp_targets(id) on delete set null;
alter table public.stamps add column if not exists checkpoint_id uuid null
  references public.stamp_checkpoint_tokens(id) on delete set null;
alter table public.stamps add column if not exists checkpoint_verified_at timestamptz null;

update public.stamps s
set stamp_target_id = t.id
from public.stamp_targets t
where s.stamp_target_id is null and t.place_id = s.place_id;

create index if not exists stamps_target_idx on public.stamps (stamp_target_id);

alter table public.stamp_targets enable row level security;
alter table public.stamp_artworks enable row level security;
alter table public.stamp_checkpoint_tokens enable row level security;
alter table public.stamp_reward_definitions enable row level security;
alter table public.user_stamp_rewards enable row level security;

revoke all on table public.stamp_artworks from anon, authenticated;
revoke all on table public.stamp_checkpoint_tokens from anon, authenticated;
revoke all on table public.user_stamp_rewards from anon, authenticated;

drop policy if exists "Active stamp targets are readable" on public.stamp_targets;
create policy "Active stamp targets are readable" on public.stamp_targets
  for select to anon, authenticated using (is_active);

drop policy if exists "Approved stamp artworks are readable" on public.stamp_artworks;
-- Artwork audit rows include prompts and operator metadata. They are read only
-- by the service-role-backed API; the approved binary remains public in Storage.

drop policy if exists "Active stamp rewards are readable" on public.stamp_reward_definitions;
revoke all on table public.stamp_reward_definitions from anon, authenticated;

drop policy if exists "Users can read own stamp rewards" on public.user_stamp_rewards;
-- Canonical actor keys can span password, Kakao and Supabase identities. Reward
-- ownership is therefore resolved only by the authenticated server API.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
(
  'stamp-artworks-staging',
  'stamp-artworks-staging',
  false,
  10485760,
  array['image/png', 'image/webp', 'image/jpeg']
),
(
  'stamp-artworks',
  'stamp-artworks',
  true,
  10485760,
  array['image/png', 'image/webp', 'image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Stamp artworks are publicly readable" on storage.objects;
create policy "Stamp artworks are publicly readable" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'stamp-artworks');

create or replace function public.consume_stamp_checkpoint(
  p_token_hash text,
  p_stamp_target_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checkpoint_id uuid;
begin
  update public.stamp_checkpoint_tokens
  set
    uses_count = uses_count + 1,
    last_used_at = now()
  where token_hash = p_token_hash
    and stamp_target_id = p_stamp_target_id
    and is_active
    and expires_at > now()
    and uses_count < max_uses
  returning id into v_checkpoint_id;

  return v_checkpoint_id;
end;
$$;

revoke all on function public.consume_stamp_checkpoint(text, uuid)
  from public, anon, authenticated;
grant execute on function public.consume_stamp_checkpoint(text, uuid)
  to service_role;

-- Validate/consume the optional checkpoint and insert the stamp in one
-- transaction. The advisory lock prevents a duplicate concurrent claim from
-- consuming a token use before the unique stamp row is observed.
create or replace function public.claim_stamp(
  p_actor_key text,
  p_user_id uuid,
  p_place_id uuid,
  p_stamp_target_id uuid,
  p_checkpoint_required boolean,
  p_token_hash text,
  p_accuracy_m double precision,
  p_distance_m double precision
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.stamps%rowtype;
  v_checkpoint_id uuid;
  v_stamp_id uuid;
  v_target_requires_checkpoint boolean;
begin
  if p_actor_key is null or char_length(p_actor_key) < 3 then
    raise exception 'invalid_actor_key';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_actor_key || ':' || p_place_id::text, 0));

  select s.* into v_existing
  from public.stamps s
  where s.actor_key = p_actor_key and s.place_id = p_place_id;

  if found then
    return jsonb_build_object(
      'status', 'already_acquired',
      'stamp_id', v_existing.id,
      'checkpoint_id', v_existing.checkpoint_id
    );
  end if;

  select (t.checkpoint_required or p_checkpoint_required) into v_target_requires_checkpoint
  from public.stamp_targets t
  where t.id = p_stamp_target_id
    and t.place_id = p_place_id
    and t.is_active
  for update;

  if not found then
    return jsonb_build_object('status', 'target_invalid');
  end if;

  if v_target_requires_checkpoint then
    if p_token_hash is null or char_length(p_token_hash) < 32 then
      return jsonb_build_object('status', 'checkpoint_invalid');
    end if;

    update public.stamp_checkpoint_tokens
    set uses_count = uses_count + 1, last_used_at = now()
    where token_hash = p_token_hash
      and stamp_target_id = p_stamp_target_id
      and is_active
      and expires_at > now()
      and uses_count < max_uses
    returning id into v_checkpoint_id;

    if v_checkpoint_id is null then
      return jsonb_build_object('status', 'checkpoint_invalid');
    end if;
  end if;

  insert into public.stamps (
    actor_key,
    user_id,
    place_id,
    stamp_target_id,
    checkpoint_id,
    checkpoint_verified_at,
    lat,
    lng,
    accuracy_m,
    distance_m
  ) values (
    p_actor_key,
    p_user_id,
    p_place_id,
    p_stamp_target_id,
    v_checkpoint_id,
    case when v_checkpoint_id is null then null else now() end,
    null,
    null,
    p_accuracy_m,
    p_distance_m
  ) returning id into v_stamp_id;

  return jsonb_build_object(
    'status', 'acquired',
    'stamp_id', v_stamp_id,
    'checkpoint_id', v_checkpoint_id
  );
end;
$$;

revoke all on function public.claim_stamp(text, uuid, uuid, uuid, boolean, text, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.claim_stamp(text, uuid, uuid, uuid, boolean, text, double precision, double precision)
  to service_role;

create or replace function public.approve_stamp_artwork(
  p_artwork_id uuid,
  p_reviewed_by text default null,
  p_review_note text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_id uuid;
begin
  select stamp_target_id into v_target_id
  from public.stamp_artworks
  where id = p_artwork_id
    and status = 'pending_review'
    and storage_path is not null
    and public_url is not null
  for update;

  if v_target_id is null then
    return false;
  end if;

  -- Serialize approvals for different pending versions of the same target.
  perform 1 from public.stamp_targets where id = v_target_id for update;

  update public.stamp_artworks
  set status = 'archived', updated_at = now()
  where stamp_target_id = v_target_id
    and status = 'approved'
    and id <> p_artwork_id;

  update public.stamp_artworks
  set
    status = 'approved',
    approved_at = now(),
    reviewed_by = nullif(left(p_reviewed_by, 160), ''),
    review_note = nullif(left(p_review_note, 500), ''),
    updated_at = now()
  where id = p_artwork_id;

  return found;
end;
$$;

revoke all on function public.approve_stamp_artwork(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.approve_stamp_artwork(uuid, text, text)
  to service_role;

commit;
