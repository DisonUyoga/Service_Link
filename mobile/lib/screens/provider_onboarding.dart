import 'dart:async';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/dio_client.dart';
import '../services/auth_service.dart';

class ProviderOnboardingScreen extends StatefulWidget {
  const ProviderOnboardingScreen({super.key});

  @override
  State<ProviderOnboardingScreen> createState() =>
      _ProviderOnboardingScreenState();
}

class _ProviderOnboardingScreenState extends State<ProviderOnboardingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _bioController = TextEditingController();
  final _phoneController = TextEditingController();
  final _mpesaController = TextEditingController();
  final _radiusController = TextEditingController(text: '10');
  final _priceMinController = TextEditingController(text: '500');
  final _priceMaxController = TextEditingController(text: '2500');
  final _idNumberController = TextEditingController();
  final _areaController = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  bool _termsAccepted = false;
  String _idKind = 'national_id';
  String? _error;
  int? _categoryId;
  PlatformFile? _idDocument;
  PlatformFile? _goodConduct;
  Map<String, dynamic>? _terms;
  List<Map<String, dynamic>> _categories = [];
  List<Map<String, dynamic>> _placePredictions = [];
  String? _areaPlaceId;
  String? _areaAddress;
  double? _baseLat;
  double? _baseLng;
  Timer? _placeDebounce;

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  @override
  void dispose() {
    _placeDebounce?.cancel();
    for (final controller in [
      _bioController,
      _phoneController,
      _mpesaController,
      _radiusController,
      _priceMinController,
      _priceMaxController,
      _idNumberController,
      _areaController,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  int? _parseInt(String value) => int.tryParse(value.trim());

  Future<void> _loadInitialData() async {
    try {
      final dio = ApiClient.instance.dio;
      final responses = await Future.wait([
        dio.get('/services/categories/'),
        dio.get('/services/providers/me/'),
        dio.get('/legal/terms/', queryParameters: {'audience': 'provider'}),
        dio.get('/services/providers/me/documents/'),
      ]);
      final profile = Map<String, dynamic>.from(responses[1].data as Map);
      final category = profile['category'] is Map
          ? Map<String, dynamic>.from(profile['category'] as Map)
          : null;
      if (!mounted) return;
      setState(() {
        _categories = (responses[0].data as List<dynamic>)
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
        _categoryId = (category?['id'] ?? profile['category_id']) as int?;
        _terms = Map<String, dynamic>.from(responses[2].data as Map);
        _bioController.text = (profile['bio'] ?? '').toString();
        _phoneController.text = AuthService.instance.phoneNumber ?? '';
        _mpesaController.text =
            (profile['mpesa_till_or_paybill'] ?? '').toString();
        _radiusController.text =
            (profile['service_radius_km'] ?? 10).toString();
        _priceMinController.text = (profile['price_min'] ?? 500).toString();
        _priceMaxController.text = (profile['price_max'] ?? 2500).toString();
        _idNumberController.text =
            (profile['id_document_number'] ?? '').toString();
        _idKind = (profile['id_document_kind'] ?? 'national_id').toString();
        _areaPlaceId = profile['area_place_id']?.toString();
        _areaAddress = profile['area_formatted_address']?.toString();
        _areaController.text = _areaAddress ?? '';
        _baseLat = (profile['base_lat'] as num?)?.toDouble();
        _baseLng = (profile['base_lng'] as num?)?.toDouble();
      });
    } catch (_) {
      if (mounted) {
        setState(() =>
            _error = 'Unable to load onboarding information. Please retry.');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _searchPlaces(String input) async {
    if (input.trim().length < 2) {
      if (mounted) {
        setState(() => _placePredictions = []);
      }
      return;
    }
    try {
      final response = await ApiClient.instance.dio.get(
        '/services/places/',
        queryParameters: {'input': input},
      );
      if (mounted) {
        setState(() {
          _placePredictions =
              ((response.data as Map)['predictions'] as List<dynamic>? ?? [])
                  .map((item) => Map<String, dynamic>.from(item as Map))
                  .toList();
        });
      }
    } catch (_) {
      // Leave the typed address usable; location selection remains required.
    }
  }

  Future<void> _selectPlace(Map<String, dynamic> place) async {
    try {
      final response = await ApiClient.instance.dio.get(
        '/services/places/',
        queryParameters: {'mode': 'details', 'place_id': place['place_id']},
      );
      final details = Map<String, dynamic>.from(response.data as Map);
      if (!mounted) return;
      setState(() {
        _areaPlaceId = details['place_id']?.toString();
        _areaAddress = details['formatted_address']?.toString();
        _areaController.text = _areaAddress ?? place['description'].toString();
        _baseLat = (details['lat'] as num?)?.toDouble();
        _baseLng = (details['lng'] as num?)?.toDouble();
        _placePredictions = [];
      });
    } on DioException catch (_) {
      if (mounted) {
        setState(() =>
            _error = 'Could not use that place. Please choose another result.');
      }
    }
  }

  Future<void> _pickDocument(bool isId) async {
    final result = await FilePicker.platform
        .pickFiles(type: FileType.any, withData: false);
    if (result?.files.isNotEmpty == true && mounted) {
      setState(() {
        if (isId) {
          _idDocument = result!.files.first;
        } else {
          _goodConduct = result!.files.first;
        }
      });
    }
  }

  Future<void> _uploadDocument(
      PlatformFile document, String documentType, String title) async {
    if (document.path == null || document.path!.isEmpty) {
      throw StateError('The selected document could not be read.');
    }
    await ApiClient.instance.dio.post(
      '/services/providers/me/documents/',
      data: FormData.fromMap({
        'title': title,
        'document_type': documentType,
        'file': await MultipartFile.fromFile(document.path!,
            filename: document.name),
      }),
    );
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_categoryId == null || _idDocument == null || !_termsAccepted) {
      setState(() => _error = _categoryId == null
          ? 'Choose your service category.'
          : _idDocument == null
              ? 'A national ID or passport photo is required.'
              : 'You must accept the Terms of Service.');
      return;
    }
    if (_areaPlaceId == null || _baseLat == null || _baseLng == null) {
      setState(() =>
          _error = 'Select your area of operation from the place suggestions.');
      return;
    }
    final min = _parseInt(_priceMinController.text);
    final max = _parseInt(_priceMaxController.text);
    if (min == null || max == null || min > max) {
      setState(() => _error = 'Enter a valid price range.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final phoneOk = await AuthService.instance
          .updatePhoneNumber(_phoneController.text.trim());
      if (!phoneOk) {
        throw StateError('Could not save your phone number.');
      }
      final dio = ApiClient.instance.dio;
      await dio.put('/services/providers/me/', data: {
        'category_id': _categoryId,
        'bio': _bioController.text.trim(),
        'base_lat': _baseLat,
        'base_lng': _baseLng,
        'area_place_id': _areaPlaceId,
        'area_formatted_address': _areaAddress,
        'service_radius_km': _parseInt(_radiusController.text),
        'price_min': min,
        'price_max': max,
        'average_response_minutes': 15,
        'current_status': 'available',
        'mpesa_till_or_paybill': _mpesaController.text.trim(),
        'id_document_number': _idNumberController.text.trim(),
        'id_document_kind': _idKind,
      });
      await _uploadDocument(
          _idDocument!, 'national_id_or_passport', '$_idKind identification');
      if (_goodConduct != null) {
        await _uploadDocument(
            _goodConduct!, 'good_conduct', 'Good conduct certificate');
      }
      await dio.post('/legal/terms/', data: {
        'terms_version_id': _terms?['id'],
        'client_meta': {'surface': 'provider_onboarding'},
      });
      await AuthService.instance.refreshProviderProfileStatus();
      await AuthService.instance.markProviderProfileCompleted();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text(
                'Profile saved. Your documents are awaiting admin review.')),
      );
      context.go('/provider-dashboard');
    } catch (e) {
      if (mounted) {
        setState(() => _error = e is DioException
            ? ApiClient.messageFrom(e,
                fallback: 'Failed to save onboarding information.')
            : e.toString().replaceFirst('Bad state: ', ''));
      }
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Provider onboarding')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _formKey,
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text(
                  'Complete your profile and KYC. You will be able to use S-Link while your verification awaits admin review.'),
              const SizedBox(height: 16),
              DropdownButtonFormField<int>(
                initialValue: _categoryId,
                decoration:
                    const InputDecoration(labelText: 'Service category'),
                items: _categories
                    .map((category) => DropdownMenuItem(
                          value: category['id'] as int,
                          child: Text(category['name'].toString()),
                        ))
                    .toList(),
                onChanged: (value) => setState(() => _categoryId = value),
                validator: (value) => value == null ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  decoration:
                      const InputDecoration(labelText: 'Phone number (SMS)'),
                  validator: (value) =>
                      (value ?? '').replaceAll(RegExp(r'[\s+\-]'), '').length <
                              10
                          ? 'Enter a valid phone number'
                          : null),
              const SizedBox(height: 12),
              TextFormField(
                  controller: _bioController,
                  maxLines: 3,
                  decoration:
                      const InputDecoration(labelText: 'Expertise & bio'),
                  validator: (value) => value == null || value.trim().isEmpty
                      ? 'Tell customers about your expertise'
                      : null),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                    child: TextFormField(
                        controller: _priceMinController,
                        keyboardType: TextInputType.number,
                        decoration:
                            const InputDecoration(labelText: 'Min price'),
                        validator: (value) => _parseInt(value ?? '') == null
                            ? 'Required'
                            : null)),
                const SizedBox(width: 12),
                Expanded(
                    child: TextFormField(
                        controller: _priceMaxController,
                        keyboardType: TextInputType.number,
                        decoration:
                            const InputDecoration(labelText: 'Max price'),
                        validator: (value) => _parseInt(value ?? '') == null
                            ? 'Required'
                            : null)),
              ]),
              const SizedBox(height: 12),
              TextFormField(
                  controller: _radiusController,
                  keyboardType: TextInputType.number,
                  decoration:
                      const InputDecoration(labelText: 'Service radius (km)'),
                  validator: (value) =>
                      _parseInt(value ?? '') == null ? 'Required' : null),
              const SizedBox(height: 12),
              TextFormField(
                  controller: _mpesaController,
                  decoration: const InputDecoration(
                      labelText: 'M-Pesa Till / Paybill')),
              const SizedBox(height: 24),
              Text('Area of operation',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              TextFormField(
                controller: _areaController,
                decoration: const InputDecoration(
                    labelText: 'Search a town, estate, or address',
                    prefixIcon: Icon(Icons.location_on_outlined)),
                onChanged: (input) {
                  _placeDebounce?.cancel();
                  _placeDebounce = Timer(const Duration(milliseconds: 350),
                      () => _searchPlaces(input));
                },
                validator: (_) => _areaPlaceId == null
                    ? 'Select an area from suggestions'
                    : null,
              ),
              ..._placePredictions.map((place) => ListTile(
                    leading: const Icon(Icons.place_outlined),
                    title: Text(place['main_text']?.toString() ??
                        place['description'].toString()),
                    subtitle: Text(place['secondary_text']?.toString() ?? ''),
                    onTap: () => _selectPlace(place),
                  )),
              if (_areaPlaceId != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('Selected: $_areaAddress',
                      style: const TextStyle(color: Colors.green)),
                ),
              const SizedBox(height: 24),
              Text('Identity verification',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _idKind,
                decoration: const InputDecoration(labelText: 'Document kind'),
                items: const [
                  DropdownMenuItem(
                      value: 'national_id', child: Text('National ID')),
                  DropdownMenuItem(value: 'passport', child: Text('Passport')),
                ],
                onChanged: (value) =>
                    setState(() => _idKind = value ?? 'national_id'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                  controller: _idNumberController,
                  decoration:
                      const InputDecoration(labelText: 'ID or passport number'),
                  validator: (value) => value == null || value.trim().isEmpty
                      ? 'Required'
                      : null),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                  onPressed: () => _pickDocument(true),
                  icon: const Icon(Icons.badge_outlined),
                  label: Text(_idDocument == null
                      ? 'Upload ID / passport photo *'
                      : _idDocument!.name)),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                  onPressed: () => _pickDocument(false),
                  icon: const Icon(Icons.verified_user_outlined),
                  label: Text(_goodConduct == null
                      ? 'Upload good conduct certificate (optional)'
                      : _goodConduct!.name)),
              const SizedBox(height: 16),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _termsAccepted,
                onChanged: _terms == null
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
                                          '')
                                      .toString())),
                              actions: [
                                TextButton(
                                    onPressed: () => Navigator.pop(context),
                                    child: const Text('Close'))
                              ],
                            ),
                          ),
                  child: const Text('Read terms'),
                ),
                controlAffinity: ListTileControlAffinity.leading,
              ),
              if (_error != null)
                Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(_error!,
                        style: const TextStyle(color: Colors.red))),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Save and submit for review'),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
