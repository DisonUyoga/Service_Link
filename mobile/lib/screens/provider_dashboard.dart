import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/dio_client.dart';
import '../services/auth_service.dart';
import '../services/provider_heartbeat_service.dart';
import '../utils/format_label.dart';
import '../utils/provider_location_gate.dart';

class ProviderDashboardScreen extends StatefulWidget {
  const ProviderDashboardScreen({super.key});

  @override
  State<ProviderDashboardScreen> createState() =>
      _ProviderDashboardScreenState();
}

class _ProviderDashboardScreenState extends State<ProviderDashboardScreen> {
  bool _loading = true;
  bool _actionLoading = false;
  String? _error;

  List<Map<String, dynamic>> _jobs = [];
  Map<String, dynamic>? _analytics;

  int _tabIndex = 0;
  Timer? _pollingTimer;

  @override
  void initState() {
    super.initState();
    _loadDashboard();

    // Lightweight polling so provider sees new client orders without manually refreshing.
    _pollingTimer = Timer.periodic(
      const Duration(seconds: 10),
      (_) => _silentRefresh(),
    );

    // Prompt for GPS if needed, then start broadcasting live coordinates.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_ensureLiveLocationThenHeartbeat());
    });
  }

  Future<void> _ensureLiveLocationThenHeartbeat() async {
    if (!mounted) return;
    final ok = await ProviderLocationGate.ensure(
      context,
      purpose:
          'While you are on shift, S-Link needs your live location so nearby customers can match you.',
    );
    if (!mounted) return;
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Location is off or blocked. Turn it on so customers can find you nearby.',
          ),
        ),
      );
      return;
    }
    await ProviderHeartbeatService.instance.start(
      interval: const Duration(seconds: 30),
    );
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
    ProviderHeartbeatService.instance.stop();
    super.dispose();
  }

  Future<void> _loadDashboard() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await Future.wait([
        _loadJobs(),
        _loadAnalytics(),
      ]);
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _silentRefresh() async {
    if (!mounted || _actionLoading) return;

    try {
      await Future.wait([
        _loadJobs(updateLoading: false),
        _loadAnalytics(updateLoading: false),
      ]);
    } catch (_) {
      // Silent refresh should not disturb the UI.
    }
  }

  Future<void> _loadJobs({bool updateLoading = true}) async {
    try {
      final response = await ApiClient.instance.dio.get('/services/jobs/');

      final data = response.data as List<dynamic>;

      if (!mounted) return;

      setState(() {
        _jobs =
            data.map((item) => Map<String, dynamic>.from(item as Map)).toList();
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _error = 'Failed to load provider orders.';
      });
    }
  }

  Future<void> _loadAnalytics({bool updateLoading = true}) async {
    try {
      final response = await ApiClient.instance.dio.get(
        '/services/providers/me/analytics/',
      );

      if (!mounted) return;

      setState(() {
        _analytics = Map<String, dynamic>.from(response.data as Map);
      });
    } catch (_) {
      // Analytics should not block jobs from loading.
    }
  }

  List<Map<String, dynamic>> get _incomingJobs {
    return _jobs.where((job) {
      return job['status'] == 'pending_provider';
    }).toList();
  }

  List<Map<String, dynamic>> get _activeJobs {
    return _jobs.where((job) {
      return job['status'] == 'accepted' || job['status'] == 'in_progress';
    }).toList();
  }

  List<Map<String, dynamic>> get _completedJobs {
    return _jobs.where((job) {
      return job['status'] == 'completed' || job['status'] == 'cancelled';
    }).toList();
  }

  Future<void> _acceptJob(int id) async {
    await _runJobAction(
      successMessage: 'Order accepted',
      action: () => ApiClient.instance.dio.post('/services/jobs/$id/accept/'),
    );
  }

  Future<void> _declineJob(int id) async {
    await _runJobAction(
      successMessage: 'Order declined',
      action: () => ApiClient.instance.dio.post('/services/jobs/$id/decline/'),
    );
  }

  Future<void> _completeJob(int id) async {
    await _runJobAction(
      successMessage: 'Order completed',
      action: () => ApiClient.instance.dio.post('/services/jobs/$id/complete/'),
    );
  }

  Future<void> _runJobAction({
    required String successMessage,
    required Future<Response<dynamic>> Function() action,
  }) async {
    setState(() {
      _actionLoading = true;
      _error = null;
    });

    try {
      await action();
      await _loadDashboard();

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(successMessage)),
      );
    } on DioException catch (e) {
      if (!mounted) return;

      final detail = e.response?.data is Map
          ? (e.response?.data['detail']?.toString())
          : null;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(detail ?? 'Action failed. Please try again.'),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _actionLoading = false);
      }
    }
  }

  Future<void> _logout() async {
    await AuthService.instance.logout();

    if (!mounted) return;

    context.go('/welcome');
  }

  String _statusLabel(String raw) {
    switch (raw) {
      case 'pending_provider':
        return 'New request';
      case 'accepted':
        return 'Accepted';
      case 'in_progress':
        return 'In progress';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return formatHumanLabel(raw);
    }
  }

  Color _statusColor(String raw) {
    switch (raw) {
      case 'pending_provider':
        return Colors.orange.shade100;
      case 'accepted':
        return Colors.blue.shade100;
      case 'in_progress':
        return Colors.green.shade100;
      case 'completed':
        return Colors.grey.shade200;
      case 'cancelled':
        return Colors.red.shade100;
      default:
        return Colors.grey.shade200;
    }
  }

  String _money(dynamic value) {
    if (value == null) return 'Quote pending';

    final parsed = int.tryParse(value.toString());

    if (parsed == null) return 'Quote pending';

    return 'KSh $parsed';
  }

  @override
  Widget build(BuildContext context) {
    final auth = AuthService.instance;

    return Scaffold(
      appBar: AppBar(
        title: Text(auth.timeAwareGreeting),
        actions: [
          IconButton(
            onPressed: _loadDashboard,
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
          ),
          IconButton(
            onPressed: () => context.push('/complaints'),
            icon: const Icon(Icons.report_problem_outlined),
            tooltip: 'Report an issue',
          ),
          IconButton(
            onPressed: _logout,
            icon: const Icon(Icons.logout),
            tooltip: 'Logout',
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadDashboard,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _ProviderHeaderCard(
                    analytics: _analytics,
                    incomingCount: _incomingJobs.length,
                    activeCount: _activeJobs.length,
                    completedCount: _completedJobs.length,
                    onEditProfile: () => context.push('/provider-onboarding'),
                  ),
                  const SizedBox(height: 16),
                  if (_error != null)
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.shade50,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Text(
                        _error!,
                        style: TextStyle(color: Colors.red.shade800),
                      ),
                    ),
                  const SizedBox(height: 16),
                  _DashboardTabs(
                    selectedIndex: _tabIndex,
                    onChanged: (index) {
                      setState(() => _tabIndex = index);
                    },
                    incomingCount: _incomingJobs.length,
                    activeCount: _activeJobs.length,
                    historyCount: _completedJobs.length,
                  ),
                  const SizedBox(height: 16),
                  if (_tabIndex == 0)
                    _JobsSection(
                      title: 'Incoming orders',
                      emptyText:
                          'No new client requests yet. New orders assigned to you will appear here automatically.',
                      jobs: _incomingJobs,
                      statusLabel: _statusLabel,
                      statusColor: _statusColor,
                      money: _money,
                      actionLoading: _actionLoading,
                      onAccept: _acceptJob,
                      onDecline: _declineJob,
                      onTrack: (id) => context.push('/provider-jobs/$id/track'),
                      onComplete: _completeJob,
                    ),
                  if (_tabIndex == 1)
                    _JobsSection(
                      title: 'Live orders',
                      emptyText:
                          'No active orders. Accepted and in-progress jobs will appear here.',
                      jobs: _activeJobs,
                      statusLabel: _statusLabel,
                      statusColor: _statusColor,
                      money: _money,
                      actionLoading: _actionLoading,
                      onAccept: _acceptJob,
                      onDecline: _declineJob,
                      onTrack: (id) => context.push('/provider-jobs/$id/track'),
                      onComplete: _completeJob,
                    ),
                  if (_tabIndex == 2)
                    _JobsSection(
                      title: 'Order history',
                      emptyText:
                          'Completed and declined orders will appear here.',
                      jobs: _completedJobs,
                      statusLabel: _statusLabel,
                      statusColor: _statusColor,
                      money: _money,
                      actionLoading: _actionLoading,
                      onAccept: _acceptJob,
                      onDecline: _declineJob,
                      onTrack: (id) => context.push('/provider-jobs/$id/track'),
                      onComplete: _completeJob,
                    ),
                  if (_tabIndex == 3)
                    _AnalyticsSection(
                      analytics: _analytics,
                      onEditProfile: () => context.push('/provider-onboarding'),
                    ),
                ],
              ),
            ),
    );
  }
}

