import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../api/dio_client.dart';
import '../services/auth_service.dart';
import '../widgets/modern_ui.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, required this.role});

  final String role;

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  String _username = '';
  String _email = '';
  String _password = '';
  String _phone = '';
  bool _loading = false;
  bool _termsAccepted = false;
  bool _termsLoading = true;
  String? _error;
  Map<String, dynamic>? _terms;

  @override
  void initState() {
    super.initState();
    _loadTerms();
  }

  Future<void> _loadTerms() async {
    try {
      final response = await ApiClient.instance.dio.get(
        '/legal/terms/',
        queryParameters: {'audience': widget.role},
      );
      if (mounted) {
        setState(
            () => _terms = Map<String, dynamic>.from(response.data as Map));
      }
    } catch (_) {
      if (mounted) {
        setState(() =>
            _error = 'Unable to load the Terms of Service. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _termsLoading = false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (!_termsAccepted || _terms == null) {
      setState(
          () => _error = 'You must accept the Terms of Service to register.');
      return;
    }
    _formKey.currentState!.save();
    setState(() {
      _loading = true;
      _error = null;
    });
    final ok = await AuthService.instance.register(
      username: _username,
      email: _email,
      password: _password,
      role: widget.role,
      phoneNumber: _phone,
    );
    setState(() => _loading = false);
    if (!ok) {
      setState(() => _error =
          AuthService.instance.lastRegisterError ?? 'Registration failed');
      return;
    }

    // For providers, automatically log in and send them straight into onboarding
    // so they complete credentials and expertise before using the app.
    if (widget.role == 'provider') {
      final loggedIn = await AuthService.instance.login(_username, _password);
      if (!loggedIn) {
        if (!mounted) return;
        setState(() =>
            _error = 'Account created, but auto-login failed. Please sign in.');
        return;
      }
      await ApiClient.instance.dio.post('/legal/terms/', data: {
        'terms_version_id': _terms?['id'],
        'client_meta': {'surface': 'mobile_register'},
      });
      if (!mounted) return;
      context.go('/provider-onboarding');
      return;
    }

    // Customers go to login screen after successful registration.
    if (!mounted) return;
    context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isProvider = widget.role == 'provider';
    return Scaffold(
      appBar: AppBar(
        title:
            Text(isProvider ? 'Provider registration' : 'Client registration'),
      ),
      body: PremiumBackground(
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AnimatedEntrance(
                    child: Text(
                      isProvider
                          ? 'Create your provider account. You will complete service details, credentials, and coverage after this.'
                          : 'Create your client account so AI can match you with nearby trusted service providers.',
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: Colors.grey.shade600),
                    ),
                  ),
                  const SizedBox(height: 12),
                  AnimatedEntrance(
                    delay: const Duration(milliseconds: 100),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: kBrandBlue.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            isProvider
                                ? Icons.engineering_outlined
                                : Icons.person_search_outlined,
                            color: kBrandBlue,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              isProvider
                                  ? 'Registering as Service Provider'
                                  : 'Registering as Client',
                              style: theme.textTheme.titleSmall?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: kBrandBlue,
                              ),
                            ),
                          ),
                          TextButton(
                            onPressed: () => context.go('/welcome'),
                            child: const Text('Change'),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  TextFormField(
                    decoration: const InputDecoration(
                      labelText: 'Username',
                      prefixIcon: Icon(Icons.person_outline),
                    ),
                    validator: (v) =>
                        v == null || v.isEmpty ? 'Required' : null,
                    onSaved: (v) => _username = v!.trim(),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    decoration: const InputDecoration(
                      labelText: 'Email',
                      prefixIcon: Icon(Icons.mail_outline),
                    ),
                    validator: (v) =>
                        v == null || v.isEmpty ? 'Required' : null,
                    onSaved: (v) => _email = v!.trim(),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    decoration: const InputDecoration(
                      labelText: 'Phone number',
                      helperText: 'For SMS notifications (e.g. 0712345678)',
                      prefixIcon: Icon(Icons.phone_android_outlined),
                    ),
                    keyboardType: TextInputType.phone,
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'[0-9+\- ]')),
                    ],
                    validator: (v) {
                      final cleaned =
                          (v ?? '').replaceAll(RegExp(r'[\s+\-]'), '');
                      if (cleaned.length < 10) {
                        return 'Enter a valid phone number';
                      }
                      return null;
                    },
                    onSaved: (v) => _phone = (v ?? '').trim(),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    decoration: const InputDecoration(
                      labelText: 'Password',
                      prefixIcon: Icon(Icons.lock_outline),
                    ),
                    obscureText: true,
                    validator: (v) =>
                        v == null || v.isEmpty ? 'Required' : null,
                    onSaved: (v) => _password = v!.trim(),
                  ),
                  const SizedBox(height: 12),
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _termsAccepted,
                    onChanged: _termsLoading || _terms == null
                        ? null
                        : (value) =>
                            setState(() => _termsAccepted = value ?? false),
                    title: const Text('I accept the Terms of Service'),
                    subtitle: TextButton(
                      style: TextButton.styleFrom(padding: EdgeInsets.zero),
                      onPressed: _terms == null
                          ? null
                          : () => showDialog<void>(
                                context: context,
                                builder: (context) => AlertDialog(
                                  title: Text(
                                      (_terms?['title'] ?? 'Terms of Service')
                                          .toString()),
                                  content: SingleChildScrollView(
                                    child: Text((_terms?['body'] ??
                                            _terms?['content'] ??
                                            'No terms text available.')
                                        .toString()),
                                  ),
                                  actions: [
                                    TextButton(
                                      onPressed: () => Navigator.pop(context),
                                      child: const Text('Close'),
                                    ),
                                  ],
                                ),
                              ),
                      child:
                          Text(_termsLoading ? 'Loading terms…' : 'Read terms'),
                    ),
                    controlAffinity: ListTileControlAffinity.leading,
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: const TextStyle(color: Colors.red)),
                  ],
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: _loading ? null : _submit,
                    child: _loading
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor:
                                  AlwaysStoppedAnimation<Color>(Colors.white),
                            ),
                          )
                        : Text(isProvider
                            ? 'Create provider account'
                            : 'Create client account'),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => context.go('/login'),
                    child: const Text('Already registered? Sign in'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
