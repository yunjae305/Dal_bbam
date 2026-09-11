-- Legacy restored tables kept user_id NOT NULL because CREATE TABLE IF NOT
-- EXISTS does not update existing columns. Verified server sessions also use
-- canonical actor_key identities without a Supabase auth.users UUID.
-- Preserve every row, foreign key, index and RLS policy; only relax nullability.
alter table public.cart_items alter column user_id drop not null;
alter table public.schedules alter column user_id drop not null;