class _ProviderHeaderCard extends StatelessWidget {
  final Map<String, dynamic>? analytics;
  final int incomingCount;
  final int activeCount;
  final int completedCount;
  final VoidCallback onEditProfile;

  const _ProviderHeaderCard({
    required this.analytics,
    required this.incomingCount,
    required this.activeCount,
    required this.completedCount,
    required this.onEditProfile,
  });

  @override
  Widget build(BuildContext context) {
    final tier = analytics?['tier']?.toString() ?? 'bronze';
    final rating = analytics?['rating_avg']?.toString() ?? '0';
    final status = analytics?['current_status']?.toString() ?? 'offline';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Provider command center',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              'Manage new orders, live jobs, history, analytics, and your provider profile from here.',
              style: TextStyle(color: Colors.grey.shade700),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                _MetricChip(label: 'New', value: incomingCount.toString()),
                _MetricChip(label: 'Live', value: activeCount.toString()),
                _MetricChip(label: 'Done', value: completedCount.toString()),
                _MetricChip(label: 'Rating', value: rating),
                _MetricChip(label: 'Tier', value: tier),
                _MetricChip(label: 'Status', value: status),
              ],
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: onEditProfile,
              icon: const Icon(Icons.manage_accounts_outlined),
              label: const Text('Edit / reset provider profile'),
            ),
          ],
        ),
      ),
    );
  }
}

