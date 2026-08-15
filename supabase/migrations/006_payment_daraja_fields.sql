-- Forward migration: Daraja STK fields on payments
-- Idempotent: ADD COLUMN IF NOT EXISTS

alter table public.payments
  add column if not exists checkout_request_id text not null default '',
  add column if not exists merchant_request_id text not null default '',
  add column if not exists phone_number text not null default '',
  add column if not exists result_code text not null default '',
  add column if not exists result_desc text not null default '';

create index if not exists idx_payments_checkout
  on public.payments(checkout_request_id)
  where checkout_request_id <> '';
