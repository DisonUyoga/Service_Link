import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../api/dio_client.dart';
import '../config/app_config.dart';
import 'modern_ui.dart';

/// The delivery/job location selected by the customer, never device GPS.
class JobLocation {
  const JobLocation({
    required this.lat,
    required this.lng,
    required this.address,
    this.placeId,
  });

  final double lat;
  final double lng;
  final String address;
  final String? placeId;
}

/// A map-first job location selector with server-backed Google Places search.
class LocationPinPicker extends StatefulWidget {
  const LocationPinPicker({
    super.key,
    required this.onChanged,
    this.initialLocation,
  });

  final ValueChanged<JobLocation> onChanged;
  final JobLocation? initialLocation;

  @override
  State<LocationPinPicker> createState() => _LocationPinPickerState();
}

class _LocationPinPickerState extends State<LocationPinPicker> {
  late JobLocation _location;
  final _address = TextEditingController();
  Timer? _debounce;
  bool _loading = false;
  List<Map<String, dynamic>> _predictions = [];

  @override
  void initState() {
    super.initState();
    _location = widget.initialLocation ??
        const JobLocation(
          lat: AppConfig.fallbackLat,
          lng: AppConfig.fallbackLng,
          address: 'Pin on the map',
        );
    _address.text = _location.address;
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _address.dispose();
    super.dispose();
  }

  void _setLocation(JobLocation location) {
    setState(() {
      _location = location;
      _address.text = location.address;
      _predictions = [];
    });
    widget.onChanged(location);
  }

  void _search(String input) {
    _debounce?.cancel();
    if (input.trim().length < 2) {
      setState(() => _predictions = []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      setState(() => _loading = true);
      try {
        final response = await ApiClient.instance.dio.get(
          '/services/places/',
          queryParameters: {'mode': 'autocomplete', 'input': input.trim()},
        );
        final data = response.data;
        final raw =
            data is Map ? (data['predictions'] ?? data['results'] ?? []) : data;
        if (!mounted || raw is! List) return;
        setState(() {
          _predictions = raw
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList();
        });
      } catch (_) {
        if (mounted) setState(() => _predictions = []);
      } finally {
        if (mounted) setState(() => _loading = false);
      }
    });
  }

  Future<void> _selectPrediction(Map<String, dynamic> prediction) async {
    final placeId = (prediction['place_id'] ?? prediction['id'])?.toString();
    final fallbackAddress =
        (prediction['description'] ?? prediction['formatted_address'] ?? '')
            .toString();
    if (placeId == null || placeId.isEmpty) return;
    setState(() => _loading = true);
    try {
      final response = await ApiClient.instance.dio.get(
        '/services/places/',
        queryParameters: {'mode': 'details', 'place_id': placeId},
      );
      final data = response.data is Map
          ? Map<String, dynamic>.from(response.data as Map)
          : <String, dynamic>{};
      final result = data['result'] is Map
          ? Map<String, dynamic>.from(data['result'] as Map)
          : data;
      final geometry = result['geometry'] is Map
          ? Map<String, dynamic>.from(result['geometry'] as Map)
          : <String, dynamic>{};
      final point = geometry['location'] is Map
          ? Map<String, dynamic>.from(geometry['location'] as Map)
          : result;
      final lat = (point['lat'] as num?)?.toDouble();
      final lng = (point['lng'] as num?)?.toDouble();
      if (lat == null || lng == null) throw const FormatException();
      _setLocation(JobLocation(
        lat: lat,
        lng: lng,
        address: (result['formatted_address'] ?? fallbackAddress).toString(),
        placeId: (result['place_id'] ?? placeId).toString(),
      ));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text(
                  'Could not load that place. Try pinning it on the map.')),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pin = LatLng(_location.lat, _location.lng);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const GradientIconBubble(icon: Icons.location_on_rounded, size: 42),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Job location',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: kBrandNavy,
                        ),
                  ),
                  const SizedBox(height: 2),
                  const Text(
                    'Search Kenya or drop the pin precisely',
                    style: TextStyle(color: Color(0xFF58718C), fontSize: 13),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _address,
          onChanged: _search,
          decoration: InputDecoration(
            labelText: 'Search a location',
            hintText: 'Estate, building, road or landmark',
            prefixIcon: const Icon(Icons.search_rounded),
            suffixIcon: _loading
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                : null,
          ),
        ),
        if (_predictions.isNotEmpty)
          Material(
            elevation: 2,
            borderRadius: BorderRadius.circular(12),
            child: ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _predictions.length.clamp(0, 5),
              itemBuilder: (context, index) {
                final prediction = _predictions[index];
                return ListTile(
                  dense: true,
                  leading: const Icon(Icons.location_on_outlined),
                  title: Text(
                    (prediction['description'] ??
                            prediction['formatted_address'] ??
                            '')
                        .toString(),
                  ),
                  onTap: () => _selectPrediction(prediction),
                );
              },
            ),
          ),
        const SizedBox(height: 12),
        SizedBox(
          height: 300,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: Stack(
              children: [
                GoogleMap(
                  initialCameraPosition:
                      CameraPosition(target: pin, zoom: 15.5),
                  markers: {
                    Marker(
                      markerId: const MarkerId('job-location'),
                      position: pin,
                      draggable: true,
                      icon: BitmapDescriptor.defaultMarkerWithHue(
                        BitmapDescriptor.hueAzure,
                      ),
                      onDragEnd: (point) => _setLocation(JobLocation(
                        lat: point.latitude,
                        lng: point.longitude,
                        address: _address.text.trim().isEmpty
                            ? 'Dropped map pin'
                            : _address.text.trim(),
                        placeId: null,
                      )),
                    ),
                  },
                  onTap: (point) => _setLocation(JobLocation(
                    lat: point.latitude,
                    lng: point.longitude,
                    address: _address.text.trim().isEmpty
                        ? 'Dropped map pin'
                        : _address.text.trim(),
                    placeId: null,
                  )),
                  myLocationButtonEnabled: false,
                  zoomControlsEnabled: false,
                  compassEnabled: false,
                  mapToolbarEnabled: false,
                  mapType: MapType.normal,
                ),
                Positioned(
                  top: 12,
                  left: 12,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.94),
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.12),
                          blurRadius: 14,
                          offset: const Offset(0, 5),
                        ),
                      ],
                    ),
                    child: const Padding(
                      padding:
                          EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.touch_app_rounded,
                              color: kBrandBlue, size: 17),
                          SizedBox(width: 6),
                          Text(
                            'Tap map or drag pin',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 12,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: kBrandNavy.withValues(alpha: 0.92),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          const Icon(Icons.push_pin_rounded, color: kBrandCyan),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              _location.address,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
