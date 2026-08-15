import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

import '../api/dio_client.dart';
import '../config/app_config.dart';
import '../services/auth_service.dart';
import '../widgets/location_pin_picker.dart';
import '../widgets/modern_ui.dart';
import '../widgets/sponsor_ads_carousel.dart';
import '../utils/format_label.dart';

// ── Budget dialog uses unified brand palette from modern_ui.dart ──

/// A small palette of brand-friendly colors used for category monograms.
/// Any service — including ones added later — gets a stable color + initial,
/// so no per-category icon assets are ever required.
const List<Color> _categoryPalette = [
  Color(0xFF0082D6), // brand blue
  Color(0xFF24C6DC), // cyan
  Color(0xFF6C5CE7), // violet
  Color(0xFF00B894), // green
  Color(0xFFE17055), // coral
  Color(0xFFE84393), // pink
  Color(0xFFF39C12), // amber
  Color(0xFF0984E3), // sky
  Color(0xFF00897B), // teal
  Color(0xFF8E44AD), // purple
];

/// Deterministic color for a category name — the same name always maps to the
/// same color across the app, regardless of when the category was created.
Color categoryColor(String name) {
  if (name.trim().isEmpty) return _categoryPalette.first;
  var hash = 0;
  for (final unit in name.trim().toLowerCase().codeUnits) {
    hash = (hash * 31 + unit) & 0x7fffffff;
  }
  return _categoryPalette[hash % _categoryPalette.length];
}

/// First 1–2 letters of a category name, e.g. "Salon & Beauty" -> "SB",
/// "Plumbing" -> "PL". Used for monogram avatars.
String categoryMonogram(String name) {
  final cleaned = name.trim();
  if (cleaned.isEmpty) return '?';
  final words =
      cleaned.split(RegExp(r'[\s&/]+')).where((w) => w.isNotEmpty).toList();
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return cleaned.length >= 2
      ? cleaned.substring(0, 2).toUpperCase()
      : cleaned.toUpperCase();
}

class CustomerHomeScreen extends StatefulWidget {
  const CustomerHomeScreen({super.key, this.onLogout});

  final VoidCallback? onLogout;

  @override
  State<CustomerHomeScreen> createState() => _CustomerHomeScreenState();
}

class _CustomerHomeScreenState extends State<CustomerHomeScreen> {
  final TextEditingController _search = TextEditingController();
  final FocusNode _searchFocus = FocusNode();

  final LayerLink _searchLayerLink = LayerLink();

  late final stt.SpeechToText _speech;

  bool _listening = false;
  bool _loadingCategories = true;
  bool _loadingSuggestions = false;
  bool _showSuggestions = false;
  bool _loadingJobs = true;
  String? _searchSpellSuggestion;

  List<Map<String, dynamic>> _categories = [];
  List<Map<String, dynamic>> _recentJobs = [];
  List<String> _suggestions = [];

  Timer? _debounce;
  OverlayEntry? _overlayEntry;

  @override
  void initState() {
    super.initState();
    _speech = stt.SpeechToText();

    _search.addListener(_onSearchChanged);

    _searchFocus.addListener(() {
      if (!_searchFocus.hasFocus) {
        Future.delayed(const Duration(milliseconds: 150), () {
          if (mounted) {
            setState(() => _showSuggestions = false);
            _removeOverlay();
          }
        });
      }
    });

    _loadCategories();
    _loadRecentJobs();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _removeOverlay();
    _search.removeListener(_onSearchChanged);
    _search.dispose();
    _searchFocus.dispose();
    _speech.stop();
    super.dispose();
  }

  // ── Overlay management ────────────────────────────────────────────────────────

  void _removeOverlay() {
    _overlayEntry?.remove();
    _overlayEntry = null;
  }

  void _showOverlay(ThemeData theme) {
    _removeOverlay();
    _overlayEntry = _buildOverlayEntry(theme);
    Overlay.of(context).insert(_overlayEntry!);
  }

  void _updateOverlay(ThemeData theme) {
    if (_overlayEntry != null) {
      _overlayEntry!.markNeedsBuild();
    } else if (_showSuggestions && _suggestions.isNotEmpty) {
      _showOverlay(theme);
    }
  }

  OverlayEntry _buildOverlayEntry(ThemeData theme) {
    return OverlayEntry(
      builder: (context) {
        if (!_showSuggestions || _suggestions.isEmpty) {
          return const SizedBox.shrink();
        }
        return Positioned(
          width: MediaQuery.of(context).size.width - 48,
          child: CompositedTransformFollower(
            link: _searchLayerLink,
            showWhenUnlinked: false,
            offset: const Offset(0, 56),
            child: Material(
              color: Colors.transparent,
              child: _buildDropdown(theme),
            ),
          ),
        );
      },
    );
  }

  // ── Categories ────────────────────────────────────────────────────────────────

  Future<void> _loadCategories() async {
    setState(() => _loadingCategories = true);
    try {
      final resp = await ApiClient.instance.dio.get('/services/categories/');
      final list = (resp.data as List<dynamic>)
          .map<Map<String, dynamic>>((e) => e as Map<String, dynamic>)
          .toList();
      setState(() => _categories = list);
    } catch (_) {
    } finally {
      setState(() => _loadingCategories = false);
    }
  }

