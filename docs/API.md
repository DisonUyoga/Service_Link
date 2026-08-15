# S-Link API notes (Next-gen additions)

Base URL: Next.js server, e.g. `http://192.168.0.106:3001/api`  
Auth: `Authorization: Bearer <access>`

## Jobs

### `POST /services/jobs/`

Additional fields:

| Field | Notes |
|-------|--------|
| `location_lat`, `location_lng` | Required job pin |
| `formatted_address`, `address_text` | Human address |
| `place_id` | Google Places id |
| `recipient_name`, `recipient_phone` | Site contact |
| `access_notes` | Gate codes / hints |
| `description` | Required; describe problem before pay |
| `discovery_payment_id` | Optional unlock payment |

Serialized jobs may omit `recipient_phone` for providers while status is `pending_provider`.

## Matching

### `POST /ai/match-providers/` / nearby providers

Rank by distance to the supplied lat/lng (job pin). Hard radius cutoffs are not applied. Response may include `ranking: "nearest_to_pin"` and `radius_km: null`.

## Places

### `GET /services/places/?mode=autocomplete&input=...`

Kenya-biased autocomplete predictions.

### `GET /services/places/?mode=details&place_id=...`

Returns `lat`, `lng`, `formatted_address`, `place_id`.

## Provider KYC

### `PUT /services/providers/me/`

Accepts `id_document_number`, `id_document_kind`, `area_place_id`, `area_formatted_address`, plus existing profile fields. **Does not auto-verify.**

### `GET|POST /services/providers/me/documents/`

Multipart POST: `title`, `file`, `document_type` (`national_id_or_passport` | `good_conduct` | `other`).

### `GET|PATCH /services/providers/admin/documents/`

Admin list by `profile_id`; PATCH `{ document_id, review_status, review_notes }`.

## Terms

### `GET /legal/terms/?audience=customer|provider|all`

Current terms version.

### `POST /legal/terms/`

`{ terms_version_id?, client_meta? }` — records acceptance for the authenticated user.

## Complaints

### `GET|POST /services/complaints/`

POST `{ category, body, job_id?, against_user_id? }`

### `PATCH /services/complaints/` (admin)

`{ id, status, resolution_notes? }` — statuses: `open`, `in_review`, `resolved`, `dismissed`.

## Spell assist

### `GET|POST /ai/spellcheck/`

`text` → `{ original, corrected, changed, suggestions[] }`

## Migrations

`008_remote_job_pin.sql` … `012_grants_terms_complaints.sql` under `supabase/migrations/`.
