-- Operations staff role + role-aware portal allowlist

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'operations'
  ) then
    alter type public.user_role add value 'operations';
  end if;
end $$;

alter table public.admin_allowlist
  add column if not exists role text not null default 'admin';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_allowlist_role_check'
  ) then
    alter table public.admin_allowlist
      add constraint admin_allowlist_role_check
      check (role in ('admin', 'operations'));
  end if;
end $$;

update public.admin_allowlist
set role = 'admin'
where role is null or role = '';
