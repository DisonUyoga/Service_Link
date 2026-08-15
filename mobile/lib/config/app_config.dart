/// Runtime configuration via `--dart-define` flags.
class AppConfig {
  /// Django REST API root, e.g. `http://10.0.2.2:8000/api` (Android emulator).
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://192.168.0.106:3001/api',
  );

  static const bool enableGoogleMaps = bool.fromEnvironment(
    'ENABLE_GOOGLE_MAPS',
    defaultValue: true,
  );

  /// Google Maps JS API key — used by the admin web monitor + can be
  /// referenced from the mobile app for shared map styling.
  static const String googleMapsApiKey = String.fromEnvironment(
    'GOOGLE_MAPS_API_KEY',
    defaultValue: 'AIzaSyAyJb-xED-qEcJ1D8LQNFoaxFzZJMKLDms',
  );

  /// M-Pesa connection fee (KES) — must match backend default.
  static const int connectionFeeKes = 50;

  /// Fallback coordinates (Nairobi CBD) when GPS is unavailable.
  static const double fallbackLat = -1.286389;
  static const double fallbackLng = 36.817223;
}
