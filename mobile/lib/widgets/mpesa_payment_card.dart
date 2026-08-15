import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/dio_client.dart';
import '../config/app_config.dart';
import '../services/payment_service.dart';
import 'modern_ui.dart';

/// Inline card shown when a job is accepted but not yet paid.
class MpesaPaymentCard extends StatefulWidget {
  const MpesaPaymentCard({
    super.key,
    required this.jobId,
    required this.onPaid,
    this.initialPhone,
  });

  final int jobId;
  final VoidCallback onPaid;
  final String? initialPhone;

  @override
  State<MpesaPaymentCard> createState() => _MpesaPaymentCardState();
}

class _MpesaPaymentCardState extends State<MpesaPaymentCard> {
  late final TextEditingController _phoneController;
  bool _loading = false;
  bool _polling = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _phoneController = TextEditingController(text: widget.initialPhone ?? '');
  }

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  String _normalisePhone(String raw) {
    var p = raw.trim().replaceAll(RegExp(r'[\s+\-]'), '');
    if (p.startsWith('0') && p.length >= 10) {
      p = '254${p.substring(1)}';
    }
    return p;
  }

  Future<void> _pay() async {
    final phone = _normalisePhone(_phoneController.text);
    if (phone.length < 12 || !phone.startsWith('254')) {
      setState(() => _error =
          'Enter a valid M-Pesa number (07XXXXXXXX or 2547XXXXXXXX)');
      return;
    }

    setState(() {
      _loading = true;
      _polling = false;
      _error = null;
    });

    try {
      await PaymentService.instance.initiate(
        jobId: widget.jobId,
        phoneNumber: phone,
      );

      if (!mounted) return;

      setState(() {
        _loading = false;
        _polling = true;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('STK push sent — approve the payment on your phone'),
        ),
      );

      final paid = await PaymentService.instance.waitForPayment(
        jobId: widget.jobId,
      );

      if (!mounted) return;

      setState(() => _polling = false);

      if (paid) {
        widget.onPaid();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Payment received. Provider can start!')),
        );
      } else {
        setState(() {
          _error =
              'Payment not confirmed yet. Tap Pay again after approving STK.';
        });
      }
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _polling = false;
        _error = ApiClient.messageFrom(e, fallback: 'Payment could not be started');
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _polling = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final busy = _loading || _polling;

    return ModernCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const GradientIconBubble(icon: Icons.payments_rounded, size: 44),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Pay to connect',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      'KES ${AppConfig.connectionFeeKes} M-Pesa fee unlocks live tracking',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: Colors.grey.shade700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9+\- ]')),
            ],
            decoration: const InputDecoration(
              labelText: 'M-Pesa phone number',
              hintText: '0712345678 or 254712345678',
              prefixIcon: Icon(Icons.phone_android_outlined),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: Colors.red)),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: busy ? null : _pay,
              icon: busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.send_rounded),
              label: Text(
                _polling
                    ? 'Waiting for M-Pesa approval…'
                    : 'Pay KES ${AppConfig.connectionFeeKes}',
              ),
            ),
          ),
        ],
      ),
    );
  }
}
