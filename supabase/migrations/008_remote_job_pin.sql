-- Remote job pin + recipient (WhatsApp-style location for someone else)

alter table public.job_requests
  add column if not exists recipient_name text not null default '',
  add column if not exists recipient_phone text not null default '',
  add column if not exists access_notes text not null default '',
  add column if not exists place_id text not null default '',
  add column if not exists formatted_address text not null default '';

comment on column public.job_requests.recipient_name is 'Person at the job site when booker is remote';
comment on column public.job_requests.recipient_phone is 'Kenya phone for site contact; reveal to provider after accept';
comment on column public.job_requests.access_notes is 'Gate codes, landmark hints, etc.';
comment on column public.job_requests.place_id is 'Google Places place_id for the job pin';
comment on column public.job_requests.formatted_address is 'Human-readable address for the job pin';
