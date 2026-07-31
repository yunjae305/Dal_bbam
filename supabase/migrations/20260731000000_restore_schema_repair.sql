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
