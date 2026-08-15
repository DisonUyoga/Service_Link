# Recent changes log

Product and engineering notes for features shipped after the core marketplace (remote job pin, KYC, terms, complaints). Production web/API: [https://service-link-mu.vercel.app](https://service-link-mu.vercel.app).

---

## AI dispatch + Firebase Cloud Messaging (FCM)

**Migrations:** `supabase/migrations/013_ai_dispatch_and_fcm.sql`  
**Apply helper:** `supabase/apply-013.mjs`

### Behaviour

1. When a customer creates a job, the API ranks eligible providers with **Gemini** (`web/src/lib/ai/provider-ranking.ts`).
2. Ranked candidates are stored in `job_dispatches`.
3. **Wave 1:** only rank #1 gets an FCM push (`type=job_offer`). Others stay `queued`.
4. **Wave 2:** after timeout (cron / `expire-pending`), remaining candidates are `broadcast` and notified (`type=job_broadcast`); the job becomes open to accept.

### Tables

| Table | Purpose |
|-------|---------|
| `provider_device_tokens` | FCM registration tokens per provider user |
| `job_dispatches` | Ranked queue + status (`queued`, `notified`, `broadcast`, `accepted`, …) |

### Server

| File | Role |
|------|------|
| `web/src/lib/dispatch.ts` | Rank → store → notify #1 / broadcast |
| `web/src/lib/notifications/fcm.ts` | Firebase Admin multicast (no-op if SA missing) |
| `web/src/app/api/devices/push-token/route.ts` | Register/update device token |
| `web/src/app/api/services/jobs/expire-pending/route.ts` | Timeout → broadcast wave |

### Mobile

| File | Role |
|------|------|
| `mobile/lib/services/push_notification_service.dart` | Request permission, get token, register with API |
| `mobile/lib/main.dart` | Init FCM; providers register tokens after login |

Push registration runs for **provider** role only. Requires `FIREBASE_SERVICE_ACCOUNT_JSON` on the server and a valid Flutter Firebase config.

### Env (names only)

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_AUTH_PROJECT_ID` / `FIREBASE_AUTH_PROJECT_IDS`
- `NEXT_PUBLIC_FIREBASE_*` (web client)
- `GEMINI_API_KEY`
- `CRON_SECRET` (protect expire-pending / cleanup)

---

## Admin console redesign

**UI:** `web/src/app/admin/page.tsx` + `web/src/components/admin/*`  
**Guide:** [`ADMIN.md`](ADMIN.md)

### What was added

| Area | Change |
|------|--------|
| Shell | Fixed sidebar (`AdminShell`); tabs: Overview, Providers, Jobs, Payments, Ads, Complaints, Terms, Access, Data quality |
| Overview map | Full-height live map; clearer pin markers; POIs muted; modern loading skeleton planned/shipped with map polish |
| Providers | Click row / **Details** → full profile + KYC documents; Approve/Reject docs; Verify / Suspend still live |
| Terms | Create/publish versioned ToS (`/api/admin/terms/`) |
| Access | DB allowlist (`admin_allowlist`, migration `014`) for Google admin login |
| Data quality | Kenya boundary audit + cleanup APIs/scripts |
| Pagination | 20 rows/page on list tabs |

### Key APIs

- `GET /api/admin/overview/`
- `GET /api/admin/live/` (SSE refresh)
- `GET|POST|DELETE /api/admin/allowed-emails/`
- `GET|POST|PATCH /api/admin/terms/`
- `GET /api/admin/data-quality/` · `POST …/cleanup/`
- `GET /api/services/providers/admin/?provider_id=` (full detail + documents)
- `GET|PATCH /api/services/providers/admin/documents/`

---

## Auth & mobile API targeting

| Change | Detail |
|--------|--------|
| Login | Username **or** email (`authenticate` in store + login UI) |
| Debug Flutter | `LOCAL_API_BASE_URL` / default LAN IP → local Next `:3001` |
| Release APK | Always `https://service-link-mu.vercel.app/api` unless `--dart-define=API_BASE_URL=…` |
| Admin web | Firebase Google sign-in; allowlist in DB (fallback `ADMIN_EMAILS`) |

Config: `mobile/lib/config/app_config.dart`.

**Production APK build:**

```bash
cd mobile
flutter build apk --release --dart-define=API_BASE_URL=https://service-link-mu.vercel.app/api
```

---

## Live location (current)

- Provider **heartbeat** ~30s → `POST /services/providers/me/heartbeat/` → `current_lat/lng`, `last_seen_at`.
- Active job → also inserts into `provider_locations` (job trail).
- Job tracking screen writes Firebase RTDB **and** `update_location` API.
- Admin map uses job pins + provider latest (trail → heartbeat → base).

**Planned (not required for this doc’s “shipped” list):** 72-hour retention + admin history polyline (see Cursor plan `location-history`).

---

## Migrations index (recent)

| File | Topic |
|------|--------|
| `009_provider_kyc.sql` | KYC document types / fields |
| `010_terms_and_consent.sql` | Terms versions + acceptances |
| `011_complaints_feedback.sql` | Complaints |
| `012_grants_terms_complaints.sql` | Grants |
| `013_ai_dispatch_and_fcm.sql` | Dispatch queue + FCM tokens |
| `014_admin_allowlist.sql` | Admin email allowlist |

---

## Related docs

- [`PRODUCT.md`](PRODUCT.md) — product behaviour
- [`API.md`](API.md) — endpoint reference
- [`ADMIN.md`](ADMIN.md) — console runbook
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — system map
