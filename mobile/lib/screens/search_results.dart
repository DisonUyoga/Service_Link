import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../api/dio_client.dart';
import '../config/app_config.dart';
import '../services/auth_service.dart';
import '../services/discovery_payment_service.dart';
import '../services/remote_config_service.dart';
import '../widgets/modern_ui.dart';
import '../utils/format_label.dart';

class SearchResultsScreen extends StatefulWidget {
  final String query;
  final double lat;
  final double lng;
  final int? categoryId;
  final String? categoryName;
  final int? budgetMin;
  final int? budgetMax;
  final String? priority;
  final String formattedAddress;
  final String? placeId;
  final String recipientName;
  final String recipientPhone;
  final String accessNotes;

  const SearchResultsScreen({
    super.key,
    required this.query,
    required this.lat,
    required this.lng,
    this.categoryId,
    this.categoryName,
    this.budgetMin,
    this.budgetMax,
    this.priority,
    this.formattedAddress = 'Dropped map pin',
    this.placeId,
    this.recipientName = '',
    this.recipientPhone = '',
    this.accessNotes = '',
  });

  @override
  State<SearchResultsScreen> createState() => _SearchResultsScreenState();
}

class _SearchResultsScreenState extends State<SearchResultsScreen> {
  bool _loading = true;
  List<dynamic> _providers = [];
  String? _error;

  // Discovery / connection-fee paywall.
  bool _unlocked = false;
  bool _payInFlight = false;
  int? _discoveryPaymentId;
  String? _payError;

  bool get _feeEnabled => RemoteConfigService.instance.connectionFeeEnabled;
  int get _feeAmount => RemoteConfigService.instance.connectionFeeKes;

  double get _safeLat => widget.lat == 0.0 ? AppConfig.fallbackLat : widget.lat;
  double get _safeLng => widget.lng == 0.0 ? AppConfig.fallbackLng : widget.lng;

  @override
  void initState() {
    super.initState();
    // When the connection fee is disabled, the screen behaves as if the
    // paywall has already been cleared.
    _unlocked = !_feeEnabled;
    // Trigger a fresh config pull so a server-side flip applies on next use.
    RemoteConfigService.instance.refresh().then((cfg) {
      if (!mounted) return;
      setState(() {
        if (!cfg.connectionFeeEnabled) _unlocked = true;
      });
    });
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await ApiClient.instance.dio.post(
        '/ai/match-providers/',
        data: {
          'description': widget.query,
          'lat': _safeLat,
          'lng': _safeLng,
          if (widget.categoryId != null) 'category': widget.categoryId,
          if (widget.categoryId != null) 'category_id': widget.categoryId,
          if (widget.categoryName != null) 'category_name': widget.categoryName,
          if (widget.budgetMin != null) 'budget_min': widget.budgetMin,
          if (widget.budgetMax != null) 'budget_max': widget.budgetMax,
          if (widget.priority != null) 'priority': widget.priority,
          'price_preference': 'standard',
          'urgency': 'normal',
        },
      );

      final raw = response.data;
      List<dynamic> options = [];

      if (raw is Map) {
        options = raw['options'] as List<dynamic>? ?? [];
      } else if (raw is List) {
        options = raw;
      }

      if (!mounted) return;

      setState(() {
        _providers = options;
      });
    } on DioException catch (e) {
      if (!mounted) return;

      setState(() {
        _error = ApiClient.messageFrom(
          e,
          fallback: 'Failed to load providers',
        );
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _error = 'Failed to load providers: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _requestProvider(Map<String, dynamic> provider) async {
    try {
      final jobId = await _createJob(provider);
      if (!mounted || jobId == null) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Request sent — your provider has been notified.')),
      );
      // Prefer go over push so we don't stack on a torn-down location route.
      context.go('/jobs/$jobId');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not open the job: $e')),
      );
    }
  }

  /// Creates the job on the backend and returns its id, or null on failure
  /// (after surfacing a snackbar). Does NOT navigate — the caller handles that.
  Future<int?> _createJob(
    Map<String, dynamic> provider,
  ) async {
    final providerRef = provider['id'] ?? provider['user_id'] ?? provider['provider_id'];
    if (providerRef == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Provider information is incomplete')),
      );
      return null;
    }

