-- Release hardening: revocable social sessions, account lifecycle and community safety.

create table if not exists public.app_sessions (
  id uuid primary key,
  actor_key text not null,
  provider text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint app_sessions_provider_check check (provider in ('kakao'))
);

create index if not exists app_sessions_actor_idx
  on public.app_sessions (actor_key, expires_at desc);
create index if not exists app_sessions_expiry_idx
  on public.app_sessions (expires_at)
  where revoked_at is null;

alter table public.app_sessions enable row level security;
revoke all on table public.app_sessions from anon, authenticated;

create table if not exists public.auth_actor_identities (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  actor_key text not null unique,
  provider text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.auth_actor_identities enable row level security;
revoke all on table public.auth_actor_identities from anon, authenticated;

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  actor_key text not null,
  author_name text not null default '여행자',
  content text not null,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_comments_content_length check (char_length(content) between 1 and 1000),
  constraint community_comments_status_check check (status in ('published', 'hidden', 'deleted'))
);

create index if not exists community_comments_post_idx
  on public.community_comments (post_id, status, created_at);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_actor_key text not null,
  post_id uuid null references public.community_posts(id) on delete cascade,
  comment_id uuid null references public.community_comments(id) on delete cascade,
  reason text not null,
  detail text null,
  status text not null default 'open',
  resolved_by text null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint community_reports_single_target check (
    (post_id is not null and comment_id is null)
    or (post_id is null and comment_id is not null)
  ),
  constraint community_reports_reason_check check (
    reason in ('spam', 'harassment', 'privacy', 'illegal', 'misinformation', 'other')
  ),
  constraint community_reports_status_check check (status in ('open', 'reviewing', 'resolved', 'dismissed'))
);

create unique index if not exists community_reports_post_actor_unique
  on public.community_reports (reporter_actor_key, post_id)
  where post_id is not null and status in ('open', 'reviewing');
create unique index if not exists community_reports_comment_actor_unique
  on public.community_reports (reporter_actor_key, comment_id)
  where comment_id is not null and status in ('open', 'reviewing');
create index if not exists community_reports_queue_idx
  on public.community_reports (status, created_at);

create table if not exists public.user_blocks (
  actor_key text not null,
  blocked_actor_key text not null,
  created_at timestamptz not null default now(),
  primary key (actor_key, blocked_actor_key),
  constraint user_blocks_not_self check (actor_key <> blocked_actor_key)
);

alter table public.community_comments enable row level security;
alter table public.community_reports enable row level security;
alter table public.user_blocks enable row level security;

drop policy if exists "Published comments are readable" on public.community_comments;
drop policy if exists "Published community posts are readable" on public.community_posts;

revoke select on table public.community_posts from anon, authenticated;
revoke all on table public.community_comments from anon, authenticated;
revoke all on table public.community_reports from anon, authenticated;
revoke all on table public.user_blocks from anon, authenticated;

alter table public.community_media
  add column if not exists expires_at timestamptz null,
  add column if not exists public_storage_path text null,
  add column if not exists processed_sha256 text null,
  add column if not exists width integer null,
  add column if not exists height integer null,
  add column if not exists deleted_at timestamptz null;

update public.community_media
set expires_at = created_at + interval '1 hour'
where status = 'staged' and expires_at is null;

-- Preserve a deletable object key for media approved before this migration.
update public.community_media
set public_storage_path = regexp_replace(
  public_path,
  '^.*/storage/v1/object/public/community-public/',
  ''
)
where public_storage_path is null
  and public_path like '%/storage/v1/object/public/community-public/%';

create index if not exists community_media_staged_expiry_idx
  on public.community_media (expires_at)
  where status = 'staged';
create index if not exists community_media_unattached_idx
  on public.community_media (status, created_at)
  where post_id is null;

