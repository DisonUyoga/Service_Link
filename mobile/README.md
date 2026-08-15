# S-Link mobile (Flutter)

Android-first app for customers, providers, and (legacy) mobile admin monitoring. Talks to the Next.js API under `/api`.

## API base URL

Configured in [`lib/config/app_config.dart`](lib/config/app_config.dart):

| Mode | Default |
|------|---------|
| **Debug** (`flutter run`) | LAN Next.js, e.g. `http://<PC_IP>:3001/api` |
| **Release APK** | `https://service-link-mu.vercel.app/api` |

Overrides:

```bash
# Point debug at production
flutter run --dart-define=API_BASE_URL=https://service-link-mu.vercel.app/api

# Point debug at your current LAN IP
flutter run --dart-define=LOCAL_API_BASE_URL=http://10.x.x.x:3001/api

# Production APK (explicit production API)
flutter build apk --release --dart-define=API_BASE_URL=https://service-link-mu.vercel.app/api
```

APK output: `build/app/outputs/flutter-apk/app-release.apk`.

If you see `Connection refused` on a physical device, your PC Wi‑Fi IP likely changed — update `LOCAL_API_BASE_URL` / `AppConfig` and **fully restart** the app (not hot reload). Phone and PC must be on the same network for LAN debug.

## Login

Supports **username or email** + password. Google sign-in is available where configured.

## FCM (providers)

[`lib/services/push_notification_service.dart`](lib/services/push_notification_service.dart):

1. Requests notification permission
2. Obtains an FCM token
3. Registers it with `POST /api/devices/push-token/` (provider role only)

Server uses that token for AI-dispatch job offers (`job_offer`) and broadcasts (`job_broadcast`). See [`../docs/CHANGELOG.md`](../docs/CHANGELOG.md).

## Live location

- On-shift providers: [`ProviderHeartbeatService`](lib/services/provider_heartbeat_service.dart) (~30s) → `/services/providers/me/heartbeat/`
- Active jobs: GPS stream → Firebase RTDB + `/services/jobs/:id/update_location/`

## Docs

- Product: [`../docs/PRODUCT.md`](../docs/PRODUCT.md)
- API: [`../docs/API.md`](../docs/API.md)
- Changelog (FCM, admin, auth): [`../docs/CHANGELOG.md`](../docs/CHANGELOG.md)
