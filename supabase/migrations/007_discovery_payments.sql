-- Forward migration: discovery (connection fee) payments
-- Idempotent: CREATE TYPE / TABLE IF NOT EXISTS

do $$
begin
  if not exists (select 1 from pg_type where typname = 'discovery_payment_status') then
    create type public.discovery_payment_status as enum (
      'pending', 'success', 'failed', 'expired'
    );
  end if;
end $$;

create table if not exists public.discovery_payments (
  id bigserial primary key,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null default 50,
  currency text not null default 'KES',
  phone_number text not null,
  category_id bigint,
  lat double precision,
  lng double precision,
  query text not null default '',
  provider_count int not null default 0,
  checkout_request_id text not null default '',
  merchant_request_id text not null default '',
  mpesa_reference text not null default '',
  result_code text not null default '',
  result_desc text not null default '',
  status public.discovery_payment_status not null default 'pending',
  consumed_at timestamptz,
  consumed_job_id bigint references public.job_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_discovery_customer
  on public.discovery_payments(customer_id, created_at desc);

create index if not exists idx_discovery_checkout
  on public.discovery_payments(checkout_request_id)
  where checkout_request_id <> '';

drop trigger if exists trg_discovery_updated on public.discovery_payments;
create trigger trg_discovery_updated before update on public.discovery_payments
for each row execute function public.set_updated_at();

alter table public.discovery_payments enable row level security;

drop policy if exists "service role full discovery_payments" on public.discovery_payments;
create policy "service role full discovery_payments"
  on public.discovery_payments for all
  using (true) with check (true);

grant select, insert, update, delete on public.discovery_payments to anon, authenticated, service_role;
grant usage, select on sequence public.discovery_payments_id_seq to anon, authenticated, service_role;

do $$
begin
  begin
    alter publication supabase_realtime add table public.discovery_payments;
  exception when duplicate_object then null;
  end;
end $$;
