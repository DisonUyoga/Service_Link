import 'package:flutter/foundation.dart';

/// Runtime configuration via `--dart-define` flags.
///
/// Defaults:
/// - **Debug / local develop** → local Next.js API
/// - **Release / production APK** → Vercel HTTPS API
///
/// Explicit override (wins in every mode):
/// ```bash
/// flutter run --dart-define=API_BASE_URL=http://10.204.102.125:3001/api
/// flutter build apk --release
/// ```
/// Release APKs always use [productionApiBaseUrl] unless API_BASE_URL is set.
class AppConfig {
  static const String productionApiBaseUrl =
      'https://service-link-mu.vercel.app/api';

  /// LAN / emulator URL used while developing with `flutter run` (debug).
  /// Android emulator → often `http://10.0.2.2:3001/api`
  /// Physical device → your PC LAN IP (run `ipconfig` and update if Wi‑Fi changes)
  static const String localApiBaseUrl = String.fromEnvironment(
    'LOCAL_API_BASE_URL',
    defaultValue: 'https://service-link-mu.vercel.app/api',
  );

  static const String _apiBaseUrlOverride = String.fromEnvironment('API_BASE_URL');

  /// Active API root for Dio.
  static String get apiBaseUrl {
    if (_apiBaseUrlOverride.isNotEmpty) return _apiBaseUrlOverride;
    if (kReleaseMode) return productionApiBaseUrl;
    return localApiBaseUrl;
  }

  static bool get isUsingProductionApi =>
      apiBaseUrl.startsWith('https://service-link-mu.vercel.app');

  static const bool enableGoogleMaps = bool.fromEnvironment(
    'ENABLE_GOOGLE_MAPS',
    defaultValue: true,
  );

  /// Google Maps JS API key — used by the admin web monitor + can be
  /// referenced from the mobile app for shared map styling.
  static const String googleMapsApiKey = String.fromEnvironment(
    'GOOGLE_MAPS_API_KEY',
    defaultValue: 'AIzaSyCXwWV5lznqOhMVp88nbaP_Onreibhm2Z4',
  );

  /// M-Pesa connection fee (KES) — must match backend default.
  static const int connectionFeeKes = 50;

  /// Fallback coordinates (Nairobi CBD) when GPS is unavailable.
  static const double fallbackLat = -1.286389;
  static const double fallbackLng = 36.817223;
}