class _DashboardTabs extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onChanged;
  final int incomingCount;
  final int activeCount;
  final int historyCount;

  const _DashboardTabs({
    required this.selectedIndex,
    required this.onChanged,
    required this.incomingCount,
    required this.activeCount,
    required this.historyCount,
  });

  @override
  Widget build(BuildContext context) {
    final tabs = [
      ('Incoming', incomingCount, Icons.notifications_active_outlined),
      ('Live', activeCount, Icons.navigation_outlined),
      ('History', historyCount, Icons.history),
      ('Analytics', null, Icons.bar_chart),
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: List.generate(tabs.length, (index) {
          final selected = selectedIndex == index;
          final tab = tabs[index];

          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              selected: selected,
              avatar: Icon(
                tab.$3,
                size: 18,
                color: selected ? Colors.white : null,
              ),
              label: Text(
                tab.$2 == null ? tab.$1 : '${tab.$1} (${tab.$2})',
              ),
              onSelected: (_) => onChanged(index),
            ),
          );
        }),
      ),
    );
  }
}

class _JobsSection extends StatelessWidget {
  final String title;
  final String emptyText;
  final List<Map<String, dynamic>> jobs;
  final String Function(String raw) statusLabel;
  final Color Function(String raw) statusColor;
  final String Function(dynamic value) money;
  final bool actionLoading;
  final Future<void> Function(int id) onAccept;
  final Future<void> Function(int id) onDecline;
  final Future<void> Function(int id) onComplete;
  final void Function(int id) onTrack;

  const _JobsSection({
    required this.title,
    required this.emptyText,
    required this.jobs,
    required this.statusLabel,
    required this.statusColor,
    required this.money,
    required this.actionLoading,
    required this.onAccept,
    required this.onDecline,
    required this.onComplete,
    required this.onTrack,
  });

  @override
  Widget build(BuildContext context) {
    if (jobs.isEmpty) {
      return _EmptyState(
        title: title,
        message: emptyText,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 12),
        ...jobs.map(
          (job) => _JobCard(
            job: job,
            statusLabel: statusLabel,
            statusColor: statusColor,
            money: money,
            actionLoading: actionLoading,
            onAccept: onAccept,
            onDecline: onDecline,
            onComplete: onComplete,
            onTrack: onTrack,
          ),
        ),
      ],
    );
  }
}

class _JobCard extends StatelessWidget {
  final Map<String, dynamic> job;
  final String Function(String raw) statusLabel;
  final Color Function(String raw) statusColor;
  final String Function(dynamic value) money;
  final bool actionLoading;
  final Future<void> Function(int id) onAccept;
  final Future<void> Function(int id) onDecline;
  final Future<void> Function(int id) onComplete;
  final void Function(int id) onTrack;

  const _JobCard({
    required this.job,
    required this.statusLabel,
    required this.statusColor,
    required this.money,
    required this.actionLoading,
    required this.onAccept,
    required this.onDecline,
    required this.onComplete,
    required this.onTrack,
  });

