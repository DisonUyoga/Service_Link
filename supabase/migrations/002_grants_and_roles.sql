-- Privileges for Supabase roles (anon / authenticated / service_role)
-- service_role is used by the Next.js API; authenticated by direct clients; anon for public reads.

grant usage on schema public to anon, authenticated, service_role;

grant select on public.service_categories to anon, authenticated, service_role;
grant select on public.service_provider_profiles to anon, authenticated, service_role;
grant select on public.profiles to anon, authenticated, service_role;
grant select on public.provider_locations to anon, authenticated, service_role;
grant select on public.ratings to anon, authenticated, service_role;
grant select on public.ad_placements to anon, authenticated, service_role;

grant select, insert, update, delete on public.profiles to authenticated, service_role;
grant select, insert, update, delete on public.service_provider_profiles to authenticated, service_role;
grant select, insert, update, delete on public.provider_legal_documents to authenticated, service_role;
grant select, insert, update, delete on public.job_requests to authenticated, service_role;
grant select, insert, update, delete on public.provider_locations to authenticated, service_role;
grant select, insert, update, delete on public.ratings to authenticated, service_role;
grant select, insert, update, delete on public.payments to authenticated, service_role;
grant select, insert, update, delete on public.ad_placements to authenticated, service_role;
grant select, insert, update, delete on public.service_categories to service_role;
grant insert, update, delete on public.service_categories to authenticated;

-- Full access for the Next.js service-role key (bypasses RLS via PostgREST)
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;

grant execute on function public.nearby_providers(double precision, double precision, text) to anon, authenticated, service_role;
grant execute on function public.accept_job(bigint, uuid) to authenticated, service_role;
grant execute on function public.complete_job(bigint, uuid) to authenticated, service_role;
grant execute on function public.recompute_provider_tier(uuid) to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;

alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on routines to authenticated, service_role;

-- Storage: provider document uploads
insert into storage.buckets (id, name, public)
values ('provider_docs', 'provider_docs', false)
on conflict (id) do nothing;

drop policy if exists provider_docs_select on storage.objects;
drop policy if exists provider_docs_insert on storage.objects;
drop policy if exists provider_docs_service on storage.objects;

create policy provider_docs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'provider_docs' and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin()));

create policy provider_docs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'provider_docs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy provider_docs_service on storage.objects
  for all to service_role
  using (bucket_id = 'provider_docs')
  with check (bucket_id = 'provider_docs');
