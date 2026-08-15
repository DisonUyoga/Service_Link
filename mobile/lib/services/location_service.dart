import 'package:geolocator/geolocator.dart';

import '../config/app_config.dart';

/// Resolves the customer's current coordinates for nearby matching.
class LocationService {
  LocationService._();

  static final LocationService instance = LocationService._();

  /// Returns `(lat, lng)` or falls back to [AppConfig.fallbackLat]/[fallbackLng].
  Future<({double lat, double lng, bool usedFallback})> currentCoordinates() async {
    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        return (
          lat: AppConfig.fallbackLat,
          lng: AppConfig.fallbackLng,
          usedFallback: true,
        );
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return (
          lat: AppConfig.fallbackLat,
          lng: AppConfig.fallbackLng,
          usedFallback: true,
        );
      }

      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.medium,
        timeLimit: const Duration(seconds: 12),
      );

      return (
        lat: position.latitude,
        lng: position.longitude,
        usedFallback: false,
      );
    } catch (_) {
      return (
        lat: AppConfig.fallbackLat,
        lng: AppConfig.fallbackLng,
        usedFallback: true,
      );
    }
  }
}
