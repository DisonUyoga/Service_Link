import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/dio_client.dart';
import '../widgets/modern_ui.dart';

class CustomerJobsScreen extends StatefulWidget {
  const CustomerJobsScreen({super.key});

  @override
  State<CustomerJobsScreen> createState() => _CustomerJobsScreenState();
}

class _CustomerJobsScreenState extends State<CustomerJobsScreen> {
  bool _loading = true;
  List<Map<String, dynamic>> _jobs = [];
  int _filter = 0; // 0 active, 1 past

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final resp = await ApiClient.instance.dio.get('/services/jobs/');
      final list = (resp.data as List<dynamic>)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      list.sort((a, b) => (b['created_at'] ?? '')
          .toString()
          .compareTo((a['created_at'] ?? '').toString()));
      if (!mounted) return;
      setState(() => _jobs = list);
    } catch (_) {
      if (!mounted) return;
      setState(() => _jobs = []);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _filtered {
    if (_filter == 0) {
      return _jobs.where((j) {
        final s = j['status']?.toString() ?? '';
        return s != 'completed' && s != 'cancelled';
      }).toList();
    }
    return _jobs.where((j) {
      final s = j['status']?.toString() ?? '';
      return s == 'completed' || s == 'cancelled';
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return PremiumBackground(
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Text(
                'My jobs',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: SegmentedButton<int>(
                segments: const [
                  ButtonSegment(value: 0, label: Text('Active')),
                  ButtonSegment(value: 1, label: Text('Past')),
                ],
                selected: {_filter},
                onSelectionChanged: (s) => setState(() => _filter = s.first),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: _filtered.isEmpty
                          ? ListView(
                              children: [
                                const SizedBox(height: 80),
                                Center(
                                  child: Text(
                                    _filter == 0
                                        ? 'No active requests'
                                        : 'No past jobs yet',
                                    style: TextStyle(color: Colors.grey.shade600),
                                  ),
                                ),
                              ],
                            )
                          : ListView.builder(
                              padding: const EdgeInsets.all(20),
                              itemCount: _filtered.length,
                              itemBuilder: (context, index) {
                                final job = _filtered[index];
                                final id = job['id'];
                                return Padding(
                                  padding: const EdgeInsets.only(bottom: 12),
                                  child: _JobListTile(
                                    job: job,
                                    onTap: () {
                                      if (id != null) {
                                        context.push('/jobs/$id');
                                      }
                                    },
                                  ),
                                );
                              },
                            ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _JobListTile extends StatelessWidget {
  const _JobListTile({required this.job, required this.onTap});

  final Map<String, dynamic> job;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final service = (job['category_name'] ?? 'Service').toString();
    final status = (job['status'] ?? '').toString().replaceAll('_', ' ');

    return ModernCard(
      onTap: onTap,
      child: Row(
        children: [
          const GradientIconBubble(
            icon: Icons.home_repair_service_rounded,
            size: 44,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  service,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                Text(
                  status,
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded),
        ],
      ),
    );
  }
}
