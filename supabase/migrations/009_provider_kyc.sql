-- Typed KYC documents + area-of-operation place fields (no fingerprint)

do $$
begin
  if not exists (select 1 from pg_type where typname = 'provider_document_type') then
    create type public.provider_document_type as enum (
      'national_id_or_passport',
      'good_conduct',
      'other'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'provider_document_review_status') then
    create type public.provider_document_review_status as enum (
      'pending',
      'approved',
      'rejected'
    );
  end if;
end $$;

alter table public.provider_legal_documents
  add column if not exists document_type public.provider_document_type not null default 'other',
  add column if not exists review_status public.provider_document_review_status not null default 'pending',
  add column if not exists review_notes text not null default '',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.service_provider_profiles
  add column if not exists id_document_number text not null default '',
  add column if not exists id_document_kind text not null default '',
  add column if not exists area_place_id text not null default '',
  add column if not exists area_formatted_address text not null default '',
  add column if not exists profile_complete boolean not null default false,
  add column if not exists terms_accepted_at timestamptz;

create index if not exists idx_provider_docs_profile_type
  on public.provider_legal_documents(profile_id, document_type);
