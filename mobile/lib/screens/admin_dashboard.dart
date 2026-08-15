import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../api/dio_client.dart';
import '../config/app_config.dart';
import '../services/auth_service.dart';
import '../widgets/modern_ui.dart';
import '../utils/format_label.dart';

/// Admin-only mobile dashboard backed by:
///  - GET /services/admin/monitor/providers/live/
///  - GET /services/providers/admin/
class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;

  bool _loadingLive = true;
  bool _loadingProviders = true;
  String? _error;

  List<Map<String, dynamic>> _live = [];
  List<Map<String, dynamic>> _providers = [];

  Timer? _polling;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 2, vsync: this);
    _refresh();
    _polling = Timer.periodic(
      const Duration(seconds: 20),
      (_) => _loadLive(silent: true),
    );
  }

  @override
  void dispose() {
    _polling?.cancel();
    _tab.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    await Future.wait([_loadLive(), _loadProviders()]);
  }

  Future<void> _loadLive({bool silent = false}) async {
    if (!silent && mounted) setState(() => _loadingLive = true);
    try {
      final response = await ApiClient.instance.dio.get(
        '/services/admin/monitor/providers/live/',
      );
      final data = Map<String, dynamic>.from(response.data as Map);
      final list = (data['providers'] as List<dynamic>? ?? const [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      if (!mounted) return;
      setState(() {
        _live = list;
        _error = null;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.response?.statusCode == 403
            ? 'Admin access required'
            : ApiClient.messageFrom(e, fallback: 'Failed to load live data');
      });
    } finally {
      if (mounted) setState(() => _loadingLive = false);
    }
  }

  Future<void> _loadProviders() async {
    if (mounted) setState(() => _loadingProviders = true);
    try {
      final response = await ApiClient.instance.dio.get(
        '/services/providers/admin/',
      );
      final raw = response.data;
      final list = raw is List
          ? raw
          : raw is Map && raw['results'] is List
              ? raw['results'] as List
              : <dynamic>[];
      if (!mounted) return;
      setState(() {
        _providers = list
            .map<Map<String, dynamic>>(
                (e) => Map<String, dynamic>.from(e as Map))
            .toList();
      });
    } on DioException catch (_) {
      // Ignored — _loadLive will surface a top-level error if 403.
    } finally {
      if (mounted) setState(() => _loadingProviders = false);
    }
  }

  Future<void> _logout() async {
    await AuthService.instance.logout();
    if (!mounted) return;
    context.go('/welcome');
  }

  int get _activeCount => _live.where((p) {
        final job = p['active_job'];
        return job is Map && (job['status'] == 'in_progress' ||
            job['status'] == 'accepted');
      }).length;

  int get _onlineCount => _live
      .where((p) => p['status'] == 'available' || p['status'] == 'busy')
      .length;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin · S-Link'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _refresh,
            icon: const Icon(Icons.refresh_rounded),
          ),
          IconButton(
            tooltip: 'Logout',
            onPressed: _logout,
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
        bottom: TabBar(
          controller: _tab,
          indicatorColor: Colors.white,
          tabs: const [
            Tab(icon: Icon(Icons.location_on_outlined), text: 'Live map'),
            Tab(icon: Icon(Icons.groups_outlined), text: 'Providers'),
          ],
        ),
      ),
      body: PremiumBackground(
        child: SafeArea(
          top: false,
          child: TabBarView(
            controller: _tab,
            children: [
              _buildLiveTab(),
              _buildProvidersTab(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLiveTab() {
    if (_loadingLive && _live.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.lock_outline, size: 44, color: kStatusDanger),
              const SizedBox(height: 12),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: _refresh,
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadLive,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _StatsRow(
            total: _live.length,
            online: _onlineCount,
            active: _activeCount,
          ),
          const SizedBox(height: 16),
          if (AppConfig.enableGoogleMaps)
            _AdminLiveMap(providers: _live),
          const SizedBox(height: 16),
          if (_live.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: Text('No providers reported yet')),
            ),
          ..._live.map((p) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _LiveProviderCard(provider: p),
              )),
        ],
      ),
    );
  }

  Widget _buildProvidersTab() {
    if (_loadingProviders && _providers.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: _loadProviders,
      child: ListView.separated(
        padding: const EdgeInsets.all(20),
        itemCount: _providers.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          final p = _providers[index];
          return _ProviderRow(provider: p);
        },
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({
    required this.total,
    required this.online,
    required this.active,
  });

  final int total;
  final int online;
  final int active;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _StatTile(
            label: 'Providers',
            value: total.toString(),
            color: kBrandBlue,
            icon: Icons.engineering_rounded,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _StatTile(
            label: 'Online',
            value: online.toString(),
            color: kStatusSuccess,
            icon: Icons.signal_cellular_alt_rounded,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _StatTile(
            label: 'On a job',
            value: active.toString(),
            color: kStatusInfo,
            icon: Icons.navigation_rounded,
          ),
        ),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.label,
    required this.value,
    required this.color,
    required this.icon,
  });

  final String label;
  final String value;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return ModernCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color),
          const SizedBox(height: 8),
          Text(
            value,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w900,
            ),
          ),
          Text(
            label,
            style: TextStyle(
              color: Colors.grey.shade600,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class _AdminLiveMap extends StatefulWidget {
  const _AdminLiveMap({required this.providers});

  final List<Map<String, dynamic>> providers;

  @override
  State<_AdminLiveMap> createState() => _AdminLiveMapState();
}

class _AdminLiveMapState extends State<_AdminLiveMap> {
  GoogleMapController? _controller;

  static const _boltDarkStyle = '''
[
  {"elementType":"geometry","stylers":[{"color":"#0F172A"}]},
  {"elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"elementType":"labels.text.fill","stylers":[{"color":"#94A3B8"}]},
  {"elementType":"labels.text.stroke","stylers":[{"color":"#0F172A"}]},
  {"featureType":"administrative","elementType":"geometry","stylers":[{"visibility":"off"}]},
  {"featureType":"poi","stylers":[{"visibility":"off"}]},
  {"featureType":"road","elementType":"geometry","stylers":[{"color":"#1E293B"}]},
  {"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#334155"}]},
  {"featureType":"transit","stylers":[{"visibility":"off"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#0B1220"}]}
]
''';

  Set<Marker> get _markers {
    final markers = <Marker>{};
    for (final p in widget.providers) {
      final lat = (p['lat'] as num?)?.toDouble();
      final lng = (p['lng'] as num?)?.toDouble();
      if (lat == null || lng == null) continue;
      double hue;
      switch (p['status']) {
        case 'available':
          hue = BitmapDescriptor.hueGreen;
          break;
        case 'busy':
          hue = BitmapDescriptor.hueOrange;
          break;
        default:
          hue = BitmapDescriptor.hueRed;
      }
      markers.add(
        Marker(
          markerId: MarkerId('p-${p['provider_id']}'),
          position: LatLng(lat, lng),
          icon: BitmapDescriptor.defaultMarkerWithHue(hue),
          infoWindow: InfoWindow(
            title: (p['name'] ?? 'Provider').toString(),
            snippet: '${p['category'] ?? ''} · ${p['status'] ?? ''}',
          ),
        ),
      );
    }
    return markers;
  }

  void _fitBounds() {
    if (_controller == null || widget.providers.isEmpty) return;
    final points = widget.providers
        .where((p) => p['lat'] != null && p['lng'] != null)
        .map((p) => LatLng(
              (p['lat'] as num).toDouble(),
              (p['lng'] as num).toDouble(),
            ))
        .toList();
    if (points.isEmpty) return;
    if (points.length == 1) {
      _controller!.animateCamera(CameraUpdate.newLatLngZoom(points.first, 14));
      return;
    }
    var minLat = points.first.latitude;
    var maxLat = points.first.latitude;
    var minLng = points.first.longitude;
    var maxLng = points.first.longitude;
    for (final p in points) {
      minLat = p.latitude < minLat ? p.latitude : minLat;
      maxLat = p.latitude > maxLat ? p.latitude : maxLat;
      minLng = p.longitude < minLng ? p.longitude : minLng;
      maxLng = p.longitude > maxLng ? p.longitude : maxLng;
    }
    _controller!.animateCamera(
      CameraUpdate.newLatLngBounds(
        LatLngBounds(
          southwest: LatLng(minLat, minLng),
          northeast: LatLng(maxLat, maxLng),
        ),
        60,
      ),
    );
  }

  @override
  void didUpdateWidget(covariant _AdminLiveMap old) {
    super.didUpdateWidget(old);
    WidgetsBinding.instance.addPostFrameCallback((_) => _fitBounds());
  }

  @override
  Widget build(BuildContext context) {
    final fallback = LatLng(AppConfig.fallbackLat, AppConfig.fallbackLng);
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: SizedBox(
        height: 320,
        child: GoogleMap(
          initialCameraPosition: CameraPosition(target: fallback, zoom: 11),
          markers: _markers,
          onMapCreated: (c) {
            _controller = c;
            c.setMapStyle(_boltDarkStyle);
            WidgetsBinding.instance.addPostFrameCallback((_) => _fitBounds());
          },
          myLocationButtonEnabled: false,
          zoomControlsEnabled: false,
          compassEnabled: false,
          mapToolbarEnabled: false,
        ),
      ),
    );
  }
}

class _LiveProviderCard extends StatelessWidget {
  const _LiveProviderCard({required this.provider});

  final Map<String, dynamic> provider;

  Color _statusColor(String status) {
    switch (status) {
      case 'available':
        return kStatusSuccess;
      case 'busy':
        return kStatusInfo;
      case 'offline':
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = provider['name']?.toString() ?? 'Provider';
    final category = provider['category']?.toString() ?? '-';
    final status = provider['status']?.toString() ?? 'offline';
    final tier = provider['tier']?.toString() ?? 'bronze';
    final rating = provider['rating_avg']?.toString() ?? '0';
    final lat = provider['lat'];
    final lng = provider['lng'];
    final minutes = provider['minutes_since_seen'];
    final activeJob = provider['active_job'];
    final source = provider['location_source']?.toString() ?? '';

    return ModernCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: kBrandSurface,
                child: Text(
                  name.isNotEmpty ? name[0].toUpperCase() : '?',
                  style: const TextStyle(
                    color: kBrandBlueDark,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      '$category · ${tier.toUpperCase()} · ★ $rating',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: _statusColor(status).withOpacity(0.12),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(
                  status,
                  style: TextStyle(
                    color: _statusColor(status),
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _row(
            Icons.place_outlined,
            lat != null && lng != null
                ? '${(lat as num).toStringAsFixed(4)}, ${(lng as num).toStringAsFixed(4)}'
                : 'Location unknown',
          ),
          _row(
            Icons.schedule,
            minutes == null
                ? 'No live updates'
                : '$minutes min since last update',
          ),
          if (activeJob is Map) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: kBrandSurface,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(Icons.assignment_rounded,
                      color: kBrandBlue, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Job #${activeJob['id']} · ${activeJob['status']}\n'
                      '${activeJob['service']} for ${activeJob['customer']}',
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (source == 'base_location') ...[
            const SizedBox(height: 6),
            Text(
              'Showing base location (no live updates yet).',
              style: TextStyle(color: Colors.grey.shade500, fontSize: 11),
            ),
          ],
        ],
      ),
    );
  }

  Widget _row(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        children: [
          Icon(icon, size: 16, color: Colors.grey.shade600),
          const SizedBox(width: 6),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13))),
        ],
      ),
    );
  }
}

class _ProviderRow extends StatelessWidget {
  const _ProviderRow({required this.provider});

  final Map<String, dynamic> provider;

  @override
  Widget build(BuildContext context) {
    final name = formatHumanLabel(provider['user_name'] ?? 'Provider');
    final tier = formatHumanLabel(provider['tier'] ?? 'bronze');
    final rating = provider['rating_avg']?.toString() ?? '0';
    final completed = provider['total_jobs_completed']?.toString() ?? '0';
    final status = formatHumanLabel(provider['current_status'] ?? 'offline');

    return ModernCard(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: kBrandBlue.withOpacity(0.12),
            child: Text(
              name.isNotEmpty ? name[0].toUpperCase() : '?',
              style: const TextStyle(
                color: kBrandBlue,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                Text(
                  '${tier.toUpperCase()} · ★ $rating · $completed jobs · $status',
                  style: TextStyle(
                    color: Colors.grey.shade600,
                    fontSize: 12,
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
