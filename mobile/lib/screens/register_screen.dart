import 'package:dio/dio.dart';
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
  bool _obscurePassword = true;
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
      final audience = widget.role == 'provider' ? 'provider' : 'customer';
      final response = await ApiClient.instance.dio.get(
        '/legal/terms/',
        queryParameters: {'audience': audience},
      );
      if (mounted) {
        setState(() {
          _terms = Map<String, dynamic>.from(response.data as Map);
          _error = null;
        });
      }
    } on DioException catch (error) {
      if (mounted) {
        setState(() {
          _error = ApiClient.messageFrom(
            error,
            fallback:
                'Unable to load the Terms of Service. Check your connection and try again.',
          );
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error =
            'Unable to load the Terms of Service. Check your connection and try again.');
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

    // Record consent before taking clients into the signed-in app.
    final loggedIn = await AuthService.instance.login(_username, _password);
    if (!loggedIn) {
      if (!mounted) return;
      context.go('/login');
      return;
    }
    await ApiClient.instance.dio.post('/legal/terms/', data: {
      'terms_version_id': _terms?['id'],
      'client_meta': {'surface': 'mobile_register'},
    });
    if (!mounted) return;
    context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isProvider = widget.role == 'provider';
    return Scaffold(
      appBar: AppBar(
        title: Text(isProvider ? 'Provider registration' : 'Create your account'),
      ),
      body: PremiumBackground(
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) => Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 560),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
                  child: AutofillGroup(
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          AnimatedEntrance(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  height: 48,
                                  width: 48,
                                  decoration: BoxDecoration(
                                    gradient: kBrandGradient,
                                    borderRadius: BorderRadius.circular(16),
                                  ),
                                  child: Icon(
                                    isProvider
                                        ? Icons.engineering_outlined
                                        : Icons.person_add_alt_1_outlined,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 16),
                                Text(
                                  isProvider
                                      ? 'Build your service business'
                                      : 'Find trusted help, faster',
                                  style: theme.textTheme.headlineSmall?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: kBrandNavy,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  isProvider
                                      ? 'Create your account, then complete your service details and verification.'
                                      : 'Set up your account to discover verified service providers near you.',
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: Colors.blueGrey.shade600,
                                    height: 1.45,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 20),
                          AnimatedEntrance(
                            delay: const Duration(milliseconds: 80),
                            child: ModernCard(
                              padding: const EdgeInsets.all(18),
                              child: Row(
                                children: [
                                  Icon(
                                    isProvider
                                        ? Icons.engineering_outlined
                                        : Icons.person_search_outlined,
                                    color: kBrandBlue,
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          isProvider
                                              ? 'Registering as a provider'
                                              : 'Registering as a client',
                                          style: theme.textTheme.titleSmall?.copyWith(
                                            fontWeight: FontWeight.w700,
                                            color: kBrandNavy,
                                          ),
                                        ),
                                        Text(
                                          isProvider
                                              ? 'You can edit service details next.'
                                              : 'It takes about one minute.',
                                          style: theme.textTheme.bodySmall?.copyWith(
                                            color: Colors.blueGrey.shade600,
                                          ),
                                        ),
                                      ],
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
                          const SizedBox(height: 16),
                          ModernCard(
                            padding: const EdgeInsets.all(20),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Text(
                                  'Your details',
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Use details you can access. Your phone is used for service updates.',
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: Colors.blueGrey.shade600,
                                  ),
                                ),
                                const SizedBox(height: 18),
                                TextFormField(
                    decoration: const InputDecoration(
                      labelText: 'Username',
                      prefixIcon: Icon(Icons.person_outline),
                    ),
                    autofillHints: const [AutofillHints.username],
                    textInputAction: TextInputAction.next,
                    validator: (v) =>
                        v == null || v.trim().length < 3
                            ? 'Use at least 3 characters'
                            : null,
                    onSaved: (v) => _username = v!.trim(),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    decoration: const InputDecoration(
                      labelText: 'Email',
                      prefixIcon: Icon(Icons.mail_outline),
                    ),
                    autofillHints: const [AutofillHints.email],
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    validator: (v) => v == null ||
                            !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
                                .hasMatch(v.trim())
                        ? 'Enter a valid email address'
                        : null,
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
                    autofillHints: const [AutofillHints.telephoneNumber],
                    textInputAction: TextInputAction.next,
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
                    decoration: InputDecoration(
                      labelText: 'Password',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        tooltip: _obscurePassword ? 'Show password' : 'Hide password',
                        onPressed: () =>
                            setState(() => _obscurePassword = !_obscurePassword),
                        icon: Icon(
                          _obscurePassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                      ),
                    ),
                    obscureText: _obscurePassword,
                    autofillHints: const [AutofillHints.newPassword],
                    textInputAction: TextInputAction.done,
                    validator: (v) =>
                        v == null || v.length < 8
                            ? 'Use at least 8 characters'
                            : null,
                    onSaved: (v) => _password = v!.trim(),
                  ),
                                const SizedBox(height: 18),
                                Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: kBrandSurface.withValues(alpha: 0.62),
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  child: CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _termsAccepted,
                    onChanged: _termsLoading || _terms == null
                        ? null
                        : (value) =>
                            setState(() => _termsAccepted = value ?? false),
                    title: const Text('I accept the Terms & Conditions'),
                    subtitle: TextButton(
                      style: TextButton.styleFrom(padding: EdgeInsets.zero),
                      onPressed: _terms == null
                          ? (_termsLoading
                              ? null
                              : () {
                                  setState(() {
                                    _termsLoading = true;
                                    _error = null;
                                  });
                                  _loadTerms();
                                })
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
                      child: Text(
                        _termsLoading
                            ? 'Loading terms…'
                            : _terms == null
                                ? 'Retry loading terms'
                                : 'Read terms',
                      ),
                    ),
                    controlAffinity: ListTileControlAffinity.leading,
                  ),
                                ),
                                if (_error != null) ...[
                                  const SizedBox(height: 14),
                                  Container(
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      color: Colors.red.shade50,
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(Icons.info_outline,
                                            color: Colors.red.shade700),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Text(_error!,
                                              style: TextStyle(
                                                  color: Colors.red.shade800)),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 18),
                                SizedBox(
                                  height: 54,
                                  child: DecoratedBox(
                                    decoration: BoxDecoration(
                                      gradient: kBrandGradient,
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                    child: ElevatedButton(
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: Colors.transparent,
                                        foregroundColor: Colors.white,
                                        shadowColor: Colors.transparent,
                                      ),
                                      onPressed: _loading ? null : _submit,
                                      child: _loading
                                          ? const SizedBox(
                                              height: 20,
                                              width: 20,
                                              child: CircularProgressIndicator(
                                                strokeWidth: 2,
                                                valueColor:
                                                    AlwaysStoppedAnimation<Color>(
                                                        Colors.white),
                                              ),
                                            )
                                          : Text(isProvider
                                              ? 'Create provider account'
                                              : 'Create client account'),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 14),
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
            ),
          ),
        ),
      ),
    );
  }
}