  Map<String, dynamic>? _findCategoryByName(String value) {
    final normalized = value.trim().toLowerCase();
    for (final category in _categories) {
      final name = category['name']?.toString().trim().toLowerCase() ?? '';
      if (name == normalized ||
          name.contains(normalized) ||
          normalized.contains(name)) {
        return category;
      }
    }
    return null;
  }

  // ── Recent customer jobs ──────────────────────────────────────────────────────

  Future<void> _loadRecentJobs() async {
    if (!mounted) return;
    setState(() => _loadingJobs = true);
    try {
      final resp = await ApiClient.instance.dio.get('/services/jobs/');
      final list = (resp.data as List<dynamic>)
          .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      list.sort((a, b) => (b['created_at'] ?? '')
          .toString()
          .compareTo((a['created_at'] ?? '').toString()));
      if (!mounted) return;
      setState(() => _recentJobs = list.take(6).toList());
    } catch (_) {
      if (!mounted) return;
      setState(() => _recentJobs = []);
    } finally {
      if (mounted) setState(() => _loadingJobs = false);
    }
  }

  // ── Autocomplete ──────────────────────────────────────────────────────────────

  void _onSearchChanged() {
    setState(() {});

    final query = _search.text.trim();

    if (query.isEmpty) {
      _debounce?.cancel();
      setState(() {
        _suggestions = [];
        _showSuggestions = false;
        _searchSpellSuggestion = null;
      });
      _removeOverlay();
      return;
    }

    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      _fetchSuggestions(query);
      _fetchSearchSpellSuggestion(query);
    });
  }

  Future<void> _fetchSearchSpellSuggestion(String input) async {
    try {
      final response = await ApiClient.instance.dio.get(
        '/ai/spellcheck/',
        queryParameters: {'input': input},
      );
      final data = response.data;
      final suggestion = data is Map
          ? (data['suggestion'] ?? data['corrected_text'] ?? data['text'])
          : null;
      if (!mounted || input != _search.text.trim()) return;
      setState(() => _searchSpellSuggestion = suggestion?.toString().trim());
    } catch (_) {
      // Spell assist is optional; searching continues when unavailable.
    }
  }

  Future<void> _fetchSuggestions(String query) async {
    if (!mounted) return;
    setState(() => _loadingSuggestions = true);

    try {
      final resp = await ApiClient.instance.dio.get(
        '/services/autocomplete/',
        queryParameters: {'q': query},
      );

      if (!mounted) return;

      List<String> results = [];

      if (resp.data is List) {
        results = (resp.data as List<dynamic>)
            .map((e) => e.toString())
            .where((s) => s.isNotEmpty)
            .toList();
      } else if (resp.data is Map) {
        final raw = (resp.data as Map)['results'];
        if (raw is List) {
          results =
              raw.map((e) => e.toString()).where((s) => s.isNotEmpty).toList();
        }
      }

      final localMatches = _categories
          .map((c) => c['name'] as String? ?? '')
          .where((name) =>
              name.isNotEmpty &&
              name.toLowerCase().contains(query.toLowerCase()) &&
              !results.any((r) => r.toLowerCase() == name.toLowerCase()))
          .toList();

      final newSuggestions = [...results, ...localMatches].take(8).toList();
      final shouldShow = newSuggestions.isNotEmpty && _searchFocus.hasFocus;

      setState(() {
        _suggestions = newSuggestions;
        _showSuggestions = shouldShow;
      });

      if (shouldShow) {
        _updateOverlay(Theme.of(context));
      } else {
        _removeOverlay();
      }
    } catch (_) {
      if (!mounted) return;
      final localMatches = _categories
          .map((c) => c['name'] as String? ?? '')
          .where((name) =>
              name.isNotEmpty &&
              name.toLowerCase().contains(query.toLowerCase()))
          .toList();

      final newSuggestions = localMatches.take(8).toList();
      final shouldShow = newSuggestions.isNotEmpty && _searchFocus.hasFocus;

      setState(() {
        _suggestions = newSuggestions;
        _showSuggestions = shouldShow;
      });

      if (shouldShow) {
        _updateOverlay(Theme.of(context));
      } else {
        _removeOverlay();
      }
    } finally {
      if (mounted) setState(() => _loadingSuggestions = false);
    }
  }

  void _selectSuggestion(String value) {
    _search.text = value;
    _search.selection =
        TextSelection.fromPosition(TextPosition(offset: value.length));
    setState(() => _showSuggestions = false);
    _removeOverlay();
    _searchFocus.unfocus();
    _submitSearch();
  }

  // ── Speech ────────────────────────────────────────────────────────────────────

  Future<void> _toggleListening() async {
    if (_listening) {
      _speech.stop();
      setState(() => _listening = false);
      return;
    }

    // Make sure we actually hold the microphone permission. When it has been
    // permanently denied, send the user straight to the app's settings page.
    final status = await Permission.microphone.request();
    if (!mounted) return;

    if (status.isPermanentlyDenied || status.isRestricted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text(
            'Microphone access is blocked. Enable it in Settings to use voice search.',
          ),
          action: SnackBarAction(
            label: 'Open settings',
            onPressed: openAppSettings,
          ),
          duration: const Duration(seconds: 6),
        ),
      );
      return;
    }

    if (!status.isGranted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Microphone permission is needed for voice search.'),
        ),
      );
      return;
    }

    final available = await _speech.initialize(
      onError: (error) {
        if (!mounted) return;
        setState(() => _listening = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Voice search error: ${error.errorMsg}'),
          ),
        );
      },
      onStatus: (status) {
        // Reflect when the engine stops listening (e.g. silence timeout).
        if (!mounted) return;
        if (status == 'notListening' || status == 'done') {
          if (_listening) setState(() => _listening = false);
        }
      },
    );

    if (!available) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text(
            'Voice search unavailable. Allow microphone access in settings, '
            'or check that a speech service is installed.',
          ),
          action: SnackBarAction(
            label: 'Open settings',
            onPressed: openAppSettings,
          ),
          duration: const Duration(seconds: 6),
        ),
      );
      return;
    }

    setState(() => _listening = true);
    _speech.listen(
      listenFor: const Duration(seconds: 20),
      pauseFor: const Duration(seconds: 4),
      onResult: (result) {
        setState(() {
          _search.text = result.recognizedWords;
          _search.selection = TextSelection.fromPosition(
              TextPosition(offset: _search.text.length));
        });
      },
    );
  }

  // ── Search ────────────────────────────────────────────────────────────────────

  Future<void> _submitSearch() async {
    final query = _search.text.trim();
    if (query.isEmpty) return;

    setState(() => _showSuggestions = false);
    _searchFocus.unfocus();

    final selectedCategory = _findCategoryByName(query);
    final categoryId = int.tryParse(selectedCategory?['id']?.toString() ?? '');
    final categoryName = selectedCategory?['name']?.toString();
    final booking = await Navigator.of(context).push<_BookingDetails?>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => _BookingDetailsPage(
          serviceName: categoryName ?? query,
          initialDescription:
              query.length > 24 || query.contains(' ') ? query : '',
        ),
      ),
    );
    if (!mounted || booking == null) return;

    final budget = await _showBudgetPreferenceSheet(query);

    if (!mounted) return;

    context.push('/search', extra: {
      'query': booking.description,
      'lat': booking.location.lat,
      'lng': booking.location.lng,
      'formatted_address': booking.location.address,
      'place_id': booking.location.placeId,
      'recipient_name': booking.recipientName,
      'recipient_phone': booking.recipientPhone,
      'access_notes': booking.accessNotes,
      'category_id': categoryId,
      'category_name': categoryName ?? query,
      'budget_min': budget?['budget_min'],
      'budget_max': budget?['budget_max'],
      'priority': budget?['priority'],
    });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────────

  void _logout() {
    if (widget.onLogout != null) {
      widget.onLogout!();
      return;
    }
    AuthService.instance.logout();
  }

  // ── Budget sheet ──────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>?> _showBudgetPreferenceSheet(
      String service) async {
    final minController = TextEditingController();
    final maxController = TextEditingController();
    String priority = 'balanced';

    return showDialog<Map<String, dynamic>?>(
      context: context,
      barrierDismissible: true,
      barrierColor: Colors.black.withOpacity(0.6),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            final screenHeight = MediaQuery.of(context).size.height;
            final keyboardHeight = MediaQuery.of(context).viewInsets.bottom;

            return Dialog(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(28),
              ),
              insetPadding:
                  const EdgeInsets.symmetric(horizontal: 20, vertical: 40),
              clipBehavior: Clip.antiAlias,
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: screenHeight - keyboardHeight - 80,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // ── Gradient header ──
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
                      decoration: const BoxDecoration(
                        gradient: kBrandGradient,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Center(
                            child: Container(
                              width: 40,
                              height: 4,
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.25),
                                borderRadius: BorderRadius.circular(99),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: Colors.white.withOpacity(0.15),
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: const Icon(
                                  Icons.account_balance_wallet_rounded,
                                  color: Colors.white,
                                  size: 22,
                                ),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'Set your budget',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 18,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: -0.3,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      'Find the best $service within your range',
                                      style: TextStyle(
                                        color: Colors.white.withOpacity(0.65),
                                        fontSize: 12.5,
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),

                    // ── Scrollable content ──
                    Flexible(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: _FancyInput(
                                    controller: minController,
                                    label: 'Min',
                                    hint: '500',
                                  ),
                                ),
                                Padding(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10),
                                  child: Text(
                                    '—',
                                    style: TextStyle(
                                      fontSize: 18,
                                      color: Colors.grey.shade400,
                                      fontWeight: FontWeight.w300,
                                    ),
                                  ),
                                ),
                                Expanded(
                                  child: _FancyInput(
                                    controller: maxController,
                                    label: 'Max',
                                    hint: '5,000',
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 22),
                            Text(
                              'What matters most?',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: Colors.grey.shade500,
                                letterSpacing: 0.6,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                _FancyChip(
                                  label: 'Best balance',
                                  icon: Icons.balance_rounded,
                                  selected: priority == 'balanced',
                                  onTap: () => setSheetState(
                                      () => priority = 'balanced'),
                                ),
                                _FancyChip(
                                  label: 'Lowest price',
                                  icon: Icons.sell_rounded,
                                  selected: priority == 'cheapest',
                                  onTap: () => setSheetState(
                                      () => priority = 'cheapest'),
                                ),
                                _FancyChip(
                                  label: 'Fastest arrival',
                                  icon: Icons.bolt_rounded,
                                  selected: priority == 'fastest',
                                  onTap: () =>
                                      setSheetState(() => priority = 'fastest'),
                                ),
                                _FancyChip(
                                  label: 'Highest rated',
                                  icon: Icons.star_rounded,
                                  selected: priority == 'highest_rated',
                                  onTap: () => setSheetState(
                                      () => priority = 'highest_rated'),
                                ),
                                _FancyChip(
                                  label: 'Most experienced',
                                  icon: Icons.workspace_premium_rounded,
                                  selected: priority == 'experienced',
                                  onTap: () => setSheetState(
                                      () => priority = 'experienced'),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                          ],
                        ),
                      ),
                    ),

                    // ── Sticky buttons ──
                    Container(
                      padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.05),
                            blurRadius: 10,
                            offset: const Offset(0, -4),
                          ),
                        ],
                      ),
                      child: Row(
                        children: [
                          OutlinedButton(
                            onPressed: () => Navigator.pop(context, null),
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 20, vertical: 14),
                              side: BorderSide(color: Colors.grey.shade300),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                            child: Text(
                              'Skip',
                              style: TextStyle(color: Colors.grey.shade600),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: kBrandGradient,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: ElevatedButton(
                                onPressed: () {
                                  final min =
                                      int.tryParse(minController.text.trim());
                                  final max =
                                      int.tryParse(maxController.text.trim());
                                  Navigator.pop(context, {
                                    'budget_min': min,
                                    'budget_max': max,
                                    'priority': priority,
                                  });
                                },
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.transparent,
                                  shadowColor: Colors.transparent,
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 14),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                ),
                                child: const Text(
                                  'Find best match',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  // ── Build ─────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      resizeToAvoidBottomInset: true,
      body: PremiumBackground(
        child: SafeArea(
          child: Column(
            children: [
              _buildHeader(theme),
              Expanded(
                child: SingleChildScrollView(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AnimatedEntrance(child: _buildPopularServices(theme)),
                      const SizedBox(height: 24),
                      const AnimatedEntrance(
                        delay: Duration(milliseconds: 100),
                        child: SponsorAdsCarousel(),
                      ),
                      const SizedBox(height: 24),
                      AnimatedEntrance(
                          delay: const Duration(milliseconds: 180),
                          child: _buildRecentJobs(theme)),
                      const SizedBox(height: 24),
                      AnimatedEntrance(
                          delay: const Duration(milliseconds: 260),
                          child: _buildSmartSuggestionsBanner(theme)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Header ────────────────────────────────────────────────────────────────────

  Widget _buildHeader(ThemeData theme) {
    final auth = AuthService.instance;
    final name = (auth.displayName ?? auth.username ?? 'there').trim();
    final firstName = name.isEmpty ? 'there' : name.split(' ').first;
    final initial = firstName.isNotEmpty ? firstName[0].toUpperCase() : 'S';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [kBrandBlueDark, kBrandBlue, kBrandCyan],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(30),
          bottomRight: Radius.circular(30),
        ),
        boxShadow: [
          BoxShadow(
            color: Color(0x330082D6),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                height: 44,
                width: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.18),
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: Colors.white.withOpacity(0.35), width: 1),
                ),
                child: Text(
                  initial,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      auth.timeAwareGreeting,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: Colors.white.withOpacity(0.85),
                      ),
                    ),
                    Text(
                      firstName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleLarge?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              if (widget.onLogout != null)
                IconButton(
                  onPressed: _logout,
                  icon: const Icon(Icons.logout_rounded, color: Colors.white),
                  tooltip: 'Logout',
                ),
            ],
          ),
          const SizedBox(height: 18),
          Text(
            'What do you need today?',
            style: theme.textTheme.headlineSmall?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w900,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            "Say it or type — we'll connect you to trusted pros nearby.",
            style: theme.textTheme.bodyMedium?.copyWith(
              color: Colors.white.withOpacity(0.88),
            ),
          ),
          const SizedBox(height: 18),
          _buildSearchBar(theme),
          if (_searchSpellSuggestion != null &&
              _searchSpellSuggestion!.isNotEmpty &&
              _searchSpellSuggestion!.toLowerCase() !=
                  _search.text.trim().toLowerCase())
            Align(
              alignment: Alignment.centerLeft,
              child: ActionChip(
                avatar: const Icon(Icons.auto_fix_high, size: 16),
                label: Text('Did you mean "${_searchSpellSuggestion!}"?'),
                onPressed: () {
                  _search.text = _searchSpellSuggestion!;
                  _search.selection = TextSelection.collapsed(
                    offset: _search.text.length,
                  );
                },
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(
    ThemeData theme,
    String title, {
    Widget? trailing,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            width: 4,
            height: 18,
            decoration: BoxDecoration(
              gradient: kBrandGradient,
              borderRadius: BorderRadius.circular(99),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              title,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: kBrandNavy,
              ),
            ),
          ),
          if (trailing != null) trailing,
        ],
      ),
    );
  }

  // ── Search bar ────────────────────────────────────────────────────────────────

  Widget _buildSearchBar(ThemeData theme) {
    return CompositedTransformTarget(
      link: _searchLayerLink,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.08),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        child: Row(
          children: [
            const Icon(Icons.search, color: Colors.grey),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _search,
                focusNode: _searchFocus,
                decoration: const InputDecoration(
                  hintText: 'e.g. Plumber in Westlands…',
                  border: InputBorder.none,
                ),
                onSubmitted: (_) => _submitSearch(),
                onTap: () {
                  if (_search.text.trim().isNotEmpty &&
                      _suggestions.isNotEmpty) {
                    setState(() => _showSuggestions = true);
                    _updateOverlay(theme);
                  }
                },
              ),
            ),
            if (_loadingSuggestions)
              const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: kBrandBlue,
                ),
              )
            else
              InkWell(
                onTap: () {
                  if (_search.text.trim().isNotEmpty) {
                    _submitSearch();
                  } else {
                    _toggleListening();
                  }
                },
                child: CircleAvatar(
                  radius: 20,
                  backgroundColor: kBrandBlue,
                  child: Icon(
                    _search.text.trim().isNotEmpty
                        ? Icons.arrow_forward_rounded
                        : (_listening ? Icons.hearing : Icons.mic),
                    color: Colors.white,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  // ── Floating dropdown ─────────────────────────────────────────────────────────

  Widget _buildDropdown(ThemeData theme) {
    return Container(
      margin: const EdgeInsets.only(top: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.12),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Material(
          color: Colors.transparent,
          child: ListView.separated(
            padding: EdgeInsets.zero,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _suggestions.length,
            separatorBuilder: (_, __) => const Divider(
              height: 1,
              indent: 48,
              endIndent: 16,
            ),
            itemBuilder: (context, index) {
              final suggestion = _suggestions[index];
              final query = _search.text.trim();
              return InkWell(
                onTap: () => _selectSuggestion(suggestion),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Row(
                    children: [
                      const Icon(Icons.search, size: 18, color: Colors.grey),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _buildHighlightedText(suggestion, query, theme),
                      ),
                      const Icon(Icons.north_west,
                          size: 16, color: Colors.grey),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildHighlightedText(String text, String query, ThemeData theme) {
    if (query.isEmpty) {
      return Text(text, style: const TextStyle(fontSize: 14));
    }

    final lowerText = text.toLowerCase();
    final lowerQuery = query.toLowerCase();
    final startIndex = lowerText.indexOf(lowerQuery);

    if (startIndex == -1) {
      return Text(text, style: const TextStyle(fontSize: 14));
    }

    final endIndex = startIndex + query.length;

    return RichText(
      text: TextSpan(
        style: const TextStyle(fontSize: 14, color: Colors.black87),
        children: [
          TextSpan(text: text.substring(0, startIndex)),
          TextSpan(
            text: text.substring(startIndex, endIndex),
            style: const TextStyle(
              color: kBrandBlue,
              fontWeight: FontWeight.bold,
            ),
          ),
          TextSpan(text: text.substring(endIndex)),
        ],
      ),
    );
  }

  // ── Popular services ──────────────────────────────────────────────────────────

  Widget _buildPopularServices(ThemeData theme) {
    const defaultServices = [
      'Plumber',
      'Electrician',
      'Painter',
      'Technician',
      'Carpenter',
      'Cleaner',
    ];

    final services = _categories.isNotEmpty
        ? _categories
            .map((c) => c['name'] as String? ?? '')
            .where((name) => name.isNotEmpty)
            .toList()
        : defaultServices;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader(theme, 'Popular services'),
        if (_loadingCategories)
          const SizedBox(
            height: 40,
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          )
        else
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: services.map((name) {
              return _ServiceChip(
                label: name,
                onTap: () {
                  _search.text = name;
                  _search.selection = TextSelection.fromPosition(
                    TextPosition(offset: name.length),
                  );
                  _submitSearch();
                },
              );
            }).toList(),
          ),
      ],
    );
  }

  // ── Recent jobs ───────────────────────────────────────────────────────────────

  Widget _buildRecentJobs(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader(
          theme,
          'Your recent requests',
          trailing: TextButton.icon(
            onPressed: _loadRecentJobs,
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Refresh'),
            style: TextButton.styleFrom(
              foregroundColor: kBrandBlue,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              visualDensity: VisualDensity.compact,
            ),
          ),
        ),
        if (_loadingJobs)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          )
        else if (_recentJobs.isEmpty)
          _EmptyJobsCard(onCreateRequest: () => _searchFocus.requestFocus())
        else
          Column(
            children: _recentJobs
                .map((job) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _CustomerJobCard(
                        job: job,
                        onTap: () {
                          final id = job['id'];
                          if (id != null) context.push('/jobs/$id');
                        },
                      ),
                    ))
                .toList(),
          ),
      ],
    );
  }

  // ── Smart suggestions banner ──────────────────────────────────────────────────

  Widget _buildSmartSuggestionsBanner(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader(theme, 'How matching works'),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                kBrandBlue.withOpacity(0.10),
                kBrandCyan.withOpacity(0.10),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: kBrandBlue.withOpacity(0.12)),
          ),
          child: Column(
            children: const [
              _SuggestionRow(
                icon: Icons.auto_awesome_rounded,
                text:
                    'AI ranks top-rated providers near you by price, distance and quality.',
              ),
              SizedBox(height: 14),
              _SuggestionRow(
                icon: Icons.my_location_rounded,
                text:
                    'Live tracking starts the moment a provider accepts your job.',
              ),
              SizedBox(height: 14),
              _SuggestionRow(
                icon: Icons.sms_outlined,
                text: "We'll text you when your provider is about 500m away.",
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Top-level supporting widgets ──────────────────────────────────────────────

class _BookingDetails {
  const _BookingDetails({
    required this.location,
    required this.recipientName,
    required this.recipientPhone,
    required this.accessNotes,
    required this.description,
  });

  final JobLocation location;
  final String recipientName;
  final String recipientPhone;
  final String accessNotes;
  final String description;
}

class _BookingDetailsPage extends StatefulWidget {
  const _BookingDetailsPage({
    required this.serviceName,
    required this.initialDescription,
  });

  final String serviceName;
  final String initialDescription;

  @override
  State<_BookingDetailsPage> createState() => _BookingDetailsPageState();
}

class _BookingDetailsPageState extends State<_BookingDetailsPage> {
  final _formKey = GlobalKey<FormState>();
  final _recipientName = TextEditingController();
  final _recipientPhone = TextEditingController();
  final _accessNotes = TextEditingController();
  late final TextEditingController _description;
  final _speech = stt.SpeechToText();
  late JobLocation _location;
  int _step = 0;
  bool _listening = false;
  bool _checkingSpelling = false;
  String? _spellSuggestion;

  @override
  void initState() {
    super.initState();
    _description = TextEditingController(text: widget.initialDescription);
    _location = const JobLocation(
      lat: -1.286389,
      lng: 36.817223,
      address: 'Pin on the map',
    );
  }

  @override
  void dispose() {
    _recipientName.dispose();
    _recipientPhone.dispose();
    _accessNotes.dispose();
    _description.dispose();
    _speech.stop();
    super.dispose();
  }

  String? _validateKenyanPhone(String? value) {
    final normalized = (value ?? '').replaceAll(RegExp(r'[\s+\-()]'), '');
    if (!RegExp(r'^(?:0[17]\d{8}|254[17]\d{8})$').hasMatch(normalized)) {
      return 'Enter a Kenyan number, e.g. 0712 345 678';
    }
    return null;
  }

  String _normalizedPhone() {
    var phone = _recipientPhone.text.replaceAll(RegExp(r'[\s+\-()]'), '');
    if (phone.startsWith('0')) phone = '254${phone.substring(1)}';
    return phone;
  }

  Future<void> _toggleDescriptionSpeech() async {
    if (_listening) {
      await _speech.stop();
      if (mounted) setState(() => _listening = false);
      return;
    }
    final status = await Permission.microphone.request();
    if (!status.isGranted) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text(
                  'Microphone permission is required for voice descriptions.')),
        );
      }
      return;
    }
    final available = await _speech.initialize(
      onStatus: (status) {
        if (mounted && (status == 'done' || status == 'notListening')) {
          setState(() => _listening = false);
        }
      },
      onError: (_) {
        if (mounted) setState(() => _listening = false);
      },
    );
    if (!available) return;
    setState(() => _listening = true);
    await _speech.listen(
      listenFor: const Duration(seconds: 45),
      pauseFor: const Duration(seconds: 4),
      onResult: (result) {
        if (!mounted) return;
        setState(() {
          _description.text = result.recognizedWords;
          _description.selection =
              TextSelection.collapsed(offset: _description.text.length);
        });
      },
    );
  }

  Future<void> _checkDescriptionSpelling() async {
    final text = _description.text.trim();
    if (text.isEmpty) return;
    setState(() => _checkingSpelling = true);
    try {
      final response = await ApiClient.instance.dio.get(
        '/ai/spellcheck/',
        queryParameters: {'input': text},
      );
      final data = response.data;
      final suggestion = data is Map
          ? (data['suggestion'] ?? data['corrected_text'] ?? data['text'])
          : null;
      if (mounted)
        setState(() => _spellSuggestion = suggestion?.toString().trim());
    } catch (_) {
      // Spell checking is a best-effort assist, not a booking blocker.
    } finally {
      if (mounted) setState(() => _checkingSpelling = false);
    }
  }

  void _next() {
    if (_step == 0) {
      if (!_formKey.currentState!.validate()) return;
      setState(() => _step = 1);
      return;
    }
    final description = _description.text.trim();
    if (description.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Describe the problem before finding providers.')),
      );
      return;
    }
    Navigator.of(context).pop(_BookingDetails(
      location: _location,
      recipientName: _recipientName.text.trim(),
      recipientPhone: _normalizedPhone(),
      accessNotes: _accessNotes.text.trim(),
      description: description,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final isLocationStep = _step == 0;
    return Scaffold(
      appBar: AppBar(
        title: Text(isLocationStep
            ? 'Job location & recipient'
            : 'Describe the problem'),
        leading: IconButton(
          icon: Icon(
              isLocationStep ? Icons.close_rounded : Icons.arrow_back_rounded),
          onPressed: () {
            if (isLocationStep) {
              Navigator.of(context).pop();
            } else {
              setState(() => _step = 0);
            }
          },
        ),
      ),
      body: SafeArea(
        // Keep both steps mounted so the Google Map PlatformView is not
        // disposed when moving to the description step (that dispose can
        // hard-kill the Android process).
        child: IndexedStack(
          index: _step.clamp(0, 1),
          children: [
            SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: _buildLocationStep(),
            ),
            SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: _buildDescriptionStep(),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.all(16),
        child: ElevatedButton.icon(
          onPressed: _next,
          icon: Icon(isLocationStep
              ? Icons.arrow_forward_rounded
              : Icons.search_rounded),
          label: Text(isLocationStep
              ? 'Continue to description'
              : 'Find matching providers'),
        ),
      ),
    );
  }

  Widget _buildLocationStep() {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Where should the provider go?',
              style: Theme.of(context)
                  .textTheme
                  .titleLarge
                  ?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          const Text(
              'Search for a landmark or drop the pin at the exact job location.'),
          const SizedBox(height: 16),
          LocationPinPicker(
            onChanged: (location) {
              setState(() => _location = location);
            },
          ),
          const SizedBox(height: 24),
          Text('Who will receive the provider?',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          TextFormField(
            controller: _recipientName,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Recipient name',
              prefixIcon: Icon(Icons.person_outline),
            ),
            validator: (value) => (value ?? '').trim().isEmpty
                ? 'Enter the recipient name'
                : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _recipientPhone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Recipient phone (Kenya)',
              hintText: '0712 345 678',
              prefixIcon: Icon(Icons.phone_outlined),
            ),
            validator: _validateKenyanPhone,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _accessNotes,
            maxLines: 3,
            maxLength: 500,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Access notes (optional)',
              hintText: 'Gate, floor, landmark or other arrival instructions',
              alignLabelWithHint: true,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDescriptionStep() {
    final suggestion = _spellSuggestion;
    final pin = LatLng(_location.lat, _location.lng);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('What needs fixing?',
            style: Theme.of(context)
                .textTheme
                .titleLarge
                ?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        Text(
            'Tell providers about ${widget.serviceName} before they are matched.'),
        const SizedBox(height: 14),
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFBFDBFE)),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
                child: Row(
                  children: [
                    const Icon(Icons.push_pin_rounded, color: Color(0xFF2563EB)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Selected job pin',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                          Text(
                            _location.address,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: Colors.grey.shade700),
                          ),
                        ],
                      ),
                    ),
                    TextButton(
                      onPressed: () => setState(() => _step = 0),
                      child: const Text('Edit'),
                    ),
                  ],
                ),
              ),
              SizedBox(
                height: 150,
                child: AppConfig.enableGoogleMaps
                    ? GoogleMap(
                        key: ValueKey(
                          'booking-pin-${pin.latitude.toStringAsFixed(5)}-${pin.longitude.toStringAsFixed(5)}',
                        ),
                        initialCameraPosition:
                            CameraPosition(target: pin, zoom: 15.2),
                        markers: {
                          Marker(
                            markerId: const MarkerId('booking-pin'),
                            position: pin,
                            icon: BitmapDescriptor.defaultMarkerWithHue(
                              BitmapDescriptor.hueRose,
                            ),
                          ),
                        },
                        myLocationButtonEnabled: false,
                        zoomControlsEnabled: false,
                        compassEnabled: false,
                        mapToolbarEnabled: false,
                        liteModeEnabled: false,
                        scrollGesturesEnabled: false,
                        rotateGesturesEnabled: false,
                        tiltGesturesEnabled: false,
                      )
                    : ColoredBox(
                        color: const Color(0xFFEFF6FF),
                        child: Center(
                          child: Text(
                            '${_location.lat.toStringAsFixed(5)}, ${_location.lng.toStringAsFixed(5)}',
                          ),
                        ),
                      ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _description,
          minLines: 7,
          maxLines: 12,
          maxLength: 2000,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            hintText:
                'Describe the issue, symptoms, timing, and anything the provider should bring.',
            alignLabelWithHint: true,
            suffixIcon: IconButton(
              tooltip: _listening ? 'Stop listening' : 'Describe by voice',
              onPressed: _toggleDescriptionSpeech,
              icon: Icon(_listening
                  ? Icons.stop_circle_outlined
                  : Icons.mic_none_rounded),
            ),
          ),
          onChanged: (_) => setState(() => _spellSuggestion = null),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _checkingSpelling ? null : _checkDescriptionSpelling,
          icon: _checkingSpelling
              ? const SizedBox(
                  height: 16,
                  width: 16,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.spellcheck_rounded),
          label: const Text('Check spelling'),
        ),
        if (suggestion != null &&
            suggestion.isNotEmpty &&
            suggestion.toLowerCase() != _description.text.trim().toLowerCase())
          Align(
            alignment: Alignment.centerLeft,
            child: ActionChip(
              avatar: const Icon(Icons.auto_fix_high, size: 16),
              label: const Text('Use suggested wording'),
              onPressed: () {
                setState(() {
                  _description.text = suggestion;
                  _description.selection =
                      TextSelection.collapsed(offset: suggestion.length);
                  _spellSuggestion = null;
                });
              },
            ),
          ),
        if (_listening)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child:
                Text('Listening… speak naturally and pause when you are done.'),
          ),
      ],
    );
  }
}

