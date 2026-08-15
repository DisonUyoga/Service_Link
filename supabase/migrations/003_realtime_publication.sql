-- Enable Supabase Realtime for live admin map updates (idempotent)
do $$
begin
  begin
    alter publication supabase_realtime add table public.service_provider_profiles;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.provider_locations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.job_requests;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.payments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.ad_placements;
  exception when duplicate_object then null;
  end;
end $$;