    try {
      final predictedPrice = provider['predicted_price'];
      final category = provider['category'] ??
          provider['category_id'] ??
          widget.categoryId ??
          widget.categoryName;
      if (category == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Missing service category for this request')),
          );
        }
        return null;
      }

      final response = await ApiClient.instance.dio.post(
        '/services/jobs/',
        data: {
          'provider': providerRef,
          'category': category,
          'description': widget.query,
          'client_price_preference': 'standard',

          if (widget.budgetMin != null) 'budget_min': widget.budgetMin,

          if (widget.budgetMax != null) 'budget_max': widget.budgetMax,

          if (widget.priority != null) 'client_priority': widget.priority,

          'location_lat': _safeLat,
          'location_lng': _safeLng,
          'formatted_address': widget.formattedAddress,
          'address_text': widget.formattedAddress,
          if (widget.placeId != null && widget.placeId!.isNotEmpty)
            'place_id': widget.placeId,
          'recipient_name': widget.recipientName,
          'recipient_phone': widget.recipientPhone,
          'access_notes': widget.accessNotes,

          if (predictedPrice != null)
            'quoted_price': int.tryParse(predictedPrice.toString()),

          // Tells the backend the customer already paid the connection fee
          // for this search session, so the resulting job will be marked
          // is_paid=true automatically.
          if (_discoveryPaymentId != null)
            'discovery_payment_id': _discoveryPaymentId,
        },
      );

      final job = response.data as Map<String, dynamic>;
      final jobId = job['id'];
      return jobId is int ? jobId : int.tryParse(jobId.toString());
    } on DioException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              ApiClient.messageFrom(e, fallback: 'Failed to create request'),
            ),
          ),
        );
      }
      return null;
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create request: $e')),
        );
      }
      return null;
    }
  }

  Future<void> _payAndUnlock() async {
    // If the connection fee is currently disabled (server flag), unlock
    // immediately without ever showing the M-Pesa prompt.
    if (!_feeEnabled) {
      setState(() => _unlocked = true);
      return;
    }

    final initialPhone = AuthService.instance.phoneNumber ?? '';
    final phone = await _promptForPhone(initialPhone);
    if (phone == null) return;

    setState(() {
      _payInFlight = true;
      _payError = null;
    });

    try {
      final init = await DiscoveryPaymentService.instance.initiate(
        phoneNumber: phone,
        amount: _feeAmount,
        categoryId: widget.categoryId,
        lat: _safeLat,
        lng: _safeLng,
        query: widget.query,
        providerCount: _providers.length,
      );

      final discoveryId = init['id'];
      if (discoveryId is! int) {
        throw 'Could not start STK push.';
      }
      _discoveryPaymentId = discoveryId;

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'STK sent — approve KES 50 on your phone to unlock providers.',
          ),
        ),
      );

      final result = await DiscoveryPaymentService.instance.waitForPayment(
        discoveryId: discoveryId,
      );

      if (!mounted) return;

      if (result != null &&
          (result['is_paid'] == true || result['status'] == 'success')) {
        setState(() {
          _unlocked = true;
          _payInFlight = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Payment confirmed — providers unlocked.'),
          ),
        );
        return;
      }

      setState(() {
        _payInFlight = false;
        _payError = result == null
            ? 'We did not receive your payment in time. Tap Pay to retry.'
            : (result['result_desc']?.toString().isNotEmpty == true
                ? result['result_desc'].toString()
                : 'Payment was not completed.');
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _payInFlight = false;
        _payError = ApiClient.messageFrom(
          e,
          fallback: 'Could not start the M-Pesa prompt.',
        );
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _payInFlight = false;
        _payError = e.toString();
      });
    }
  }

  Future<String?> _promptForPhone(String initial) {
    return Navigator.of(context).push<String?>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => _PhoneConfirmPage(initial: initial),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PremiumBackground(
        child: SafeArea(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? _ErrorState(message: _error!, onRetry: _load)
                  : _providers.isEmpty
                      ? _EmptyState(query: widget.query, onRetry: _load)
                      : CustomScrollView(
                          slivers: [
                            SliverToBoxAdapter(
                              child: _Header(
                                query: widget.query,
                                count: _providers.length,
                              ),
                            ),
                            if (!_unlocked && _feeEnabled)
                              SliverToBoxAdapter(
                                child: Padding(
                                  padding:
                                      const EdgeInsets.fromLTRB(16, 0, 16, 16),
                                  child: _DiscoveryPaywallCard(
                                    count: _providers.length,
                                    fee: _feeAmount,
                                    busy: _payInFlight,
                                    error: _payError,
                                    onPay: _payAndUnlock,
                                  ),
                                ),
                              ),
                            if (_unlocked || !_feeEnabled)
                              SliverPadding(
                                padding: EdgeInsets.fromLTRB(
                                  16,
                                  8,
                                  16,
                                  MediaQuery.of(context).padding.bottom + 24,
                                ),
                                sliver: SliverList.builder(
                                  itemCount: _providers.length,
                                  itemBuilder: (context, index) {
                                    final provider = Map<String, dynamic>.from(
                                        _providers[index] as Map);
                                    return Padding(
                                      padding:
                                          const EdgeInsets.only(bottom: 16),
                                      child: AnimatedEntrance(
                                        delay:
                                            Duration(milliseconds: index * 60),
                                        child: _ProviderCard(
                                          provider: provider,
                                          position: index + 1,
                                          locked: false,
                                          feeKes: _feeAmount,
                                          onRequest: () =>
                                              _requestProvider(provider),
                                        ),
                                      ),
                                    );
                                  },
                                ),
                              ),
                          ],
                        ),
        ),
      ),
    );
  }
}

