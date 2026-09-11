-- Schedule metadata and visits must commit together, including AI-created drafts.
create or replace function public.update_schedule_with_places(
  p_schedule_id uuid, p_actor_key text, p_patch jsonb, p_items jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_schedule public.schedules;
begin
  select * into v_schedule from public.schedules
  where id = p_schedule_id and actor_key = p_actor_key for update;
  if not found then raise exception 'schedule_not_found'; end if;
  update public.schedules set
    title = coalesce(p_patch->>'title', title),
    start_date = coalesce((p_patch->>'start_date')::date, start_date),
    end_date = coalesce((p_patch->>'end_date')::date, end_date), updated_at = now()
  where id = p_schedule_id returning * into v_schedule;
  if v_schedule.end_date < v_schedule.start_date then raise exception 'invalid_date_range'; end if;
  if p_items is not null then
    if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100 then raise exception 'invalid_items'; end if;
    perform public.replace_schedule_places(p_schedule_id, p_actor_key, p_items);
  end if;
  if exists (select 1 from public.schedule_places where schedule_id = p_schedule_id and
    (visit_date < v_schedule.start_date or visit_date > v_schedule.end_date or stay_minutes < 15 or stay_minutes > 240)) then
    raise exception 'invalid_schedule_item';
  end if;
end;
$$;

create or replace function public.create_schedule_with_places(
  p_actor_key text, p_user_id uuid, p_title text, p_start_date date, p_end_date date,
  p_share_token text, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_schedule public.schedules;
begin
  if length(trim(p_title)) < 1 or length(p_title) > 80 then raise exception 'invalid_title'; end if;
  insert into public.schedules (actor_key, user_id, title, start_date, end_date, share_token)
  values (p_actor_key, p_user_id, p_title, p_start_date, p_end_date, p_share_token) returning * into v_schedule;
  perform public.update_schedule_with_places(v_schedule.id, p_actor_key, '{}'::jsonb, p_items);
  return to_jsonb(v_schedule);
end;
$$;

-- Admin course writes replace the header and ordered visits in one transaction.
create or replace function public.save_curated_course(
  p_id uuid, p_title text, p_description text, p_transport text,
  p_theme text, p_share_token text, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_course public.courses;
begin
  if length(trim(p_title)) < 1 or length(p_title) > 80 or p_transport not in ('walking', 'car', 'public') then
    raise exception 'invalid_course';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'invalid_course_items';
  end if;
  if p_id is null then
    insert into public.courses(title, description, transport, is_curated, share_token, metadata)
    values(p_title, p_description, p_transport, true, p_share_token, jsonb_build_object('theme', p_theme)) returning * into v_course;
  else
    select * into v_course from public.courses where id = p_id and is_curated = true for update;
    if not found then raise exception 'course_not_found'; end if;
    update public.courses set title = p_title, description = p_description, transport = p_transport,
      metadata = metadata || jsonb_build_object('theme', p_theme), updated_at = now()
      where id = p_id returning * into v_course;
    delete from public.course_places where course_id = p_id;
  end if;
  insert into public.course_places(course_id, place_id, order_no, order_index, reason, stay_minutes)
  select v_course.id, item.place_id, item.order_index, item.order_index, item.reason, item.stay_minutes
  from jsonb_to_recordset(p_items) as item(place_id uuid, order_index integer, reason text, stay_minutes integer);
  return to_jsonb(v_course);
end;
$$;

revoke all on function public.update_schedule_with_places(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.create_schedule_with_places(text, uuid, text, date, date, text, jsonb) from public, anon, authenticated;
revoke all on function public.save_curated_course(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.update_schedule_with_places(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.create_schedule_with_places(text, uuid, text, date, date, text, jsonb) to service_role;
grant execute on function public.save_curated_course(uuid, text, text, text, text, text, jsonb) to service_role;
