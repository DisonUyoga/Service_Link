-- Grants for terms + complaints (008-011 follow-up)

grant select on public.terms_versions to anon, authenticated, service_role;
grant select, insert on public.user_terms_acceptances to authenticated, service_role;
grant select, insert, update on public.complaints to authenticated, service_role;
grant all on table public.terms_versions to service_role;
grant all on table public.user_terms_acceptances to service_role;
grant all on table public.complaints to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
