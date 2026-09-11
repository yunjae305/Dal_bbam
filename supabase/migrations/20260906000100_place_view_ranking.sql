-- Aggregate before limiting so busy weeks cannot silently truncate rankings.
create or replace function public.get_place_view_ranking(since_date date)
returns table(content_id text, view_count bigint)
language sql stable security invoker
set search_path = ''
as $$
  select p.content_id, count(*) as view_count
  from public.place_events e
  join public.places p on p.id = e.place_id
  where e.event_type = 'view' and e.event_date >= since_date
    and p.content_id is not null
  group by p.content_id
  order by view_count desc, p.content_id
$$;

revoke all on function public.get_place_view_ranking(date) from public, anon, authenticated;
grant execute on function public.get_place_view_ranking(date) to service_role;
