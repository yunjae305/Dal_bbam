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
