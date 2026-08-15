import 'dart:developer' as developer;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../api/dio_client.dart';
import '../firebase_options.dart';
import 'auth_service.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  developer.log(
    'Background job notification: ${message.data['job_id'] ?? ''}',
    name: 's_link.push',
  );
}

class PushNotificationService {
  PushNotificationService._();

  static final instance = PushNotificationService._();
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );
    _messaging.onTokenRefresh.listen(_registerToken);
    FirebaseMessaging.onMessage.listen((message) {
      developer.log(
        'Foreground notification: ${message.notification?.title ?? 'Job update'}',
        name: 's_link.push',
      );
    });
    await registerCurrentDevice();
  }

  Future<void> registerCurrentDevice() async {
    if (AuthService.instance.role != 'provider') return;
    try {
      final token = await _messaging.getToken();
      if (token != null && token.isNotEmpty) await _registerToken(token);
    } catch (error) {
      // The app remains usable if FCM has not yet been configured on a device.
      developer.log('FCM token registration failed',
          name: 's_link.push', error: error);
    }
  }

  Future<void> _registerToken(String token) async {
    if (AuthService.instance.role != 'provider') return;
    await ApiClient.instance.dio.post('/devices/push-token/', data: {
      'token': token,
      'platform': kIsWeb
          ? 'android'
          : defaultTargetPlatform == TargetPlatform.iOS
              ? 'ios'
              : 'android',
    });
  }
}
