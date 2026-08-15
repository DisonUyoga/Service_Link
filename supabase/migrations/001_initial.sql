-- S-Link Supabase schema (mirrors Django, production-hardened)
-- Apply in Supabase SQL editor or via `supabase db push`

create extension if not exists "pgcrypto";

create type public.user_role as enum ('customer', 'provider', 'admin');
create type public.provider_tier as enum ('bronze', 'silver', 'gold', 'platinum');
create type public.provider_status as enum ('available', 'busy', 'offline');
create type public.job_status as enum (
  'pending_provider', 'accepted', 'in_progress', 'completed', 'cancelled'
);
create type public.payment_status as enum ('initiated', 'pending', 'success', 'failed');
create type public.ad_status as enum ('pending_review', 'active', 'paused');

-- App auth is JWT + Firebase (Next.js). Profile ids are UUIDs that may
-- match auth.users when someone also signs up via Supabase Auth, but we
-- do not require the FK so service-role API inserts work cleanly.
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text not null unique,
  role public.user_role not null default 'customer',
  full_name text not null default '',
  phone text not null default '',
  password_hash text,
  firebase_uid text unique,
  created_at timestamptz not null default now()
);

create table public.service_categories (
  id bigserial primary key,
  name text not null unique,
  icon text not null default ''
);

create table public.service_provider_profiles (
  id bigserial primary key,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  category_id bigint references public.service_categories(id) on delete restrict,
  bio text not null default '',
  base_lat double precision,
  base_lng double precision,
  service_radius_km int not null default 10 check (service_radius_km > 0),
  tier public.provider_tier not null default 'bronze',
  rating_avg double precision not null default 0,
  rating_count int not null default 0,
  total_jobs_completed int not null default 0,
  verified boolean not null default false,
  is_suspended boolean not null default false,
  suspended_reason text not null default '',
  current_status public.provider_status not null default 'offline',
  mpesa_till_or_paybill text not null default ''
);

create table public.provider_legal_documents (
  id bigserial primary key,
  profile_id bigint not null references public.service_provider_profiles(id) on delete cascade,
  title text not null,
  file_path text not null,
  uploaded_at timestamptz not null default now()
);

