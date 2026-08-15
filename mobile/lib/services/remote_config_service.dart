import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../api/dio_client.dart';
import '../config/app_config.dart';

/// Live, server-driven feature flags fetched from `GET /api/config/`.
///
/// We deliberately fall back to safe defaults so the app keeps working even
/// when the backend is unreachable (e.g. first launch on a flaky connection).
class RemoteConfigService {
  RemoteConfigService._();

  static final RemoteConfigService instance = RemoteConfigService._();

  /// Cached values, updated by [refresh].
  final ValueNotifier<RemoteConfig> notifier =
      ValueNotifier<RemoteConfig>(RemoteConfig.defaults());

  RemoteConfig get current => notifier.value;

  bool get connectionFeeEnabled => notifier.value.connectionFeeEnabled;
  int get connectionFeeKes => notifier.value.connectionFeeKes;
  double get geofenceDefaultRadiusKm => notifier.value.geofenceDefaultRadiusKm;
  double get geofenceMaxRadiusKm => notifier.value.geofenceMaxRadiusKm;

  Future<RemoteConfig> refresh() async {
    try {
      final response = await ApiClient.instance.dio.get('/config/');
      final data = Map<String, dynamic>.from(response.data as Map);
      final cfg = RemoteConfig.fromJson(data);
      notifier.value = cfg;
      return cfg;
    } on DioException catch (e) {
      debugPrint('RemoteConfigService.refresh failed: ${e.message}');
      return notifier.value;
    } catch (e) {
      debugPrint('RemoteConfigService.refresh unexpected error: $e');
      return notifier.value;
    }
  }
}

@immutable
class RemoteConfig {
  final bool connectionFeeEnabled;
  final int connectionFeeKes;
  final double geofenceDefaultRadiusKm;
  final double geofenceMaxRadiusKm;
  final double arrivalNotificationMeters;
  final int providerResponseTimeoutMin;

  const RemoteConfig({
    required this.connectionFeeEnabled,
    required this.connectionFeeKes,
    required this.geofenceDefaultRadiusKm,
    required this.geofenceMaxRadiusKm,
    required this.arrivalNotificationMeters,
    required this.providerResponseTimeoutMin,
  });

  factory RemoteConfig.defaults() => RemoteConfig(
        connectionFeeEnabled: false,
        connectionFeeKes: AppConfig.connectionFeeKes,
        geofenceDefaultRadiusKm: 10,
        geofenceMaxRadiusKm: 30,
        arrivalNotificationMeters: 500,
        providerResponseTimeoutMin: 5,
      );

  factory RemoteConfig.fromJson(Map<String, dynamic> json) => RemoteConfig(
        connectionFeeEnabled:
            json['connection_fee_enabled'] == true,
        connectionFeeKes: (json['connection_fee_kes'] as num?)?.toInt() ??
            AppConfig.connectionFeeKes,
        geofenceDefaultRadiusKm:
            (json['geofence_default_radius_km'] as num?)?.toDouble() ?? 10,
        geofenceMaxRadiusKm:
            (json['geofence_max_radius_km'] as num?)?.toDouble() ?? 30,
        arrivalNotificationMeters:
            (json['arrival_notification_meters'] as num?)?.toDouble() ?? 500,
        providerResponseTimeoutMin:
            (json['provider_response_timeout_min'] as num?)?.toInt() ?? 5,
      );
}
