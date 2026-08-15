import 'package:flutter/material.dart';

import '../api/dio_client.dart';
import '../widgets/modern_ui.dart';

class ProviderAnalyticsScreen extends StatefulWidget {
  const ProviderAnalyticsScreen({super.key});

  @override
  State<ProviderAnalyticsScreen> createState() => _ProviderAnalyticsScreenState();
}

class _ProviderAnalyticsScreenState extends State<ProviderAnalyticsScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final resp = await ApiClient.instance.dio.get('/services/providers/me/analytics/');
      setState(() {
        _data = resp.data as Map<String, dynamic>;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load analytics';
      });
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('My analytics')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _data?['user_name'] ?? 'Provider',
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 16),
                      if ((_data?['total_jobs_completed'] ?? 0) == 0)
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          margin: const EdgeInsets.only(bottom: 16),
                          decoration: BoxDecoration(
                            color: kBrandBlue.withOpacity(0.06),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            'Once you start completing jobs, we’ll show your real ratings, tier and performance here.',
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(color: Colors.grey.shade700),
                          ),
                        ),
                      Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                          _metricCard(
                            context,
                            label: 'Tier',
                            value: (_data?['tier'] ?? '-').toString(),
                            icon: Icons.military_tech_outlined,
                          ),
                          _metricCard(
                            context,
                            label: 'Avg rating',
                            value: _data?['rating_avg']?.toStringAsFixed(1) ??
                                _data?['rating_avg'].toString() ??
                                '-',
                            icon: Icons.star_rate_rounded,
                          ),
                          _metricCard(
                            context,
                            label: 'Ratings',
                            value: _data?['rating_count']?.toString() ?? '-',
                            icon: Icons.reviews_outlined,
                          ),
                          _metricCard(
                            context,
                            label: 'Jobs done',
                            value:
                                _data?['total_jobs_completed']?.toString() ??
                                    '-',
                            icon: Icons.work_outline,
                          ),
                          _metricCard(
                            context,
                            label: 'Radius (km)',
                            value:
                                _data?['service_radius_km']?.toString() ?? '-',
                            icon: Icons.place_outlined,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
    );
  }

  Widget _metricCard(
    BuildContext context, {
    required String label,
    required String value,
    required IconData icon,
  }) {
    return SizedBox(
      width: (MediaQuery.of(context).size.width - 16 * 2 - 12) / 2,
      child: Card(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
        ),
        elevation: 1,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: kBrandBlue),
              const SizedBox(height: 10),
              Text(
                label,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.grey.shade600,
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                value,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _statRow(String label, String? value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label),
          Text(value ?? '-', style: const TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}

