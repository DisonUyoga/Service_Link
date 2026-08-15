# S-Link

Marketplace connecting **customers** with **service providers** in Kenya — including remote booking via a job location pin.

## Stack (source of truth)

| Layer | Path | Role |
|-------|------|------|
| Next.js API + Admin | [`web/`](web/) | Flutter-compatible `/api/*`, M-Pesa, Places proxy, admin console |
| Flutter mobile | [`mobile/`](mobile/) | Customer, provider, and admin monitoring apps |
| Supabase | [`supabase/`](supabase/) | Postgres schema, storage, realtime |
| Django (legacy) | [`backend/`](backend/) | Historical API contract reference only |

## Docs

- [`docs/PRODUCT.md`](docs/PRODUCT.md) — booking, KYC, payments, complaints, matching, FCM dispatch
- [`docs/API.md`](docs/API.md) — endpoints (including admin, heartbeat, push-token)
- [`docs/ADMIN.md`](docs/ADMIN.md) — admin console runbook
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — recent changes (FCM, admin, auth, location)
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system map
- [`WORKFLOW.mmd`](WORKFLOW.mmd) — lifecycle diagram
- [`web/README.md`](web/README.md) — local API / env setup
- [`mobile/README.md`](mobile/README.md) — Flutter config, FCM, production APK

## Quick start

```bash
cd web
npm install
npm run dev
# API + admin on http://localhost:3001 (or NEXT_PUBLIC_APP_URL)
```

Flutter:

- **Debug / device on LAN:** set `LOCAL_API_BASE_URL` or update `AppConfig` to your PC IP (`:3001`).
- **Release APK:** uses production `https://service-link-mu.vercel.app/api` by default.

```bash
cd mobile
flutter build apk --release --dart-define=API_BASE_URL=https://service-link-mu.vercel.app/api
```

Demo seed (optional):

```bash
cd web
npm run seed:nairobi
```

## Next-gen highlights

- Remote Kenya **job pin** + recipient details (book for someone else)
- Problem **description + voice** before discovery payment
- **Nearest-provider** ranking without hard radius geofencing
- **AI dispatch + FCM** job offers / broadcast to providers
- Provider KYC: ID/passport photo, optional good-conduct cert, Places area, terms
- Admin console: live map, KYC detail, terms, access allowlist, Kenya data quality
- Complaints queue for customers/providers; admin review
- Spell-assist suggestions on key text fields
- **No fingerprint** capture or storage

## Production

- Web/API: [https://service-link-mu.vercel.app](https://service-link-mu.vercel.app)
- Admin: [https://service-link-mu.vercel.app/admin](https://service-link-mu.vercel.app/admin)

## HTML prototypes

`customer.html` / `provider.html` / `launcher.html` are design prototypes only; the live product is Flutter + Next.js.
