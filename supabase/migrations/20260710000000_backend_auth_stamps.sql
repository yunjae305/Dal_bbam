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
