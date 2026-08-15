import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../api/dio_client.dart';
import 'modern_ui.dart';

class JobRatingCard extends StatefulWidget {
  const JobRatingCard({
    super.key,
    required this.jobId,
    required this.providerName,
    this.onRated,
  });

  final int jobId;
  final String providerName;
  final VoidCallback? onRated;

  @override
  State<JobRatingCard> createState() => _JobRatingCardState();
}

class _JobRatingCardState extends State<JobRatingCard> {
  int _score = 5;
  final _commentController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ApiClient.instance.dio.post(
        '/services/ratings/',
        data: {
          'job': widget.jobId,
          'score': _score,
          'comment': _commentController.text.trim(),
        },
      );

      if (!mounted) return;

      widget.onRated?.call();

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Thanks for your feedback!')),
      );
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = ApiClient.messageFrom(e, fallback: 'Could not submit rating');
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ModernCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Rate ${widget.providerName}',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Your rating helps other customers find trusted providers.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: Colors.grey.shade700,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (index) {
              final star = index + 1;
              return IconButton(
                onPressed: _submitting ? null : () => setState(() => _score = star),
                icon: Icon(
                  star <= _score ? Icons.star_rounded : Icons.star_outline_rounded,
                  color: Colors.amber.shade700,
                  size: 36,
                ),
              );
            }),
          ),
          TextField(
            controller: _commentController,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Comment (optional)',
              hintText: 'What went well?',
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: Colors.red)),
          ],
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Submit rating'),
            ),
          ),
        ],
      ),
    );
  }
}
