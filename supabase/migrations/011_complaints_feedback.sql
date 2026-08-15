-- Customer & provider complaints / feedback cases

do $$
begin
  if not exists (select 1 from pg_type where typname = 'complaint_status') then
    create type public.complaint_status as enum (
      'open',
      'in_review',
      'resolved',
      'dismissed'
    );
  end if;
end $$;

create table if not exists public.complaints (
  id bigserial primary key,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reporter_role text not null check (reporter_role in ('customer', 'provider', 'admin')),
  job_id bigint references public.job_requests(id) on delete set null,
  against_user_id uuid references public.profiles(id) on delete set null,
  category text not null default 'general',
  body text not null,
  status public.complaint_status not null default 'open',
  resolution_notes text not null default '',
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_complaints_status
  on public.complaints(status, created_at desc);

create index if not exists idx_complaints_reporter
  on public.complaints(reporter_id, created_at desc);

create index if not exists idx_complaints_job
  on public.complaints(job_id);
