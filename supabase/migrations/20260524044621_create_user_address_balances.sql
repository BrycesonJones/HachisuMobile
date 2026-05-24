create table public.user_address_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null,
  address_id text not null,
  address_balance numeric(36, 18) not null default 0,
  transaction_hash_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, address_id)
);

create index user_address_balances_user_id_idx
  on public.user_address_balances (user_id);

alter table public.user_address_balances enable row level security;

create policy "balances_select_own"
  on public.user_address_balances for select
  using (auth.uid() = user_id);

create policy "balances_insert_own"
  on public.user_address_balances for insert
  with check (auth.uid() = user_id);

create policy "balances_update_own"
  on public.user_address_balances for update
  using (auth.uid() = user_id);

create policy "balances_delete_own"
  on public.user_address_balances for delete
  using (auth.uid() = user_id);

create trigger user_address_balances_updated_at
  before update on public.user_address_balances
  for each row execute function public.set_updated_at();
