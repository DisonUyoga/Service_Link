-- Forward migration: job OTP, AI match, quote, radius, SMS/expiry/fallback
-- Idempotent: ADD COLUMN IF NOT EXISTS
-- Note: fallback_provider_id is a plain int (no FK), matching Django.

alter table public.job_requests
  add column if not exists provider_access_otp text not null default '',
  add column if not exists provider_access_token text not null default '',
  add column if not exists ai_match_reason text not null default '',
  add column if not exists client_price_preference text not null default '',
  add column if not exists quoted_price int,
  add column if not exists requested_radius_km double precision,
  add column if not exists pending_since timestamptz,
  add column if not exists request_sms_sent_at timestamptz,
  add column if not exists arrival_sms_sent_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists fallback_provider_id bigint;

create index if not exists idx_jobs_access_token
  on public.job_requests(provider_access_token)
  where provider_access_token <> '';

create index if not exists idx_jobs_pending_since
  on public.job_requests(pending_since)
  where status = 'pending_provider';
