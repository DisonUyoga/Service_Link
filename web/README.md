# S-Link Web (Next.js + Supabase)

Flutter-compatible replacement for the Django backend. Same `/api/...` contracts the mobile app already calls, with a streamlined job/payment lifecycle and a minimal admin console.

## Quick start

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
# Default port 3001 — see package.json
```

Open:

- App home: http://localhost:3001
- Admin: http://localhost:3001/admin
- Health: http://localhost:3001/api/health/

Product docs: [`../docs/PRODUCT.md`](../docs/PRODUCT.md) · API: [`../docs/API.md`](../docs/API.md)

### Demo accounts (memory / seed)

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` / `demo_admin` | `password123` / `DemoPass123!` |
| Customer | `customer1` / `demo_customer` | `password123` / `DemoPass123!` |
| Provider | `provider1` / `plumber_01` | `password123` / `DemoPass123!` |

## Point Flutter at this API

```bash
flutter run --dart-define=API_BASE_URL=http://YOUR_LAN_IP:3001/api
```

Default in app config targets port **3001**.

## Next-gen endpoints (summary)

- `/api/services/places/` — Kenya Places autocomplete/details
- `/api/legal/terms/` — current terms + acceptance
- `/api/services/complaints/` — customer/provider complaints
- `/api/ai/spellcheck/` — spelling suggestions
- `/api/services/providers/admin/documents/` — KYC review

See [`docs/API.md`](../docs/API.md) for field-level details.

## Supabase (production persistence)

1. Create a Supabase project.
2. Run SQL in order:
   - [`supabase/migrations/001_initial.sql`](../supabase/migrations/001_initial.sql)
   - [`supabase/seed.sql`](../supabase/seed.sql)
3. In `web/.env.local`:

```env
DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=replace-with-long-random-secret-at-least-32-chars
```

4. Restart `npm run dev`.

> Current runtime uses an in-memory store when `DEMO_MODE=true` (default) so you can assess flows immediately. Schema + RLS + RPCs are ready for Supabase cutover.

## Job lifecycle (improved)

1. Customer creates job (optionally with provider) → `pending_provider`
2. Customer initiates payment (Flutter does this immediately) → `is_paid=true` (demo auto-succeeds)
3. Provider accepts → `in_progress` if paid, else `accepted`
4. Provider completes → `completed` + tier recompute
5. Customer rates → updates provider averages

Also available: `POST /api/services/jobs/:id/cancel/`

## Key API surface

| Area | Paths |
|------|--------|
| Auth | `/api/accounts/register/`, `token/`, `token/refresh/`, `google-login/`, `me/` |
| Services | `/api/services/categories/`, `providers/nearby/`, `providers/me/`, `jobs/`, `ratings/` |
| Payments | `/api/payments/initiate/`, `/api/payments/mpesa/callback/` |
| Ads | `/api/ads/my/`, `/api/ads/public/` |
| AI | `/api/ai/match-providers/`, `/api/ai/feedback-summary/` |
| Admin | `/api/admin/overview/`, `/api/services/providers/admin/` |

## Google login (Firebase Auth) — Admin portal

This Next.js app is the **admin console**. Customers and providers use the Flutter app.

1. Firebase Console → Authentication → enable **Google**.
2. Authorized domains: `localhost` + production host.
3. In production set `ADMIN_EMAILS=you@company.com,other@company.com` (comma-separated).
4. In demo mode with empty `ADMIN_EMAILS`, any Google account can bootstrap as admin for local testing.
5. Login → Google → `/admin`.

## Optional env

- `GEMINI_API_KEY` — richer feedback summaries
- `MPESA_*` — live Daraja STK (otherwise demo auto-success)
- `FIREBASE_PROJECT_ID` — Firebase ID token audience (defaults to `NEXT_PUBLIC_FIREBASE_PROJECT_ID`)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — map tiles only (not used for login)

## Notes

- Live GPS remains on Firebase RTDB (`drivers/{providerId}/coordinates`) for Flutter parity; location history is also stored via `update_location`.
- Trailing-slash URLs are supported (`skipTrailingSlashRedirect`).