class _EmptyJobsCard extends StatelessWidget {
  const _EmptyJobsCard({required this.onCreateRequest});

  final VoidCallback onCreateRequest;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.assignment_outlined, color: kBrandBlue),
          const SizedBox(height: 10),
          const Text(
            'No requests yet',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
          ),
          const SizedBox(height: 4),
          Text(
            'Search for a service above and we will match you with trusted providers nearby.',
            style: TextStyle(color: Colors.grey.shade700),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: onCreateRequest,
            icon: const Icon(Icons.search),
            label: const Text('Find a provider'),
          ),
        ],
      ),
    );
  }
}

class _CustomerJobCard extends StatelessWidget {
  const _CustomerJobCard({required this.job, required this.onTap});

  final Map<String, dynamic> job;
  final VoidCallback onTap;

  String _statusLabel(String raw) {
    switch (raw) {
      case 'pending_provider':
        return 'Waiting for provider';
      case 'accepted':
        return 'Accepted';
      case 'in_progress':
        return 'In progress';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return formatHumanLabel(raw);
    }
  }

  Color _statusColor(String raw) {
    switch (raw) {
      case 'completed':
        return kStatusSuccess;
      case 'in_progress':
      case 'accepted':
        return kStatusInfo;
      case 'cancelled':
        return kStatusDanger;
      default:
        return kStatusWarning;
    }
  }

