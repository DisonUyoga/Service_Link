import 'package:dio/dio.dart';

import '../api/dio_client.dart';
import '../config/app_config.dart';

/// Drives the M-Pesa STK push the customer makes BEFORE they're allowed to
/// view matched provider profiles.
class DiscoveryPaymentService {
  DiscoveryPaymentService._();

  static final DiscoveryPaymentService instance = DiscoveryPaymentService._();

  /// Triggers an STK push for the discovery / connection fee (min KES 50).
  ///
  /// Returns the backend's `DiscoveryPayment` record.
  Future<Map<String, dynamic>> initiate({
    required String phoneNumber,
    int amount = 50,
    int? categoryId,
    double? lat,
    double? lng,
    String? query,
    int? providerCount,
  }) async {
    final response = await ApiClient.instance.dio.post(
      '/payments/discovery/initiate/',
      data: {
        'phone_number': phoneNumber,
        'amount': amount < AppConfig.connectionFeeKes
            ? AppConfig.connectionFeeKes
            : amount,
        if (categoryId != null) 'category_id': categoryId,
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
        if (query != null && query.isNotEmpty) 'query': query,
        if (providerCount != null) 'provider_count': providerCount,
      },
    );
    return Map<String, dynamic>.from(response.data as Map);
  }

  /// Polls the backend (which polls Daraja) until the discovery payment is
  /// confirmed or [maxAttempts] is reached.
  Future<Map<String, dynamic>?> waitForPayment({
    required int discoveryId,
    int maxAttempts = 24,
    Duration interval = const Duration(seconds: 5),
  }) async {
    for (var i = 0; i < maxAttempts; i++) {
      await Future<void>.delayed(interval);
      try {
        final response = await ApiClient.instance.dio.get(
          '/payments/discovery/$discoveryId/',
        );
        final data = Map<String, dynamic>.from(response.data as Map);
        if (data['is_paid'] == true || data['status'] == 'success') {
          return data;
        }
        if (data['status'] == 'failed') {
          return data;
        }
      } on DioException {
        // Network blip — keep polling, the customer's STK may still resolve.
        continue;
      }
    }
    return null;
  }
}
