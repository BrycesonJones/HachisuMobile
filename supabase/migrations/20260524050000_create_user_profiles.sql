create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  username text unique,
  account_type text not null check (account_type in ('personal', 'business')),
  onboarding_status text not null default 'started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "profiles_select_own"
  on public.user_profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.user_profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.user_profiles for update
  using (auth.uid() = id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();
