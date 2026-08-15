-- Admin portal access is managed in the database, not source code.
create table if not exists public.admin_allowlist (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now(),
  added_by uuid references public.profiles(id) on delete set null
);

create index if not exists admin_allowlist_added_at_idx
  on public.admin_allowlist (added_at desc);

grant select, insert, delete on public.admin_allowlist to service_role;
