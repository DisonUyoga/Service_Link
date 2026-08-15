-- Versioned terms & conditions acceptance

create table if not exists public.terms_versions (
  id bigserial primary key,
  version text not null unique,
  title text not null,
  body text not null,
  audience text not null default 'all' check (audience in ('all', 'customer', 'provider')),
  published_at timestamptz not null default now(),
  is_current boolean not null default false
);

create table if not exists public.user_terms_acceptances (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  terms_version_id bigint not null references public.terms_versions(id) on delete restrict,
  role text not null,
  accepted_at timestamptz not null default now(),
  client_meta jsonb not null default '{}'::jsonb,
  unique (user_id, terms_version_id)
);

create index if not exists idx_terms_acceptances_user
  on public.user_terms_acceptances(user_id, accepted_at desc);

insert into public.terms_versions (version, title, body, audience, is_current)
select
  '2026-08-v1',
  'S-Link Terms of Service',
  $terms$
S-Link Terms of Service (v2026-08-v1)

1. Platform role. S-Link connects customers with independent service providers. We are not the employer of providers and do not perform the booked work.

2. Remote bookings. Customers may book a job for a site they are not physically at. The job location pin, recipient details, and access notes must be accurate. Misleading location information may result in account suspension.

3. Payments. Connection / discovery fees (when enabled) are charged only after the customer has described the problem. Job payments are handled via the configured M-Pesa flows. Refunds follow platform policy and payment-provider rules.

4. Providers. Providers must submit a valid national ID or passport photo and may optionally submit a certificate of good conduct. Operating without verification where required is prohibited. Providers must navigate to the customer-provided job pin.

5. Conduct. Harassment, fraud, unsafe work, and misuse of contact details obtained via the platform are grounds for suspension.

6. Complaints. Customers and providers may file complaints through the in-app feedback channel. We may review associated job and payment records to resolve disputes.

7. Privacy. Location pins, documents, and contact details are processed to fulfil bookings and safety. We do not collect or store fingerprint biometric templates.

8. Changes. Continued use after a new terms version is published and accepted constitutes agreement to that version.
$terms$,
  'all',
  true
where not exists (
  select 1 from public.terms_versions where version = '2026-08-v1'
);

-- Ensure only one current "all" version
update public.terms_versions
set is_current = (version = '2026-08-v1')
where audience = 'all';
