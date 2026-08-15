import 'dart:async';
import 'dart:developer' as developer;

import 'package:geolocator/geolocator.dart';

import '../api/dio_client.dart';

/// Periodically pushes the provider's current GPS position to
/// ``POST /api/services/providers/me/heartbeat/`` so customers searching
/// nearby always match on a fresh location instead of the coordinates
/// captured during onboarding.
///
/// Lifecycle:
///   * call [start] when the provider is on shift (e.g. when they open the
///     dashboard and they're verified).
///   * call [stop] when they go offline / log out / close the app.
///
/// The service is a singleton because we only ever want one heartbeat
/// loop running at a time per provider device.
class ProviderHeartbeatService {
  ProviderHeartbeatService._();
  static final ProviderHeartbeatService instance =
      ProviderHeartbeatService._();

  Timer? _timer;
  bool _running = false;
  Duration _interval = const Duration(seconds: 30);

  bool get isRunning => _running;

  Future<void> start({
    Duration interval = const Duration(seconds: 30),
  }) async {
    if (_running) return;
    _interval = interval;
    _running = true;

    // Fire one immediately so the matcher has a fresh fix the moment the
    // provider goes online.
    unawaited(_pushHeartbeat());
    _timer = Timer.periodic(_interval, (_) => _pushHeartbeat());
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    _running = false;
  }

  Future<bool> _ensurePermission() async {
    LocationPermission perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    return perm == LocationPermission.always ||
        perm == LocationPermission.whileInUse;
  }

  Future<void> _pushHeartbeat({String? statusOverride}) async {
    try {
      final services = await Geolocator.isLocationServiceEnabled();
      if (!services) {
        developer.log(
          'Heartbeat skipped: location services disabled',
          name: 's_link.heartbeat',
        );
        return;
      }
      if (!await _ensurePermission()) {
        developer.log(
          'Heartbeat skipped: location permission missing',
          name: 's_link.heartbeat',
        );
        return;
      }

      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 12),
      );

      final body = <String, dynamic>{
        'lat': pos.latitude,
        'lng': pos.longitude,
      };
      if (statusOverride != null) body['status'] = statusOverride;

      await ApiClient.instance.dio.post(
        '/services/providers/me/heartbeat/',
        data: body,
      );
    } catch (e) {
      developer.log(
        'Provider heartbeat failed: $e',
        name: 's_link.heartbeat',
      );
    }
  }

  /// Force-push a heartbeat right now (e.g. just after the provider toggles
  /// availability or accepts a job).
  Future<void> pushNow({String? status}) async {
    await _pushHeartbeat(statusOverride: status);
  }
}
