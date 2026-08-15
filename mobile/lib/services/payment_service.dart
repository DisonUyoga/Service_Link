import 'package:dio/dio.dart';

import '../api/dio_client.dart';
import '../config/app_config.dart';

class PaymentService {
  PaymentService._();

  static final PaymentService instance = PaymentService._();

  /// Starts M-Pesa STK push for the job connection fee.
  Future<Map<String, dynamic>> initiate({
    required int jobId,
    String? phoneNumber,
  }) async {
    final response = await ApiClient.instance.dio.post(
      '/payments/initiate/',
      data: {
        'job': jobId,
        if (phoneNumber != null && phoneNumber.isNotEmpty)
          'phone_number': phoneNumber,
      },
    );

    return Map<String, dynamic>.from(response.data as Map);
  }

  /// Asks the backend to actively query Daraja for the latest STK status.
  ///
  /// Useful when the M-Pesa callback URL isn't reachable (e.g. dev machine
  /// running on localhost) — we still want the UI to flip to "paid" once
  /// the customer approves the prompt.
  Future<bool> queryPayment(int jobId) async {
    try {
      final response = await ApiClient.instance.dio.get(
        '/payments/query/$jobId/',
      );
      final data = Map<String, dynamic>.from(response.data as Map);
      return data['is_paid'] == true || data['status'] == 'success';
    } on DioException {
      return false;
    }
  }

  /// Polls until the job becomes paid or [maxAttempts] is reached.
  /// Each tick alternates between checking the local job state and asking
  /// Daraja directly via [queryPayment], so it works even without a public
  /// callback URL.
  Future<bool> waitForPayment({
    required int jobId,
    int maxAttempts = 24,
    Duration interval = const Duration(seconds: 5),
  }) async {
    for (var i = 0; i < maxAttempts; i++) {
      await Future<void>.delayed(interval);

      final response = await ApiClient.instance.dio.get(
        '/services/jobs/$jobId/',
      );

      final job = Map<String, dynamic>.from(response.data as Map);
      if (job['is_paid'] == true) return true;

      // Every 2nd attempt also actively poll Daraja directly.
      if (i.isOdd) {
        final paid = await queryPayment(jobId);
        if (paid) return true;
      }
    }

    return false;
  }

  int get connectionFeeKes => AppConfig.connectionFeeKes;
}