create table public.job_requests (
  id bigserial primary key,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid references public.profiles(id) on delete set null,
  category_id bigint not null references public.service_categories(id) on delete restrict,
  description text not null,
  location_lat double precision not null,
  location_lng double precision not null,
  address_text text not null default '',
  status public.job_status not null default 'pending_provider',
  is_paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_locations (
  id bigserial primary key,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  job_id bigint not null references public.job_requests(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);

create table public.ratings (
  id bigserial primary key,
  job_id bigint not null unique references public.job_requests(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now()
);

create table public.payments (
  id bigserial primary key,
  job_id bigint not null unique references public.job_requests(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null default 50,
  currency text not null default 'KES',
  mpesa_reference text not null default '',
  status public.payment_status not null default 'initiated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ad_placements (
  id bigserial primary key,
  sponsor_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null default '',
  target_country text not null default '',
  target_city text not null default '',
  store_lat double precision,
  store_lng double precision,
  status public.ad_status not null default 'pending_review',
  amount_paid numeric(10,2) not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_jobs_customer on public.job_requests(customer_id);
create index idx_jobs_provider on public.job_requests(provider_id);
create index idx_jobs_status on public.job_requests(status);
create index idx_providers_status on public.service_provider_profiles(verified, current_status);
create index idx_provider_locations_job on public.provider_locations(job_id, recorded_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_jobs_updated before update on public.job_requests
for each row execute function public.set_updated_at();

create trigger trg_payments_updated before update on public.payments
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, email, role, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'customer'),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  if coalesce(new.raw_user_meta_data->>'role', 'customer') = 'provider' then
    insert into public.service_provider_profiles (user_id)
    values (new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.recompute_provider_tier(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  new_tier public.provider_tier;
begin
  select * into r from public.service_provider_profiles where user_id = p_user_id;
  if not found then return; end if;
  if r.total_jobs_completed >= 150 and r.rating_avg >= 4.8 then
    new_tier := 'platinum';
  elsif r.total_jobs_completed >= 60 and r.rating_avg >= 4.5 then
    new_tier := 'gold';
  elsif r.total_jobs_completed >= 20 and r.rating_avg >= 4.2 then
    new_tier := 'silver';
  else
    new_tier := 'bronze';
  end if;
  update public.service_provider_profiles set tier = new_tier where user_id = p_user_id;
end;
$$;

create or replace function public.nearby_providers(
  p_lat double precision,
  p_lng double precision,
  p_category text default null
)
returns table (
  id bigint,
  user_id uuid,
  user_name text,
  category text,
  bio text,
  base_lat double precision,
  base_lng double precision,
  tier public.provider_tier,
  rating_avg double precision,
  rating_count int,
  total_jobs_completed int,
  distance_km double precision
) language sql stable as $$
  select
    spp.id,
    spp.user_id,
    coalesce(nullif(p.full_name, ''), p.username) as user_name,
    coalesce(sc.name, '') as category,
    spp.bio,
    spp.base_lat,
    spp.base_lng,
    spp.tier,
    spp.rating_avg,
    spp.rating_count,
    spp.total_jobs_completed,
    round(
      (
        6371 * acos(
          least(1.0, greatest(-1.0,
            cos(radians(p_lat)) * cos(radians(spp.base_lat)) *
            cos(radians(spp.base_lng) - radians(p_lng)) +
            sin(radians(p_lat)) * sin(radians(spp.base_lat))
          ))
        )
      )::numeric,
      2
    )::double precision as distance_km
  from public.service_provider_profiles spp
  join public.profiles p on p.id = spp.user_id
  left join public.service_categories sc on sc.id = spp.category_id
  where spp.verified = true
    and spp.is_suspended = false
    and spp.current_status = 'available'
    and spp.base_lat is not null
    and spp.base_lng is not null
    and (
      p_category is null
      or sc.name ilike p_category
      or sc.id::text = p_category
    )
  order by distance_km asc;
$$;

create or replace function public.accept_job(p_job_id bigint, p_provider_id uuid)
returns public.job_requests
language plpgsql security definer set search_path = public as $$
declare
  j public.job_requests;
  open_count int;
  suspended boolean;
begin
  select is_suspended into suspended from public.service_provider_profiles where user_id = p_provider_id;
  if suspended then raise exception 'Account suspended'; end if;

  select count(*) into open_count from public.job_requests
  where provider_id = p_provider_id and status in ('accepted', 'in_progress');
  if open_count > 0 then raise exception 'You already have an open job'; end if;

  select * into j from public.job_requests where id = p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  if j.status <> 'pending_provider' then raise exception 'Job cannot be accepted'; end if;
  if j.provider_id is not null and j.provider_id <> p_provider_id then
    raise exception 'Job assigned to another provider';
  end if;

  update public.job_requests
  set provider_id = p_provider_id,
      status = case when is_paid then 'in_progress'::public.job_status else 'accepted'::public.job_status end
  where id = p_job_id
  returning * into j;

  if j.is_paid then
    update public.service_provider_profiles set current_status = 'busy' where user_id = p_provider_id;
  end if;
  return j;
end;
$$;

create or replace function public.complete_job(p_job_id bigint, p_provider_id uuid)
returns public.job_requests
language plpgsql security definer set search_path = public as $$
declare
  j public.job_requests;
begin
  select * into j from public.job_requests where id = p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  if j.provider_id <> p_provider_id then raise exception 'Not your job'; end if;
  if j.status <> 'in_progress' then raise exception 'Job must be in progress'; end if;

  update public.job_requests set status = 'completed' where id = p_job_id returning * into j;
  update public.service_provider_profiles
  set total_jobs_completed = total_jobs_completed + 1,
      current_status = 'available'
  where user_id = p_provider_id;
  perform public.recompute_provider_tier(p_provider_id);
  return j;
end;
$$;

alter table public.profiles enable row level security;
alter table public.service_categories enable row level security;
alter table public.service_provider_profiles enable row level security;
alter table public.provider_legal_documents enable row level security;
alter table public.job_requests enable row level security;
alter table public.provider_locations enable row level security;
alter table public.ratings enable row level security;
alter table public.payments enable row level security;
alter table public.ad_placements enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select exists(
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create policy profiles_select on public.profiles for select using (true);
create policy profiles_update_own on public.profiles for update using (auth.uid() = id or public.is_admin());

create policy categories_read on public.service_categories for select using (true);
create policy categories_admin on public.service_categories for all using (public.is_admin());

create policy providers_read on public.service_provider_profiles for select using (true);
create policy providers_update_own on public.service_provider_profiles
  for update using (auth.uid() = user_id or public.is_admin());
create policy providers_insert_own on public.service_provider_profiles
  for insert with check (auth.uid() = user_id or public.is_admin());

create policy jobs_select on public.job_requests for select using (
  public.is_admin() or customer_id = auth.uid() or provider_id = auth.uid()
);
create policy jobs_insert on public.job_requests for insert with check (customer_id = auth.uid());
create policy jobs_update on public.job_requests for update using (
  public.is_admin() or customer_id = auth.uid() or provider_id = auth.uid()
);

create policy locations_select on public.provider_locations for select using (true);
create policy locations_insert on public.provider_locations for insert with check (provider_id = auth.uid());

create policy ratings_select on public.ratings for select using (true);
create policy ratings_insert on public.ratings for insert with check (customer_id = auth.uid());

create policy payments_select on public.payments for select using (
  public.is_admin()
  or provider_id = auth.uid()
  or exists (select 1 from public.job_requests j where j.id = job_id and j.customer_id = auth.uid())
);

create policy ads_public on public.ad_placements for select using (
  status = 'active' or sponsor_id = auth.uid() or public.is_admin()
);
create policy ads_insert on public.ad_placements for insert with check (sponsor_id = auth.uid());
create policy ads_update on public.ad_placements for update using (
  sponsor_id = auth.uid() or public.is_admin()
);
