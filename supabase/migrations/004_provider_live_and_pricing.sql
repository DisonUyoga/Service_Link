-- Forward migration: live GPS + pricing/availability on provider profiles
-- Idempotent: ADD COLUMN IF NOT EXISTS

alter table public.service_provider_profiles
  add column if not exists current_lat double precision,
  add column if not exists current_lng double precision,
  add column if not exists last_seen_at timestamptz,
  add column if not exists price_min int not null default 500,
  add column if not exists price_max int not null default 2500,
  add column if not exists average_response_minutes int not null default 15,
  add column if not exists next_available_at timestamptz;

create index if not exists idx_providers_last_seen
  on public.service_provider_profiles(last_seen_at desc nulls last);

create index if not exists idx_providers_live_coords
  on public.service_provider_profiles(current_lat, current_lng)
  where current_lat is not null and current_lng is not null;

-- Ensure realtime publication includes provider profiles (live map)
do $$
begin
  begin
    alter publication supabase_realtime add table public.service_provider_profiles;
  exception when duplicate_object then null;
  end;
end $$;