  @override
  Widget build(BuildContext context) {
    final id = job['id'] as int;
    final status = job['status']?.toString() ?? '';
    final description = job['description']?.toString() ?? 'Order #$id';
    final category = job['category_name']?.toString() ?? 'Service';
    final customer = job['customer_name']?.toString() ?? 'Client';
    final address = job['address_text']?.toString() ?? 'No address';
    final quotedPrice = money(job['quoted_price']);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    category,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor(status),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    statusLabel(status),
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade900,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              'Customer issue',
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: Colors.grey.shade600,
                    fontWeight: FontWeight.w600,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              description,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    height: 1.35,
                  ),
            ),
            const SizedBox(height: 12),
            _InfoRow(
              icon: Icons.person_outline,
              text: customer,
            ),
            _InfoRow(
              icon: Icons.location_on_outlined,
              text: address,
            ),
            _InfoRow(
              icon: Icons.payments_outlined,
              text: quotedPrice,
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.end,
              children: [
                if (status == 'pending_provider')
                  OutlinedButton.icon(
                    onPressed: actionLoading ? null : () => onDecline(id),
                    icon: const Icon(Icons.close),
                    label: const Text('Refuse'),
                  ),
                if (status == 'pending_provider')
                  ElevatedButton.icon(
                    onPressed: actionLoading ? null : () => onAccept(id),
                    icon: const Icon(Icons.check),
                    label: const Text('Accept'),
                  ),
                if (status == 'accepted' || status == 'in_progress')
                  OutlinedButton.icon(
                    onPressed: () => onTrack(id),
                    icon: const Icon(Icons.navigation),
                    label: const Text('Track'),
                  ),
                if (status == 'in_progress')
                  ElevatedButton.icon(
                    onPressed: actionLoading ? null : () => onComplete(id),
                    icon: const Icon(Icons.flag),
                    label: const Text('Complete'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AnalyticsSection extends StatelessWidget {
  final Map<String, dynamic>? analytics;
  final VoidCallback onEditProfile;

  const _AnalyticsSection({
    required this.analytics,
    required this.onEditProfile,
  });

  @override
  Widget build(BuildContext context) {
    if (analytics == null) {
      return const _EmptyState(
        title: 'Analytics',
        message: 'Analytics are not available yet.',
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Analytics',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              children: [
                _AnalyticsRow(
                  label: 'Tier',
                  value: analytics?['tier']?.toString() ?? '-',
                ),
                _AnalyticsRow(
                  label: 'Rating',
                  value: analytics?['rating_avg']?.toString() ?? '0',
                ),
                _AnalyticsRow(
                  label: 'Rating count',
                  value: analytics?['rating_count']?.toString() ?? '0',
                ),
                _AnalyticsRow(
                  label: 'Completed jobs',
                  value: analytics?['total_jobs_completed']?.toString() ?? '0',
                ),
                _AnalyticsRow(
                  label: 'Service radius',
                  value:
                      '${analytics?['service_radius_km']?.toString() ?? '0'} km',
                ),
                _AnalyticsRow(
                  label: 'Price range',
                  value:
                      'KSh ${analytics?['price_min']} - KSh ${analytics?['price_max']}',
                ),
                _AnalyticsRow(
                  label: 'Average response',
                  value:
                      '${analytics?['average_response_minutes']?.toString() ?? '0'} min',
                ),
                _AnalyticsRow(
                  label: 'Current status',
                  value: analytics?['current_status']?.toString() ?? 'offline',
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: onEditProfile,
                  icon: const Icon(Icons.manage_accounts_outlined),
                  label: const Text('Edit provider profile'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _MetricChip extends StatelessWidget {
  final String label;
  final String value;

  const _MetricChip({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text('$label: $value'),
    );
  }
}

class _AnalyticsRow extends StatelessWidget {
  final String label;
  final String value;

  const _AnalyticsRow({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: Colors.grey.shade700),
            ),
          ),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String text;

  const _InfoRow({
    required this.icon,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Colors.grey.shade600),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(color: Colors.grey.shade700),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final String title;
  final String message;

  const _EmptyState({
    required this.title,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          children: [
            const Icon(Icons.inbox_outlined, size: 44),
            const SizedBox(height: 12),
            Text(
              title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.shade700),
            ),
          ],
        ),
      ),
    );
  }
}
