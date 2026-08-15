-- AI dispatch and Firebase Cloud Messaging device registrations

do $$
begin
  if not exists (select 1 from pg_type where typname = 'job_dispatch_status') then
    create type public.job_dispatch_status as enum ('queued', 'notified', 'broadcast', 'accepted', 'declined', 'timed_out', 'closed');
  end if;
end $$;

create table if not exists public.provider_device_tokens (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.job_dispatches (
  id bigserial primary key,
  job_id bigint not null references public.job_requests(id) on delete cascade,
  provider_user_id uuid not null references public.profiles(id) on delete cascade,
  rank integer not null,
  status public.job_dispatch_status not null default 'queued',
  wave integer not null default 1,
  notified_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique(job_id, provider_user_id)
);

alter table public.job_requests
  add column if not exists dispatch_started_at timestamptz,
  add column if not exists dispatch_broadcast_at timestamptz,
  add column if not exists ai_dispatch_reason text not null default '';

create index if not exists idx_device_tokens_user on public.provider_device_tokens(user_id, last_seen_at desc);
create index if not exists idx_dispatch_job_status on public.job_dispatches(job_id, status);
create index if not exists idx_dispatch_provider_status on public.job_dispatches(provider_user_id, status);

grant select, insert, update, delete on public.provider_device_tokens to authenticated, service_role;
grant select, insert, update, delete on public.job_dispatches to authenticated, service_role;
grant all on public.provider_device_tokens, public.job_dispatches to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;