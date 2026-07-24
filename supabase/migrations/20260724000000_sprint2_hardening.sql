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
