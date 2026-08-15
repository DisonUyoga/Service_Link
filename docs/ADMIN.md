# Admin console guide

URL (production): [https://service-link-mu.vercel.app/admin](https://service-link-mu.vercel.app/admin)  
Local: `http://localhost:3001/admin`

Sign in with an allowlisted Google account (or legacy demo admin in memory mode). Access is gated by `admin_allowlist` (with a per-email `role`) and/or `ADMIN_EMAILS`.

Portal roles:

| Role | Console access |
|------|----------------|
| **Administrator** | Full console: Access, Terms, Ads, Data quality, plus day-to-day ops |
| **Operations staff** | Overview map, Providers (incl. KYC / verify / suspend), Jobs, Payments, Complaints |

## Navigation

Sidebar stays fixed while the main panel scrolls. Operations staff only see the tabs they can use.

| Tab | Purpose | Who |
|-----|---------|-----|
| **Overview** | Live map with Providers / Customer jobs toggle; realtime SSE badge | Admin + operations |
| **Providers** | List, verify/suspend, open full details + KYC documents | Admin + operations |
| **Jobs** | Job list (paginated) | Admin + operations |
| **Payments** | Payment list | Admin + operations |
| **Ads** | Ad placements moderation | Admin only |
| **Complaints** | Review / resolve / dismiss | Admin + operations |
| **Terms** | Create and publish terms versions (all / customer / provider) | Admin only |
| **Access** | Grant or revoke portal emails as Administrator or Operations staff | Admin only |
| **Data quality** | Audit providers outside Kenya; optional cleanup | Admin only |

## Providers & KYC

1. Open **Providers**.
2. Click a row or **Details**.
3. Review profile (contact, category, bio, area, ID metadata).
4. Open uploaded files; **Approve** or **Reject** (optional notes).
5. When satisfied, **Verify** (sets verified + available).
6. Use **Suspend** / **Unsuspend** for policy issues.

API detail: `GET /api/services/providers/admin/?provider_id={id}`  
Docs review: `PATCH /api/services/providers/admin/documents/`

## Live map

- Overview toggle: **Providers** (teal) or **Customer jobs** (orange) — layers are not mixed.
- Base-map POIs are muted so ops markers stand out.
- Live refresh via `GET /api/admin/live/` (SSE) → soft overview reload.

## Terms

Use **Terms** to add a new version and publish. Mobile apps load current terms from `GET /api/legal/terms/?audience=…`.

## Access allowlist

Use **Access** to add emails that may open `/admin` after Google login, choosing **Administrator** or **Operations staff**. Migrations: `014_admin_allowlist.sql`, `015_operations_role.sql`. Keep at least one administrator on the list.

## Data quality (Kenya)

Runs an offline point-in-polygon check against provider coordinates. Outside-Kenya providers can be audited and removed via the panel / `supabase/cleanup-outside-kenya.mjs`.

## Ops checklist

1. Confirm FCM + Gemini env are set if dispatch should notify providers.
2. Keep at least one allowlisted admin email.
3. Review pending KYC before verifying.
4. Watch Overview map after providers go on-shift (heartbeat).
