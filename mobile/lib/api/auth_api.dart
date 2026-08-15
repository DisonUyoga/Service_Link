import 'package:dio/dio.dart';

import 'dio_client.dart';

class AuthApi {
  AuthApi._();

  static final AuthApi instance = AuthApi._();

  Dio get _dio => ApiClient.instance.dio;

  Future<Map<String, dynamic>> login({
    required String username,
    required String password,
  }) async {
    final resp = await _dio.post('/accounts/token/', data: {
      'username': username,
      'password': password,
    });
    return resp.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> register({
    required String username,
    required String email,
    required String password,
    required String role,
    String? phoneNumber,
  }) async {
    final resp = await _dio.post('/accounts/register/', data: {
      'username': username,
      'email': email,
      'password': password,
      'role': role,
      if (phoneNumber != null && phoneNumber.isNotEmpty)
        'phone_number': phoneNumber,
    });
    return resp.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateMe({String? phoneNumber}) async {
    final resp = await _dio.patch('/accounts/me/', data: {
      if (phoneNumber != null) 'phone_number': phoneNumber,
    });
    return resp.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> googleLogin({
    required String email,
    required String name,
  }) async {
    final resp = await _dio.post('/accounts/google-login/', data: {
      'email': email,
      'name': name,
    });
    return resp.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> me() async {
    final resp = await _dio.get('/accounts/me/');
    return resp.data as Map<String, dynamic>;
  }
}

