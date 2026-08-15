import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:firebase_core/firebase_core.dart';

import 'firebase_options.dart';
import 'services/auth_service.dart';
import 'services/push_notification_service.dart';
import 'services/remote_config_service.dart';
import 'config/app_config.dart';
import 'screens/admin_dashboard.dart';
import 'screens/customer_shell.dart';
import 'screens/search_results.dart';
import 'screens/provider_onboarding.dart';
import 'screens/job_detail.dart';
import 'screens/provider_analytics.dart';
import 'screens/provider_job_tracking.dart';
import 'screens/login_screen.dart';
import 'screens/role_selection_screen.dart';
import 'screens/register_screen.dart';
import 'screens/provider_dashboard.dart';
import 'screens/complaint_screen.dart';
import 'widgets/modern_ui.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  debugPrint(
    'S-Link API_BASE_URL=${AppConfig.apiBaseUrl} '
    '(${AppConfig.isUsingProductionApi ? 'production' : 'local'})',
  );
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  await AuthService.instance.init();
  unawaited(PushNotificationService.instance.initialize());
  // Best-effort: pull feature flags from /api/config/. Failures fall back to
  // safe defaults (paywall OFF) so the app still works offline / first run.
  unawaited(RemoteConfigService.instance.refresh());
  // Dark status-bar icons on light screens (transparent AppBars used to wash them out).
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      statusBarBrightness: Brightness.light,
      systemNavigationBarColor: Colors.white,
      systemNavigationBarIconBrightness: Brightness.dark,
    ),
  );
  runApp(const SLinkApp());
}

final _router = GoRouter(
  initialLocation: '/welcome',
  refreshListenable: AuthService.instance.isLoggedIn,
  routes: [
    GoRoute(
      path: '/welcome',
      builder: (context, state) => const RoleSelectionScreen(),
    ),
    GoRoute(
      path: '/login',
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/register',
      builder: (context, state) => const RegisterScreen(role: 'customer'),
    ),
    GoRoute(
      path: '/register/:role',
      builder: (context, state) {
        final role = state.pathParameters['role'] == 'provider'
            ? 'provider'
            : 'customer';

        return RegisterScreen(role: role);
      },
    ),
    GoRoute(
      path: '/',
      builder: (context, state) => const CustomerShellScreen(),
    ),
    GoRoute(
      path: '/search',
      builder: (context, state) {
        final extra = state.extra as Map<String, dynamic>? ?? {};

        return SearchResultsScreen(
          query: extra['query'] as String? ?? '',
          lat: extra['lat'] as double? ?? 0.0,
          lng: extra['lng'] as double? ?? 0.0,
          categoryId: extra['category_id'] as int?,
          categoryName: extra['category_name'] as String?,
          budgetMin: extra['budget_min'] as int?,
          budgetMax: extra['budget_max'] as int?,
          priority: extra['priority'] as String?,
          formattedAddress:
              extra['formatted_address'] as String? ?? 'Dropped map pin',
          placeId: extra['place_id'] as String?,
          recipientName: extra['recipient_name'] as String? ?? '',
          recipientPhone: extra['recipient_phone'] as String? ?? '',
          accessNotes: extra['access_notes'] as String? ?? '',
        );
      },
    ),
    GoRoute(
      path: '/provider-onboarding',
      builder: (context, state) => const ProviderOnboardingScreen(),
    ),
    GoRoute(
      path: '/jobs/:id',
      builder: (context, state) {
        final idStr = state.pathParameters['id']!;
        final id = int.tryParse(idStr) ?? 0;

        return JobDetailScreen(jobId: id);
      },
    ),
    GoRoute(
      path: '/complaints',
      builder: (context, state) {
        final jobId = state.uri.queryParameters['job_id'];
        return ComplaintScreen(
            jobId: jobId == null ? null : int.tryParse(jobId));
      },
    ),
    GoRoute(
      path: '/provider-analytics',
      builder: (context, state) => const ProviderAnalyticsScreen(),
    ),
    GoRoute(
      path: '/provider-jobs/:id/track',
      builder: (context, state) {
        final idStr = state.pathParameters['id']!;
        final id = int.tryParse(idStr) ?? 0;

        return ProviderJobTrackingScreen(jobId: id);
      },
    ),
    GoRoute(
      path: '/provider-dashboard',
      builder: (context, state) => const ProviderDashboardScreen(),
    ),
    GoRoute(
      path: '/admin',
      builder: (context, state) => const AdminDashboardScreen(),
    ),
  ],
  redirect: (context, state) {
    final loggedIn = AuthService.instance.isLoggedIn.value;
    final role = AuthService.instance.role;

    final loggingIn = state.matchedLocation == '/welcome' ||
        state.matchedLocation == '/login' ||
        state.matchedLocation == '/register' ||
        state.matchedLocation.startsWith('/register/');

    // User not logged in
    if (!loggedIn && !loggingIn) {
      return '/welcome';
    }

    // Provider MUST finish onboarding before accessing provider routes
    if (loggedIn &&
        role == 'provider' &&
        !AuthService.instance.providerProfileCompleted &&
        state.matchedLocation != '/provider-onboarding') {
      return '/provider-onboarding';
    }

    // Logged in users should not remain on auth screens
    if (loggedIn && loggingIn) {
      if (role == 'admin') return '/admin';
      if (role == 'provider') return '/provider-dashboard';
      return '/';
    }

    return null;
  },
);

class SLinkApp extends StatelessWidget {
  const SLinkApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'S-Link',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: kBrandBlue,
          brightness: Brightness.light,
        ).copyWith(
          primary: kBrandBlue,
          secondary: kBrandCyan,
          surface: Colors.white,
          surfaceContainerHighest: const Color(0xFFEAF4FF),
        ),
        scaffoldBackgroundColor: kSoftBackground,
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.white,
          foregroundColor: kBrandNavy,
          elevation: 0,
          scrolledUnderElevation: 0,
          centerTitle: false,
          surfaceTintColor: Colors.transparent,
          systemOverlayStyle: SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: Brightness.dark,
            statusBarBrightness: Brightness.light,
          ),
          titleTextStyle: TextStyle(
            color: kBrandNavy,
            fontSize: 18,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.2,
          ),
          toolbarHeight: 56,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: BorderSide(color: Colors.grey.shade200),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: BorderSide(color: Colors.grey.shade200),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: kBrandBlue, width: 2),
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: kBrandBlue,
            foregroundColor: Colors.white,
            minimumSize: const Size(double.infinity, 56),
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: kBrandBlue,
            textStyle: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 0,
          shadowColor: Colors.black.withValues(alpha: 0.10),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
          margin: const EdgeInsets.symmetric(vertical: 8),
        ),
      ),
      debugShowCheckedModeBanner: false,
      routerConfig: _router,
    );
  }
}
