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

- [`docs/PRODUCT.md`](docs/PRODUCT.md) — booking, KYC, payments, complaints, matching rules
- [`docs/API.md`](docs/API.md) — new/changed endpoints
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system map
- [`WORKFLOW.mmd`](WORKFLOW.mmd) — lifecycle diagram
- [`web/README.md`](web/README.md) — local API / env setup

## Quick start

```bash
cd web
npm install
npm run dev
# API + admin on http://localhost:3001 (or NEXT_PUBLIC_APP_URL)
```

Flutter: set `API_BASE_URL` / `AppConfig` to the Next.js host (LAN IP for devices).

Demo seed (optional):

```bash
cd web
npm run seed:nairobi
```

## Next-gen highlights

- Remote Kenya **job pin** + recipient details (book for someone else)
- Problem **description + voice** before discovery payment
- **Nearest-provider** ranking without hard radius geofencing
- Provider KYC: ID/passport photo, optional good-conduct cert, Places area, terms
- Complaints queue for customers/providers; admin review
- Spell-assist suggestions on key text fields
- **No fingerprint** capture or storage

## HTML prototypes

`customer.html` / `provider.html` / `launcher.html` are design prototypes only; the live product is Flutter + Next.js.
