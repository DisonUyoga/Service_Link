import 'package:dio/dio.dart';
import 'dart:developer' as developer;
import 'package:flutter/foundation.dart';

import '../config/app_config.dart';
import '../services/auth_service.dart';

/// Shared Dio client for the S-Link REST API.
class ApiClient {
  ApiClient._() {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          // Keep base URL in sync (compile-time config after full rebuild).
          options.baseUrl = AppConfig.apiBaseUrl;
          options.extra['_startedAt'] = DateTime.now();
          if (kDebugMode) {
            developer.log(
              '${options.method} ${options.uri}',
              name: 's_link.api.request',
              level: 800,
            );
          }
          handler.next(options);
        },
        onResponse: (response, handler) {
          if (kDebugMode) {
            final startedAt = response.requestOptions.extra['_startedAt'];
            final elapsed = startedAt is DateTime
                ? DateTime.now().difference(startedAt).inMilliseconds
                : null;
            developer.log(
              '${response.requestOptions.method} '
              '${response.requestOptions.uri} → ${response.statusCode}'
              '${elapsed == null ? '' : ' (${elapsed}ms)'}',
              name: 's_link.api.response',
              level: 800,
            );
          }
          handler.next(response);
        },
        onError: (error, handler) async {
          if (kDebugMode) {
            final startedAt = error.requestOptions.extra['_startedAt'];
            final elapsed = startedAt is DateTime
                ? DateTime.now().difference(startedAt).inMilliseconds
                : null;
            developer.log(
              '${error.requestOptions.method} '
              '${error.requestOptions.uri} → '
              '${error.response?.statusCode ?? error.type} '
              '${error.message ?? ''} '
              '${error.error ?? ''}'
              '${elapsed == null ? '' : ' (${elapsed}ms)'}',
              name: 's_link.api.error',
              level: 900,
              error: error.error,
            );
          }
          final path = error.requestOptions.path;
          final isAuthAttempt = path.contains('/accounts/token/') ||
              path.contains('/accounts/register/') ||
              path.contains('/accounts/google-login/');
          // Don't wipe a session when a login/register attempt returns 401.
          if (error.response?.statusCode == 401 && !isAuthAttempt) {
            await AuthService.instance.logout();
          }
          handler.next(error);
        },
      ),
    );
  }

  static final ApiClient instance = ApiClient._();

  late final Dio dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 45),
      sendTimeout: const Duration(seconds: 30),
      followRedirects: true,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    ),
  );

  /// Pulls a human-readable message from a Dio error.
  static String messageFrom(DioException error, {String fallback = 'Something went wrong'}) {
    switch (error.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        final host = error.requestOptions.uri.host;
        return host.isEmpty
            ? "Can't reach the server. Check your internet connection and try again."
            : "Can't reach $host. Confirm you're online, then fully restart the app.";
      default:
        break;
    }

    final status = error.response?.statusCode;
    final data = error.response?.data;

    if (data is Map) {
      final detail = data['detail'];
      if (detail != null) return detail.toString();
      for (final value in data.values) {
        if (value is List && value.isNotEmpty) {
          return value.first.toString();
        }
        if (value is String && value.isNotEmpty) return value;
      }
    }

    if (data is String) {
      if (data.contains('<!DOCTYPE html>') || data.contains('<html')) {
        if (status != null && status >= 500) {
          return 'Server error ($status). Please try again shortly.';
        }
        return fallback;
      }
      if (data.length < 200) return data;
    }

    if (kDebugMode) {
      final preview = data is String ? data.substring(0, data.length.clamp(0, 200)) : data;
      debugPrint('API error: $status $preview');
    }
    if (status != null && status >= 500) {
      return 'Server error ($status). Please try again shortly.';
    }
    return fallback;
  }
}
