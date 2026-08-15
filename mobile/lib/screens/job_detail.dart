import 'dart:async';

import 'package:firebase_database/firebase_database.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:go_router/go_router.dart';

import '../api/dio_client.dart';
import '../config/app_config.dart';
import '../services/auth_service.dart';
import '../widgets/bolt_live_map.dart';
import '../widgets/job_rating_card.dart';
import '../widgets/modern_ui.dart';
import '../widgets/mpesa_payment_card.dart';

class JobDetailScreen extends StatefulWidget {
  final int jobId;

  const JobDetailScreen({
    super.key,
    required this.jobId,
  });

  @override
  State<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends State<JobDetailScreen> {
  Map<String, dynamic>? _job;
  String? _error;
  bool _loading = true;
  bool _alreadyRated = false;
  bool _checkingRating = false;

  GoogleMapController? _mapController;
  StreamSubscription<DatabaseEvent>? _firebaseSub;

  LatLng? _providerPosition;
  LatLng? _customerPosition;
  DateTime? _lastLocationUpdate;

  static const _defaultCenter = LatLng(-1.286389, 36.817223);

  @override
  void initState() {
    super.initState();
    _loadJob();
  }

  @override
  void dispose() {
    _firebaseSub?.cancel();
    _mapController?.dispose();
    super.dispose();
  }

  Future<void> _loadJob() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await ApiClient.instance.dio.get(
        '/services/jobs/${widget.jobId}/',
      );

      final job = Map<String, dynamic>.from(response.data as Map);

      final customerLat = (job['location_lat'] as num?)?.toDouble();
      final customerLng = (job['location_lng'] as num?)?.toDouble();

      final latest = job['latest_location'] is Map
          ? Map<String, dynamic>.from(job['latest_location'] as Map)
          : null;

      final latestLat = (latest?['lat'] as num?)?.toDouble();
      final latestLng = (latest?['lng'] as num?)?.toDouble();

      setState(() {
        _job = job;

        if (customerLat != null && customerLng != null) {
          _customerPosition = LatLng(customerLat, customerLng);
        }

        if (latestLat != null && latestLng != null) {
          _providerPosition = LatLng(latestLat, latestLng);
        }
      });

      _subscribeToProviderLocation();
      await _checkExistingRating();
    } catch (_) {
      setState(() {
        _error = 'Failed to load this order.';
      });
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _checkExistingRating() async {
    if ((_job?['status'] ?? '') != 'completed') return;

    setState(() => _checkingRating = true);

    try {
      final response = await ApiClient.instance.dio.get('/services/ratings/');
      final list = response.data as List<dynamic>;

      final rated = list.any((item) {
        final map = item as Map;
        return map['job'] == widget.jobId;
      });

      if (mounted) setState(() => _alreadyRated = rated);
    } catch (_) {
      // Rating check is optional UI polish.
    } finally {
      if (mounted) setState(() => _checkingRating = false);
    }
  }

  void _subscribeToProviderLocation() {
    _firebaseSub?.cancel();

    final status = (_job?['status'] ?? '').toString();
    final isPaid = _job?['is_paid'] == true;

    if (status != 'in_progress' || !isPaid) return;

    final ref = FirebaseDatabase.instance.ref(
      'jobs/${widget.jobId}/provider_location',
    );

    _firebaseSub = ref.onValue.listen((event) {
      final value = event.snapshot.value;

      if (value is! Map) return;

      final data = Map<dynamic, dynamic>.from(value);

      final latRaw = data['latitude'];
      final lngRaw = data['longitude'];

      if (latRaw == null || lngRaw == null) return;

      final lat = (latRaw as num).toDouble();
      final lng = (lngRaw as num).toDouble();

      final position = LatLng(lat, lng);

      setState(() {
        _providerPosition = position;
        _lastLocationUpdate = DateTime.now();
      });

      _mapController?.animateCamera(
        CameraUpdate.newLatLng(position),
      );
    });
  }

  double? get _distanceKm {
    if (_providerPosition == null || _customerPosition == null) return null;

    final meters = Geolocator.distanceBetween(
      _providerPosition!.latitude,
      _providerPosition!.longitude,
      _customerPosition!.latitude,
      _customerPosition!.longitude,
    );

    return meters / 1000;
  }

  int? get _etaMinutes {
    final distance = _distanceKm;

    if (distance == null) return null;

    const averageUrbanSpeedKmh = 25.0;
    final hours = distance / averageUrbanSpeedKmh;

    return (hours * 60).ceil().clamp(1, 999);
  }

  String _statusLabel(String raw) {
    switch (raw) {
      case 'pending_provider':
        return 'Waiting for provider';
      case 'accepted':
        return 'Provider accepted';
      case 'in_progress':
        return 'Provider on the way';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return raw.replaceAll('_', ' ');
    }
  }

  Color _statusColor(String raw) {
    switch (raw) {
      case 'completed':
        return kStatusSuccess;
      case 'accepted':
      case 'in_progress':
        return kStatusInfo;
      case 'cancelled':
        return kStatusDanger;
      default:
        return kStatusWarning;
    }
  }

  String _formatPrice(dynamic value) {
    if (value == null) return 'Quote pending';

    final number = int.tryParse(value.toString());

    if (number == null) return 'Quote pending';

    return 'KSh $number';
  }

  bool get _showPayment {
    final status = (_job?['status'] ?? '').toString();
    return status == 'accepted' && _job?['is_paid'] != true;
  }

  bool get _showTracking {
    final status = (_job?['status'] ?? '').toString();
    return status == 'in_progress' && _job?['is_paid'] == true;
  }

  bool get _showRating {
    final status = (_job?['status'] ?? '').toString();
    return status == 'completed' && !_alreadyRated && !_checkingRating;
  }

  @override
  Widget build(BuildContext context) {
    final status = (_job?['status'] ?? '').toString();
    final statusColor = _statusColor(status);

    final distance = _distanceKm;
    final eta = _etaMinutes;
    final providerName = (_job?['provider_name'] ?? 'your provider').toString();

    return Scaffold(
      appBar: AppBar(
        title: Text('Request #${widget.jobId}'),
        actions: [
          IconButton(
            onPressed: _loadJob,
            icon: const Icon(Icons.refresh_rounded),
          ),
          IconButton(
            onPressed: () => context.push('/complaints?job_id=${widget.jobId}'),
            icon: const Icon(Icons.report_problem_outlined),
            tooltip: 'Report an issue',
          ),
        ],
      ),
      body: PremiumBackground(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.error_outline,
                            size: 40,
                            color: Colors.redAccent,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            _error!,
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 12),
                          ElevatedButton(
                            onPressed: _loadJob,
                            child: const Text('Try again'),
                          ),
                        ],
                      ),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _loadJob,
                    child: ListView(
                      // Clear the system navigation bar so the last card /
                      // button isn't hidden behind it.
                      padding: EdgeInsets.only(
                        bottom: MediaQuery.of(context).padding.bottom + 24,
                      ),
                      children: [
                        if (status == 'pending_provider')
                          Padding(
                            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                            child: _StatusBanner(
                              icon: Icons.hourglass_top_rounded,
                              title: 'Waiting for provider',
                              message:
                                  'Your request was sent. You will be prompted to pay once the provider accepts.',
                              color: kStatusWarning,
                            ),
                          ),
                        if (_showPayment)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                            child: MpesaPaymentCard(
                              jobId: widget.jobId,
                              initialPhone: AuthService.instance.phoneNumber ??
                                  AuthService.instance.username,
                              onPaid: _loadJob,
                            ),
                          ),
                        if (_showRating)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                            child: JobRatingCard(
                              jobId: widget.jobId,
                              providerName: providerName,
                              onRated: () =>
                                  setState(() => _alreadyRated = true),
                            ),
                          ),
                        if (_showTracking)
                          SizedBox(
                            height: 360,
                            child: AppConfig.enableGoogleMaps
                                ? BoltLiveMap(
                                    providerPosition: _providerPosition,
                                    customerPosition: _customerPosition,
                                    followProvider: true,
                                    onMapCreated: (controller) {
                                      _mapController = controller;
                                    },
                                  )
                                : _TrackingFallbackCard(
                                    providerPosition: _providerPosition,
                                    customerPosition: _customerPosition,
                                    lastLocationUpdate: _lastLocationUpdate,
                                  ),
                          )
                        else if (!_showPayment && !_showRating)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                            child: _TrackingFallbackCard(
                              providerPosition: _providerPosition,
                              customerPosition: _customerPosition,
                              lastLocationUpdate: _lastLocationUpdate,
                            ),
                          ),
                        Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              AnimatedEntrance(
                                child: _JobSummaryCard(
                                  job: _job ?? {},
                                  statusColor: statusColor,
                                  statusLabel: _statusLabel(status),
                                ),
                              ),
                              const SizedBox(height: 16),
                              if (_showTracking)
                                _DetailSection(
                                  title: 'Live tracking',
                                  children: [
                                    _DetailRow(
                                      icon: Icons.navigation_outlined,
                                      label: 'Tracking status',
                                      value: _providerPosition == null
                                          ? 'Waiting for provider location'
                                          : 'Provider location is live',
                                    ),
                                    _DetailRow(
                                      icon: Icons.route_outlined,
                                      label: 'Distance',
                                      value: distance == null
                                          ? 'Waiting...'
                                          : '${distance.toStringAsFixed(2)} km',
                                    ),
                                    _DetailRow(
                                      icon: Icons.timer_outlined,
                                      label: 'ETA',
                                      value: eta == null
                                          ? 'Waiting...'
                                          : 'About $eta minutes',
                                    ),
                                    _DetailRow(
                                      icon: Icons.access_time,
                                      label: 'Last update',
                                      value: _lastLocationUpdate == null
                                          ? 'No live update yet'
                                          : _lastLocationUpdate!
                                              .toLocal()
                                              .toString(),
                                    ),
                                  ],
                                ),
                              if (_showTracking) const SizedBox(height: 16),
                              _DetailSection(
                                title: 'Service details',
                                children: [
                                  _DetailRow(
                                    icon: Icons.home_repair_service_outlined,
                                    label: 'Service',
                                    value: (_job?['category_name'] ??
                                            'Selected service')
                                        .toString(),
                                  ),
                                  _DetailRow(
                                    icon: Icons.person_outline,
                                    label: 'Provider',
                                    value: (_job?['provider_name'] ??
                                            'Being matched')
                                        .toString(),
                                  ),
                                  _DetailRow(
                                    icon: Icons.payments_outlined,
                                    label: 'Quote',
                                    value: _formatPrice(_job?['quoted_price']),
                                  ),
                                  _DetailRow(
                                    icon: Icons.verified_outlined,
                                    label: 'Payment',
                                    value: _job?['is_paid'] == true
                                        ? 'Paid (KES ${AppConfig.connectionFeeKes})'
                                        : 'Pending M-Pesa',
                                  ),
                                  _DetailRow(
                                    icon: Icons.place_outlined,
                                    label: 'Location',
                                    value: (_job?['address_text'] ?? 'Nairobi')
                                        .toString(),
                                  ),
                                ],
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

class _JobSummaryCard extends StatelessWidget {
  final Map<String, dynamic> job;
  final Color statusColor;
  final String statusLabel;

  const _JobSummaryCard({
    required this.job,
    required this.statusColor,
    required this.statusLabel,
  });

  @override
  Widget build(BuildContext context) {
    final description = (job['description'] ?? 'Service request').toString();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Issue',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: Colors.grey.shade600,
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  description,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        height: 1.35,
                      ),
                ),
              ),
              const SizedBox(width: 12),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.10),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  statusLabel,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'This page updates automatically once the provider starts live tracking.',
            style: TextStyle(
              color: Colors.grey.shade700,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailSection extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _DetailSection({
    required this.title,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 10),
          ...children,
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            icon,
            size: 18,
            color: kBrandBlue,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: Colors.grey.shade600,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({
    required this.icon,
    required this.title,
    required this.message,
    required this.color,
  });

  final IconData icon;
  final String title;
  final String message;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withOpacity(0.10),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: color.withOpacity(0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(message),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TrackingFallbackCard extends StatelessWidget {
  final LatLng? providerPosition;
  final LatLng? customerPosition;
  final DateTime? lastLocationUpdate;

  const _TrackingFallbackCard({
    required this.providerPosition,
    required this.customerPosition,
    required this.lastLocationUpdate,
  });

  @override
  Widget build(BuildContext context) {
    final hasLocation = providerPosition != null;

    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF6FF),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFBFDBFE)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(
                Icons.location_on_rounded,
                color: Color(0xFF2563EB),
              ),
              SizedBox(width: 8),
              Text(
                'Live tracking',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 18,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            hasLocation
                ? 'Provider location is being received.'
                : 'Tracking will appear here once the provider starts moving.',
          ),
          const SizedBox(height: 12),
          if (providerPosition != null) ...[
            Text(
              'Provider: ${providerPosition!.latitude.toStringAsFixed(6)}, '
              '${providerPosition!.longitude.toStringAsFixed(6)}',
            ),
          ],
          if (customerPosition != null) ...[
            const SizedBox(height: 6),
            Text(
              'Client: ${customerPosition!.latitude.toStringAsFixed(6)}, '
              '${customerPosition!.longitude.toStringAsFixed(6)}',
            ),
          ],
          if (lastLocationUpdate != null) ...[
            const SizedBox(height: 6),
            Text('Last update: ${lastLocationUpdate!.toLocal()}'),
          ],
        ],
      ),
    );
  }
}
