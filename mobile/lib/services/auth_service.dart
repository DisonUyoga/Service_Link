import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/dio_client.dart';
import '../api/auth_api.dart';

class AuthService {
  AuthService._();

  static final AuthService instance = AuthService._();

  final ValueNotifier<bool> isLoggedIn = ValueNotifier<bool>(false);

  String? _role;
  String? _displayName;
  String? _email;
  String? _userId;
  String? _username;
  String? _phoneNumber;

  String? get role => _role;
  String? get displayName => _displayName;
  String? get email => _email;
  String? get userId => _userId;
  String? get username => _username;
  String? get phoneNumber => _phoneNumber;

  bool _providerProfileCompleted = false;
  bool get providerProfileCompleted => _providerProfileCompleted;

  static const _tokenKey = 'auth_token';
  static const _roleKey = 'auth_role';
  static const _displayNameKey = 'auth_display_name';
  static const _emailKey = 'auth_email';
  static const _userIdKey = 'auth_user_id';
  static const _usernameKey = 'auth_username';
  static const _phoneKey = 'auth_phone_number';

  String get firstName {
    final display = _displayName?.trim();

    if (display != null && display.isNotEmpty) {
      return display.split(RegExp(r'\s+')).first;
    }

    final username = _username?.trim();

    if (username != null && username.isNotEmpty) {
      return username;
    }

    final emailPrefix = _email?.split('@').first.trim();

    if (emailPrefix != null && emailPrefix.isNotEmpty) {
      return emailPrefix;
    }

    return 'there';
  }

  String get timeAwareGreeting {
    final hour = DateTime.now().hour;

    final greeting = hour < 12
        ? 'Good Morning'
        : hour < 17
            ? 'Good Afternoon'
            : 'Good Evening';

    return '$greeting $firstName,';
  }

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();

    final token = prefs.getString(_tokenKey);

    _role = prefs.getString(_roleKey);
    _displayName = prefs.getString(_displayNameKey);
    _email = prefs.getString(_emailKey);
    _userId = prefs.getString(_userIdKey);
    _username = prefs.getString(_usernameKey);
    _phoneNumber = prefs.getString(_phoneKey);

    _providerProfileCompleted = false;

    if (token == null) {
      isLoggedIn.value = false;
      return;
    }

    _setTokenOnDio(token);

