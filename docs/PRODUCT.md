# S-Link Product Guide (Next-gen)

Primary stack: **Flutter** (`mobile/`) + **Next.js API** (`web/`) + **Supabase** (`supabase/`).  
Django in `backend/` is a **contract reference only**.

## Booking for someone else (remote Kenya pin)

Customers can request a service from anywhere (for example the US) for a site in Kenya.

1. Choose the service
2. Drop a **WhatsApp-style location pin** (Places autocomplete + map) on the Kenya job site
3. Enter **recipient name**, **Kenya phone**, optional **access notes**
4. **Describe the problem** (text and/or voice)
5. Pay the **discovery / connection fee** (when enabled)
6. See providers **ranked nearest to the job pin**
7. Create the job; live tracking navigates the provider to that pin

Recipient phone is stored at create time and **revealed to the assigned provider after accept** (customers and admins always see it).

## Matching vs geofencing

- **Kept:** nearest-provider ranking (distance to job pin + rating/tier).
- **Removed:** hard radius geofencing (customer radius slider and `service_radius_km` hard filters).
- Soft “area of operation” on the provider profile is for onboarding/ranking bias, not a hard fence.

## Payments

- Discovery payment happens **only after** the problem description step.
- Job create requires a non-empty description and a location pin.
- Job M-Pesa flows after accept remain as before.

## Provider KYC (no fingerprint)

**Required**
- National ID or passport **photo** (`document_type=national_id_or_passport`)
- ID/passport number + kind
- Service category, bio, pricing
- Area of operation via Google Places
- Terms acceptance

**Optional**
- Certificate of good conduct (`document_type=good_conduct`)

**Out of scope:** collecting or storing fingerprint biometric templates.

Providers stay **unverified** until an admin reviews documents and verifies. Saving a bio no longer auto-verifies.

## Terms

Versioned terms live in `terms_versions`. Acceptances are recorded in `user_terms_acceptances` (and `terms_accepted_at` on provider profiles). Register and provider onboarding require acceptance of the current version.

## Complaints & feedback

- Post-job **ratings** remain separate.
- **Complaints** (`complaints` table) can be filed by customers or providers (optionally linked to a job).
- Admin console has a Complaints tab and KYC document approve/reject on Providers.

## Spelling assistance

Lightweight domain dictionary via `/api/ai/spellcheck/` plus suggestion chips on search, problem description, and complaints. OS keyboard spellcheck remains available where the device supports it.

## Admin runbook

1. **KYC review:** Admin → Providers → Docs → Approve/Reject each document → Verify provider when satisfied.
2. **Complaints:** Admin → Complaints → Review / Resolve / Dismiss with notes.
3. **Live ops:** map on Admin home uses job pins + provider heartbeats.
