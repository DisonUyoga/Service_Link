import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

/// Ensures device GPS is on and the app has location permission.
///
/// Shows a dialog that can open system Location settings or App settings
/// when the provider cannot broadcast a live position.
class ProviderLocationGate {
  ProviderLocationGate._();

  /// Returns `true` when live location can be used.
  static Future<bool> ensure(BuildContext context, {String? purpose}) async {
    final reason = purpose ??
        'S-Link needs your live location so customers nearby can find you and track arrivals.';

    final servicesOn = await Geolocator.isLocationServiceEnabled();
    if (!servicesOn) {
      if (!context.mounted) return false;
      final open = await _prompt(
        context,
        title: 'Turn on location',
        message:
            'Location is currently off on this device.\n\n$reason\n\nOpen Location settings and switch it on, then return to the app.',
        actionLabel: 'Open Location settings',
      );
      if (open) await Geolocator.openLocationSettings();
      return false;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.denied) {
      if (!context.mounted) return false;
      await _prompt(
        context,
        title: 'Location permission needed',
        message: '$reason\n\nAllow location access when prompted, or try again.',
        actionLabel: 'OK',
        showCancel: false,
      );
      return false;
    }

    if (permission == LocationPermission.deniedForever) {
      if (!context.mounted) return false;
      final open = await _prompt(
        context,
        title: 'Allow location in Settings',
        message:
            '$reason\n\nLocation access is blocked for S-Link. Open App settings and enable Location.',
        actionLabel: 'Open App settings',
      );
      if (open) await openAppSettings();
      return false;
    }

    return true;
  }

  static Future<bool> _prompt(
    BuildContext context, {
    required String title,
    required String message,
    required String actionLabel,
    bool showCancel = true,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          if (showCancel)
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Not now'),
            ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(actionLabel),
          ),
        ],
      ),
    );
    return result == true;
  }
}