create or replace function public.create_community_post(
  p_actor_key text,
  p_author_name text,
  p_category text,
  p_place_id uuid,
  p_title text,
  p_content text,
  p_rating smallint,
  p_moderation jsonb,
  p_media_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid;
  v_expected integer := coalesce(cardinality(p_media_ids), 0);
  v_available integer;
  v_attached integer;
begin
  if p_actor_key is null or char_length(p_actor_key) < 3 then
    raise exception 'invalid_actor_key';
  end if;

  if v_expected > 5 then
    raise exception 'too_many_media';
  end if;

  if v_expected > 0 then
    select count(*)::integer into v_available
    from (
      select id
      from public.community_media
      where id = any(p_media_ids)
        and actor_key = p_actor_key
        and status = 'approved'
        and post_id is null
      for update
    ) locked_media;

    if v_available <> v_expected then
      raise exception 'media_not_available';
    end if;
  end if;

  insert into public.community_posts (
    actor_key, author_name, category, place_id, title, content, rating, status, moderation
  ) values (
    p_actor_key, p_author_name, p_category, p_place_id, p_title, p_content,
    p_rating, 'published', coalesce(p_moderation, '{}'::jsonb)
  ) returning id into v_post_id;

  if v_expected > 0 then
    update public.community_media
    set post_id = v_post_id
    where id = any(p_media_ids)
      and actor_key = p_actor_key
      and status = 'approved'
      and post_id is null;
    get diagnostics v_attached = row_count;
    if v_attached <> v_expected then
      raise exception 'media_attach_conflict';
    end if;
  end if;

  return v_post_id;
end;
$$;

revoke all on function public.create_community_post(text, text, text, uuid, text, text, smallint, jsonb, uuid[])
  from public, anon, authenticated;
grant execute on function public.create_community_post(text, text, text, uuid, text, text, smallint, jsonb, uuid[])
  to service_role;

create or replace function public.delete_actor_data(p_actor_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_actor_key is null or char_length(p_actor_key) < 3 then
    raise exception 'invalid_actor_key';
  end if;

  delete from public.community_reports where reporter_actor_key = p_actor_key;
  delete from public.user_blocks where actor_key = p_actor_key or blocked_actor_key = p_actor_key;
  delete from public.community_comments where actor_key = p_actor_key;
  delete from public.community_bookmarks where actor_key = p_actor_key;
  delete from public.community_posts where actor_key = p_actor_key;
  delete from public.community_media where actor_key = p_actor_key;
  delete from public.short_interactions where actor_key = p_actor_key;
  delete from public.user_stamp_rewards where actor_key = p_actor_key;
  delete from public.user_badges where actor_key = p_actor_key;
  delete from public.stamps where actor_key = p_actor_key;
  delete from public.cart_items where actor_key = p_actor_key;
  delete from public.schedules where actor_key = p_actor_key;
  delete from public.courses where actor_key = p_actor_key and coalesce(is_curated, false) = false;
  delete from public.location_consents where actor_key = p_actor_key;
  delete from public.place_events where actor_key = p_actor_key;
  delete from public.api_rate_limits where actor_key = p_actor_key;
  delete from public.app_sessions where actor_key = p_actor_key;
  delete from public.auth_actor_identities where actor_key = p_actor_key;
end;
$$;

revoke all on function public.delete_actor_data(text) from public, anon, authenticated;
grant execute on function public.delete_actor_data(text) to service_role;

create or replace function public.cleanup_expired_runtime_data()
returns table (sessions_deleted bigint, rate_limits_deleted bigint, staged_media_marked bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessions bigint;
  v_limits bigint;
  v_media bigint;
begin
  delete from public.app_sessions
  where expires_at < now() - interval '7 days'
     or revoked_at < now() - interval '7 days';
  get diagnostics v_sessions = row_count;

  delete from public.api_rate_limits
  where window_started_at < now() - interval '2 days';
  get diagnostics v_limits = row_count;

  -- Storage and its database row are cleaned together by the authenticated
  -- cron route. Do not advance rows here or failed object deletion could no
  -- longer be retried.
  v_media := 0;

  return query select v_sessions, v_limits, v_media;
end;
$$;

revoke all on function public.cleanup_expired_runtime_data() from public, anon, authenticated;
grant execute on function public.cleanup_expired_runtime_data() to service_role;