    try {
      final me = await AuthApi.instance.me();

      await _cacheUserIdentity(me, prefs);
      await refreshProviderProfileStatus();

      isLoggedIn.value = true;
    } on DioException catch (e) {
      debugPrint(
        'AuthService.init error: ${e.response?.statusCode} ${e.response?.data}',
      );

      await _clearSession(prefs);
    }
  }

  Future<bool> login(String username, String password) async {
    try {
      _providerProfileCompleted = false;
      _lastLoginError = null;

      final data = await AuthApi.instance.login(
        username: username,
        password: password,
      );

      final token = data['access'] as String;
      _setTokenOnDio(token);

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_tokenKey, token);

      // Prefer identity from the token response (avoids a second network hop).
      final embedded = data['user'];
      if (embedded is Map) {
        await _cacheUserIdentity(
          Map<String, dynamic>.from(embedded),
          prefs,
        );
      } else {
        final me = await AuthApi.instance.me();
        await _cacheUserIdentity(me, prefs);
      }

      isLoggedIn.value = true;

      // Provider profile check should not block the login spinner.
      // ignore: unawaited_futures
      refreshProviderProfileStatus();

      return true;
    } on DioException catch (e) {
      debugPrint(
        'AuthService.login error: ${e.response?.statusCode} ${e.response?.data}',
      );

      _lastLoginError = _extractErrorMessage(
        e,
        fallback: 'Invalid credentials',
      );
      return false;
    }
  }

  String? _lastLoginError;
  String? get lastLoginError => _lastLoginError;

  String? _lastRegisterError;
  String? get lastRegisterError => _lastRegisterError;

  Future<bool> register({
    required String username,
    required String email,
    required String password,
    required String role,
    String? phoneNumber,
  }) async {
    try {
      _lastRegisterError = null;
      await AuthApi.instance.register(
        username: username,
        email: email,
        password: password,
        role: role,
        phoneNumber: phoneNumber,
      );

      return true;
    } on DioException catch (e) {
      debugPrint(
        'AuthService.register error: ${e.response?.statusCode} ${e.response?.data}',
      );
      final data = e.response?.data;
      if (data is Map) {
        for (final value in data.values) {
          if (value is List && value.isNotEmpty) {
            _lastRegisterError = value.first.toString();
            break;
          } else if (value is String) {
            _lastRegisterError = value;
            break;
          }
        }
      }
      return false;
    }
  }

  Future<bool> updatePhoneNumber(String phoneNumber) async {
    try {
      final me = await AuthApi.instance.updateMe(phoneNumber: phoneNumber);
      _phoneNumber = me['phone_number'] as String?;
      final prefs = await SharedPreferences.getInstance();
      if (_phoneNumber != null && _phoneNumber!.isNotEmpty) {
        await prefs.setString(_phoneKey, _phoneNumber!);
      }
      return true;
    } on DioException catch (e) {
      debugPrint(
        'AuthService.updatePhoneNumber error: ${e.response?.statusCode} ${e.response?.data}',
      );
      return false;
    }
  }

  Future<bool> loginWithGoogle({
    required String email,
    required String name,
  }) async {
    try {
      _providerProfileCompleted = false;
      _lastLoginError = null;

      final data = await AuthApi.instance.googleLogin(
        email: email,
        name: name,
      );

      final token = data['access'] as String;
      _setTokenOnDio(token);

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_tokenKey, token);

      final embedded = data['user'];
      if (embedded is Map) {
        await _cacheUserIdentity(
          Map<String, dynamic>.from(embedded),
          prefs,
        );
      } else {
        final me = await AuthApi.instance.me();
        await _cacheUserIdentity(me, prefs);
      }

      isLoggedIn.value = true;
      // ignore: unawaited_futures
      refreshProviderProfileStatus();

      return true;
    } on DioException catch (e) {
      debugPrint(
        'AuthService.loginWithGoogle error: ${e.response?.statusCode} ${e.response?.data}',
      );

      _lastLoginError = _extractErrorMessage(
        e,
        fallback: 'Google sign-in failed',
      );
      return false;
    }
  }

  /// Pull a human-friendly error message out of a DRF/JWT response.
  /// Covers `{detail: "..."}`, field-error dicts, and lists — and crucially
  /// turns network/captive-portal/server-page failures into plain English
  /// instead of leaking raw HTML to the user.
  String _extractErrorMessage(DioException e, {required String fallback}) {
    // 1. No response at all → connectivity problem.
    switch (e.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return "Can't reach the server. Check your internet connection and "
            'try again.';
      default:
        break;
    }

    final status = e.response?.statusCode;
    final data = e.response?.data;

    // 2. Carrier captive portal / proxy redirect (e.g. out of data bundle).
    //    These come back as 3xx redirects, often to a different host.
    if (status != null && status >= 300 && status < 400) {
      return 'Your network is redirecting the connection — this usually means '
          'no data bundle or a Wi-Fi sign-in page. Fix your connection and '
          'try again.';
    }

    // 3. HTML body instead of JSON = a captive portal, proxy, or server
    //    error page. Never show raw HTML to the user.
    if (data is String) {
      final looksLikeHtml = data.contains('<html') ||
          data.contains('<!doctype') ||
          data.contains('<!DOCTYPE');
      if (looksLikeHtml) {
        if (status != null && status >= 500) {
          return 'The server had a problem ($status). Please try again shortly.';
        }
        return "Can't reach the server right now. Check your internet "
            'connection and try again.';
      }
      if (data.isNotEmpty && data.length < 200) return data;
      return fallback;
    }

    // 4. Normal DRF/JWT error shapes.
    if (data is Map) {
      final detail = data['detail'];
      if (detail is String && detail.isNotEmpty) return detail;
      if (detail is Map && detail['detail'] is String) {
        return detail['detail'] as String;
      }
      for (final value in data.values) {
        if (value is String && value.isNotEmpty) return value;
        if (value is List && value.isNotEmpty) return value.first.toString();
      }
    }

    return fallback;
  }

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await _clearSession(prefs);
  }

  Future<void> refreshProviderProfileStatus() async {
    if (_role != 'provider') {
      _providerProfileCompleted = false;
      return;
    }

    try {
      final response = await ApiClient.instance.dio.get(
        '/services/providers/me/',
      );

      final data = Map<String, dynamic>.from(response.data as Map);

      _providerProfileCompleted = data['profile_complete'] == true;
    } on DioException catch (e) {
      debugPrint(
        'AuthService.refreshProviderProfileStatus error: ${e.response?.statusCode} ${e.response?.data}',
      );

      _providerProfileCompleted = false;
    }
  }

  Future<void> markProviderProfileCompleted() async {
    _providerProfileCompleted = true;
    // Trigger go_router redirect refresh.
    isLoggedIn.value = isLoggedIn.value;
  }

  /// Route to open after a successful sign-in.
  String routeAfterLogin() {
    if (_role == 'admin') return '/admin';
    if (_role == 'provider') {
      return _providerProfileCompleted
          ? '/provider-dashboard'
          : '/provider-onboarding';
    }
    return '/';
  }

  Future<void> _cacheUserIdentity(
    Map<String, dynamic> me,
    SharedPreferences prefs,
  ) async {
    _role = me['role'] as String?;
    _email = me['email'] as String?;
    final rawId = me['id'];
    _userId = rawId?.toString();
    _username = me['username'] as String?;
    _phoneNumber = (me['phone_number'] ?? me['phone']) as String?;

    final firstName = me['first_name'] as String?;
    final lastName = me['last_name'] as String?;
    final fullNameField = me['full_name'] as String?;
    final username = me['username'] as String?;

    final fullName = (fullNameField != null && fullNameField.trim().isNotEmpty)
        ? fullNameField.trim()
        : [
            firstName,
            lastName,
          ]
            .where((part) => part != null && part.trim().isNotEmpty)
            .join(' ')
            .trim();

    _displayName = fullName.isNotEmpty ? fullName : username;

    if (_role != null) {
      await prefs.setString(_roleKey, _role!);
    }

    if (_displayName != null) {
      await prefs.setString(_displayNameKey, _displayName!);
    }

    if (_email != null) {
      await prefs.setString(_emailKey, _email!);
    }

    if (_userId != null) {
      await prefs.setString(_userIdKey, _userId!);
    }

    if (_username != null) {
      await prefs.setString(_usernameKey, _username!);
    }

    if (_phoneNumber != null) {
      await prefs.setString(_phoneKey, _phoneNumber!);
    }
  }

  Future<void> _clearSession(SharedPreferences prefs) async {
    await prefs.remove(_tokenKey);
    await prefs.remove(_roleKey);
    await prefs.remove(_displayNameKey);
    await prefs.remove(_emailKey);
    await prefs.remove(_userIdKey);
    await prefs.remove(_usernameKey);
    await prefs.remove(_phoneKey);

    _role = null;
    _displayName = null;
    _email = null;
    _userId = null;
    _username = null;
    _phoneNumber = null;
    _providerProfileCompleted = false;

    ApiClient.instance.dio.options.headers.remove('Authorization');

    isLoggedIn.value = false;
  }

  void _setTokenOnDio(String token) {
    ApiClient.instance.dio.options.headers['Authorization'] = 'Bearer $token';
  }
}