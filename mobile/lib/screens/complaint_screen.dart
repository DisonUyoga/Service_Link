import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../api/dio_client.dart';

class ComplaintScreen extends StatefulWidget {
  const ComplaintScreen({super.key, this.jobId});

  final int? jobId;

  @override
  State<ComplaintScreen> createState() => _ComplaintScreenState();
}

class _ComplaintScreenState extends State<ComplaintScreen> {
  final _formKey = GlobalKey<FormState>();
  final _bodyController = TextEditingController();
  String _category = 'general';
  bool _submitting = false;
  bool _spellChecking = false;
  String? _error;
  String? _suggestion;

  @override
  void dispose() {
    _bodyController.dispose();
    super.dispose();
  }

  Future<void> _spellcheck() async {
    final text = _bodyController.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _spellChecking = true;
      _suggestion = null;
    });
    try {
      final response = await ApiClient.instance.dio
          .post('/ai/spellcheck/', data: {'text': text});
      final data = Map<String, dynamic>.from(response.data as Map);
      final corrected = data['corrected']?.toString() ?? text;
      if (mounted && corrected != text) {
        setState(() => _suggestion = corrected);
      }
    } catch (_) {
      // Spellcheck is an assistive feature and should not interrupt reporting.
    } finally {
      if (mounted) setState(() => _spellChecking = false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ApiClient.instance.dio.post('/services/complaints/', data: {
        'job_id': widget.jobId,
        'category': _category,
        'body': _bodyController.text.trim(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Complaint submitted for review.')),
      );
      Navigator.pop(context);
    } on DioException catch (e) {
      if (mounted) {
        setState(() => _error =
            ApiClient.messageFrom(e, fallback: 'Could not submit complaint.'));
      }
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Report an issue')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  widget.jobId == null
                      ? 'Tell us what happened and our team will review it.'
                      : 'Your report will be linked to request #${widget.jobId}.',
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: _category,
                  decoration:
                      const InputDecoration(labelText: 'Issue category'),
                  items: const [
                    DropdownMenuItem(
                        value: 'general', child: Text('General feedback')),
                    DropdownMenuItem(
                        value: 'service_quality',
                        child: Text('Service quality')),
                    DropdownMenuItem(value: 'payment', child: Text('Payment')),
                    DropdownMenuItem(value: 'safety', child: Text('Safety')),
                    DropdownMenuItem(value: 'conduct', child: Text('Conduct')),
                  ],
                  onChanged: (value) =>
                      setState(() => _category = value ?? 'general'),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _bodyController,
                  minLines: 5,
                  maxLines: 8,
                  decoration: const InputDecoration(
                    labelText: 'Describe the issue',
                    alignLabelWithHint: true,
                  ),
                  validator: (value) => value == null || value.trim().length < 3
                      ? 'Please provide a little more detail.'
                      : null,
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _spellChecking ? null : _spellcheck,
                  icon: _spellChecking
                      ? const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.spellcheck_outlined),
                  label: const Text('Check spelling'),
                ),
                if (_suggestion != null)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Suggested wording',
                              style: TextStyle(fontWeight: FontWeight.bold)),
                          const SizedBox(height: 6),
                          Text(_suggestion!),
                          TextButton(
                            onPressed: () {
                              _bodyController.text = _suggestion!;
                              setState(() => _suggestion = null);
                            },
                            child: const Text('Use suggestion'),
                          ),
                        ],
                      ),
                    ),
                  ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(_error!,
                        style: const TextStyle(color: Colors.red)),
                  ),
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Submit complaint'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