class _DiscoveryPaywallCard extends StatelessWidget {
  const _DiscoveryPaywallCard({
    required this.count,
    required this.fee,
    required this.busy,
    required this.error,
    required this.onPay,
  });

  final int count;
  final int fee;
  final bool busy;
  final String? error;
  final VoidCallback onPay;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ModernCard(
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Container(
          decoration: const BoxDecoration(gradient: kBrandGradient),
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.18),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(
                      Icons.lock_outline_rounded,
                      color: Colors.white,
                      size: 26,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '$count provider${count == 1 ? '' : 's'} matched nearby',
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Pay the KES $fee connection fee to view profiles, '
                          'pricing and contact your match.',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: Colors.white.withOpacity(0.92),
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (error != null)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(10),
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.16),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Text(
                    error!,
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: busy ? null : onPay,
                  icon: busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: kBrandBlue,
                          ),
                        )
                      : const Icon(Icons.bolt_rounded),
                  label: Text(
                    busy
                        ? 'Waiting for M-Pesa approval…'
                        : 'Unlock with KES $fee · M-Pesa',
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: kBrandBlue,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    textStyle: const TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 14,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final String query;
  final int count;

  const _Header({
    required this.query,
    required this.count,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconButton.filledTonal(
                onPressed: () => context.pop(),
                icon: const Icon(Icons.arrow_back_rounded),
              ),
              const Spacer(),
              IconButton.filledTonal(
                onPressed: () {},
                icon: const Icon(Icons.tune_rounded),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Text(
            'Best providers near you',
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w900,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Results for "${query.trim()}"',
            style: theme.textTheme.bodyLarge?.copyWith(
              color: Colors.grey.shade700,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.88),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                const Icon(Icons.verified_rounded, color: kBrandBlue, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '$count provider${count == 1 ? '' : 's'} found based on distance, availability and ratings.',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: Colors.grey.shade700,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProviderCard extends StatelessWidget {
  final Map<String, dynamic> provider;
  final int position;
  final VoidCallback onRequest;
  final bool locked;
  final int feeKes;

  const _ProviderCard({
    required this.provider,
    required this.position,
    required this.onRequest,
    this.locked = false,
    this.feeKes = 50,
  });

  String _cleanText(dynamic value, String fallback) {
    final text = value?.toString().trim();
    if (text == null || text.isEmpty || text == 'null') return fallback;
    return text;
  }

  String _maskName(String name) {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return 'Verified provider';
    final initial = trimmed[0].toUpperCase();
    return '$initial••• (locked)';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final fullName = formatHumanLabel(
      _cleanText(provider['user_name'], 'Service Provider'),
    );
    final name = locked ? _maskName(fullName) : fullName;
    final tier = formatHumanLabel(_cleanText(provider['tier'], 'bronze')).toUpperCase();
    final rating = _cleanText(provider['rating_avg'], '0');
    final jobs = _cleanText(provider['total_jobs_completed'], '0');
    final distance = _cleanText(provider['distance_km'], '-');
    final priceMin = _cleanText(provider['price_min'], '-');
    final priceMax = _cleanText(provider['price_max'], '-');
    final predictedPrice = provider['predicted_price']?.toString();

    final rawReason = _cleanText(
      provider['ai_reason'],
      'Recommended based on availability, distance, pricing and customer ratings.',
    );

    final reason = rawReason
        .replaceAll('AI matched', 'Recommended')
        .replaceAll('AI selected', 'Recommended')
        .replaceAll('AI predicted', 'Estimated')
        .replaceAll('AI', '')
        .replaceAll('  ', ' ')
        .trim();

    Color badgeColor;

    switch (tier.toLowerCase()) {
      case 'platinum':
        badgeColor = Colors.lightBlue.shade100;
        break;
      case 'gold':
        badgeColor = Colors.amber.shade100;
        break;
      case 'silver':
        badgeColor = Colors.grey.shade300;
        break;
      default:
        badgeColor = Colors.blueGrey.shade100;
    }

    return ModernCard(
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Container(
          color: Colors.white,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      kBrandBlue.withOpacity(0.10),
                      Colors.white,
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: kBrandBlue.withOpacity(0.12),
                      child: Text(
                        name.isNotEmpty ? name[0].toUpperCase() : 'P',
                        style: const TextStyle(
                          color: kBrandBlue,
                          fontWeight: FontWeight.bold,
                          fontSize: 20,
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            name,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Icon(
                                Icons.star_rounded,
                                color: Colors.amber.shade700,
                                size: 18,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                rating,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  '$jobs completed jobs',
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: Colors.grey.shade600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Column(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: badgeColor,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            tier,
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 10,
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '#$position',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: Colors.grey.shade500,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      reason,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        height: 1.4,
                        color: Colors.grey.shade800,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: _InfoChip(
                            icon: Icons.location_on_rounded,
                            title: 'Distance',
                            value: '${distance}km',
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _InfoChip(
                            icon: Icons.payments_rounded,
                            title: 'Estimate',
                            value: predictedPrice == null
                                ? 'KSh $priceMin - $priceMax'
                                : 'KSh $predictedPrice',
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: _InfoChip(
                            icon: Icons.price_check_rounded,
                            title: 'Range',
                            value: 'KSh $priceMin - $priceMax',
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _InfoChip(
                            icon: Icons.verified_rounded,
                            title: 'Status',
                            value: _cleanText(
                                provider['current_status'], 'Available'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton.icon(
                        onPressed: onRequest,
                        icon: Icon(
                          locked
                              ? Icons.lock_outline_rounded
                              : Icons.send_rounded,
                          size: 18,
                        ),
                        label: Text(
                          locked
                              ? 'Pay KES $feeKes to unlock'
                              : 'Request this provider',
                        ),
                        style: ElevatedButton.styleFrom(
                          elevation: 0,
                          backgroundColor:
                              locked ? Colors.grey.shade400 : kBrandBlue,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(18),
                          ),
                          textStyle: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;

  const _InfoChip({
    required this.icon,
    required this.title,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF6F8FB),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: kBrandBlue),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: Colors.grey.shade600,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({
    required this.message,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: ModernCard(
          padding: const EdgeInsets.all(22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.wifi_off_rounded,
                  size: 44, color: Colors.red.shade400),
              const SizedBox(height: 14),
              Text(
                message,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: onRetry,
                child: const Text('Try again'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _IssueDescriptionPage extends StatefulWidget {
  const _IssueDescriptionPage({
    required this.providerName,
    required this.onSubmit,
  });

  final String providerName;

  /// Creates the job and returns its id (or null on failure). Runs while this
  /// page shows a live "Sending…" state, then we pop with the id.
  final Future<int?> Function(String description) onSubmit;

  @override
  State<_IssueDescriptionPage> createState() => _IssueDescriptionPageState();
}

class _IssueDescriptionPageState extends State<_IssueDescriptionPage> {
  late final TextEditingController _controller;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_sending) return;
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() => _sending = true);

    final jobId = await widget.onSubmit(_controller.text);
    if (!mounted) return;

    if (jobId != null) {
      Navigator.of(context).pop(jobId);
    } else {
      // Failed — re-enable the button so the customer can retry.
      setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return PopScope(
      // Block accidental back-swipe while the request is in flight.
      canPop: !_sending,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Describe the issue'),
          leading: IconButton(
            icon: const Icon(Icons.close_rounded),
            onPressed: _sending ? null : () => Navigator.of(context).pop(),
          ),
        ),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(20, 8, 20, 16 + bottomInset),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Help ${widget.providerName} prepare',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: kBrandNavy,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Add a few details about your problem. This is optional, but it helps the provider arrive ready.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: Colors.grey.shade600,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _controller,
                  enabled: !_sending,
                  minLines: 5,
                  maxLines: 8,
                  maxLength: 2000,
                  textInputAction: TextInputAction.newline,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    hintText: 'e.g. Kitchen sink is leaking under the cabinet.',
                    alignLabelWithHint: true,
                  ),
                ),
                const SizedBox(height: 28),
                if (_sending) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 18),
                    decoration: BoxDecoration(
                      color: kBrandBlue.withOpacity(0.06),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      children: [
                        const SizedBox(
                          height: 26,
                          width: 26,
                          child: CircularProgressIndicator(strokeWidth: 3),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          'Sending your request to ${widget.providerName}…',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: kBrandNavy,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Notifying them and setting up tracking.',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: Colors.grey.shade600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ] else ...[
                  ElevatedButton.icon(
                    onPressed: _send,
                    icon: const Icon(Icons.send_rounded, size: 18),
                    label: const Text('Send request'),
                  ),
                  TextButton(
                    onPressed: _send,
                    child: const Text('Skip & send without details'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PhoneConfirmPage extends StatefulWidget {
  const _PhoneConfirmPage({required this.initial});

  final String initial;

  @override
  State<_PhoneConfirmPage> createState() => _PhoneConfirmPageState();
}

class _PhoneConfirmPageState extends State<_PhoneConfirmPage> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initial);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    var phone = _controller.text.trim().replaceAll(RegExp(r'[\s+\-]'), '');
    if (phone.startsWith('0') && phone.length >= 10) {
      phone = '254${phone.substring(1)}';
    }
    if (phone.length < 12 || !phone.startsWith('254')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid M-Pesa number')),
      );
      return;
    }
    Navigator.of(context).pop(phone);
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Confirm M-Pesa number'),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(20, 8, 20, 16 + bottomInset),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'We will send an STK prompt for KES ${AppConfig.connectionFeeKes} '
                'to unlock the matched provider profiles.',
                style: TextStyle(
                  color: Colors.grey.shade600,
                  fontSize: 14,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 20),
              TextField(
                controller: _controller,
                keyboardType: TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9+\- ]')),
                ],
                decoration: const InputDecoration(
                  labelText: 'Phone number',
                  prefixIcon: Icon(Icons.phone_android_outlined),
                  helperText: '0712345678 or 254712345678',
                ),
              ),
              const SizedBox(height: 28),
              ElevatedButton(
                onPressed: _submit,
                child: Text('Send STK · KES ${AppConfig.connectionFeeKes}'),
              ),
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Cancel'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final String query;
  final VoidCallback onRetry;

  const _EmptyState({
    required this.query,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: ModernCard(
          padding: const EdgeInsets.all(22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.search_off_rounded,
                  size: 44, color: Colors.grey.shade500),
              const SizedBox(height: 14),
              Text(
                'No providers found',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                'We could not find providers for "$query" right now.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Colors.grey.shade700,
                      height: 1.35,
                    ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: onRetry,
                child: const Text('Search again'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