  String _formatPrice(dynamic value) {
    if (value == null) return 'Quote pending';
    final number = int.tryParse(value.toString());
    if (number == null) return 'Quote pending';
    return 'KSh $number';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = (job['status'] ?? '').toString();
    final statusColor = _statusColor(status);
    final service = (job['category_name'] ?? 'Service request').toString();
    final provider = (job['provider_name'] ?? '').toString();
    final description = (job['description'] ?? '').toString();
    final address = (job['address_text'] ?? 'Nairobi').toString();
    final price = _formatPrice(job['quoted_price']);

    return InkWell(
      borderRadius: BorderRadius.circular(22),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: Colors.grey.shade200),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 14,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: kBrandSurface,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(Icons.home_repair_service_rounded,
                      color: kBrandBlue),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        service,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        provider.isNotEmpty
                            ? 'Provider: $provider'
                            : 'Provider being matched',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: Colors.grey.shade700),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.10),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    _statusLabel(status),
                    style: TextStyle(
                      color: statusColor,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (description.isNotEmpty)
              Text(
                description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyMedium,
              ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _JobMetaPill(
                    icon: Icons.place_outlined,
                    label: address,
                  ),
                ),
                const SizedBox(width: 8),
                _JobMetaPill(
                  icon: Icons.payments_outlined,
                  label: price,
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.auto_awesome, size: 16, color: kBrandBlue),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    status == 'completed'
                        ? 'Completed — open to review details or rating.'
                        : 'Tap to track progress and provider updates.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: Colors.grey.shade700,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: Colors.grey),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _JobMetaPill extends StatelessWidget {
  const _JobMetaPill({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: Colors.grey.shade700),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _ServiceChip extends StatelessWidget {
  const _ServiceChip({
    required this.label,
    required this.onTap,
  });

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = categoryColor(label);
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      elevation: 1.5,
      shadowColor: Colors.black.withOpacity(0.08),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: kBrandSurface),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              CategoryMonogram(name: label, color: color, size: 26),
              const SizedBox(width: 8),
              Text(
                label,
                style: const TextStyle(
                  color: kBrandNavy,
                  fontWeight: FontWeight.w700,
                  fontSize: 13.5,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A rounded-square monogram avatar for a service category. Works for any
/// category name — no icon assets required.
class CategoryMonogram extends StatelessWidget {
  const CategoryMonogram({
    super.key,
    required this.name,
    this.color,
    this.size = 40,
  });

  final String name;
  final Color? color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = color ?? categoryColor(name);
    return Container(
      height: size,
      width: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: c.withOpacity(0.14),
        borderRadius: BorderRadius.circular(size * 0.3),
      ),
      child: Text(
        categoryMonogram(name),
        style: TextStyle(
          color: c,
          fontWeight: FontWeight.w800,
          fontSize: size * 0.4,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}

class _SuggestionRow extends StatelessWidget {
  const _SuggestionRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          height: 34,
          width: 34,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            boxShadow: [
              BoxShadow(
                color: kBrandBlue.withOpacity(0.12),
                blurRadius: 8,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: Icon(icon, size: 18, color: kBrandBlue),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              color: kBrandNavy.withOpacity(0.85),
              height: 1.35,
              fontSize: 13.5,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}

class _FancyInput extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String hint;

  const _FancyInput({
    required this.controller,
    required this.label,
    required this.hint,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: Colors.grey.shade500,
            letterSpacing: 0.4,
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
          decoration: InputDecoration(
            prefixText: 'KSh  ',
            prefixStyle: TextStyle(
              color: Colors.grey.shade400,
              fontWeight: FontWeight.w500,
              fontSize: 13,
            ),
            hintText: hint,
            hintStyle: TextStyle(color: Colors.grey.shade300),
            filled: true,
            fillColor: Colors.grey.shade50,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: Colors.grey.shade200),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: Colors.grey.shade200),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: kBrandBlue, width: 1.5),
            ),
          ),
        ),
      ],
    );
  }
}

class _FancyChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const _FancyChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? kBrandBlue : Colors.grey.shade50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? kBrandBlue : Colors.grey.shade200,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 15,
              color: selected ? Colors.white : Colors.grey.shade500,
            ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  color: selected ? Colors.white : Colors.grey.shade700,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
