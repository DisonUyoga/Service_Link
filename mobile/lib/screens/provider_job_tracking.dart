import 'dart:async';

import 'package:dio/dio.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../api/dio_client.dart';
import '../config/app_config.dart';
import '../widgets/bolt_live_map.dart';

class ProviderJobTrackingScreen extends StatefulWidget {
  final int jobId;

  const ProviderJobTrackingScreen({
    super.key,
    required this.jobId,
  });

  @override
  State<ProviderJobTrackingScreen> createState() =>
      _ProviderJobTrackingScreenState();
}

class _ProviderJobTrackingScreenState extends State<ProviderJobTrackingScreen> {
  GoogleMapController? _mapController;
  StreamSubscription<Position>? _positionSub;

  Map<String, dynamic>? _job;
  LatLng? _providerPosition;
  LatLng? _customerPosition;

  bool _loading = true;
  bool _streaming = false;
  bool _actionLoading = false;
  String? _error;

  int? get _providerId => _job?['provider'] as int?;
  String get _status => (_job?['status'] ?? '').toString();

  @override
  void initState() {
    super.initState();
    _loadJob();
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    _mapController?.dispose();
    super.dispose();
  }

  Future<void> _loadJob() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await ApiClient.instance.dio.get(
        '/services/jobs/${widget.jobId}/',
      );

      final job = Map<String, dynamic>.from(response.data as Map);

      final customerLat = (job['location_lat'] as num?)?.toDouble();
      final customerLng = (job['location_lng'] as num?)?.toDouble();

      setState(() {
        _job = job;
        if (customerLat != null && customerLng != null) {
          _customerPosition = LatLng(customerLat, customerLng);
        }
      });

      if (_status == 'accepted' || _status == 'in_progress') {
        await _startLiveTracking();
      }
    } catch (e) {
      setState(() {
        _error = 'Failed to load this order.';
      });
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<bool> _ensureLocationPermission() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();

    if (!serviceEnabled) {
      setState(() {
        _error = 'Location services are off. Please enable GPS.';
      });
      return false;
    }

    LocationPermission permission = await Geolocator.checkPermission();

    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.denied) {
      setState(() {
        _error = 'Location permission is required for live tracking.';
      });
      return false;
    }

    if (permission == LocationPermission.deniedForever) {
      setState(() {
        _error =
            'Location permission is permanently denied. Enable it from app settings.';
      });
      return false;
    }

    return true;
  }

  Future<void> _startLiveTracking() async {
    if (_streaming) return;

    final providerId = _providerId;

    if (providerId == null) {
      setState(() {
        _error = 'This order has no assigned provider.';
      });
      return;
    }

    final allowed = await _ensureLocationPermission();

    if (!allowed) return;

    if (_status == 'accepted') {
      await _markInProgress();
    }

    final firstPosition = await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.bestForNavigation,
    );

    await _handlePosition(firstPosition);

    const locationSettings = LocationSettings(
      accuracy: LocationAccuracy.bestForNavigation,
      distanceFilter: 5,
    );

    _positionSub?.cancel();

    _positionSub = Geolocator.getPositionStream(
      locationSettings: locationSettings,
    ).listen(
      _handlePosition,
      onError: (_) {
        setState(() {
          _error = 'Live GPS stream stopped. Check location permissions.';
          _streaming = false;
        });
      },
    );

    setState(() {
      _streaming = true;
      _error = null;
    });
  }

  Future<void> _stopLiveTracking() async {
    await _positionSub?.cancel();

    setState(() {
      _positionSub = null;
      _streaming = false;
    });
  }

  Future<void> _handlePosition(Position position) async {
    final providerId = _providerId;

    if (providerId == null) return;

    final latLng = LatLng(position.latitude, position.longitude);

    setState(() {
      _providerPosition = latLng;
    });

    _mapController?.animateCamera(
      CameraUpdate.newLatLng(latLng),
    );

    final payload = {
      'job_id': widget.jobId,
      'provider_id': providerId,
      'latitude': position.latitude,
      'longitude': position.longitude,
      'accuracy': position.accuracy,
      'heading': position.heading,
      'speed': position.speed,
      'timestamp': ServerValue.timestamp,
    };

    await FirebaseDatabase.instance
        .ref('jobs/${widget.jobId}/provider_location')
        .set(payload);

    await FirebaseDatabase.instance
        .ref('drivers/$providerId/coordinates')
        .set(payload);

    try {
      await ApiClient.instance.dio.post(
        '/services/jobs/${widget.jobId}/update_location/',
        data: {
          'lat': position.latitude,
          'lng': position.longitude,
        },
      );
    } catch (_) {
      // Firebase is the real-time channel. Backend save failure should not
      // stop the live map during an active job.
    }
  }

  Future<void> _markInProgress() async {
    try {
      await ApiClient.instance.dio.post(
        '/services/jobs/${widget.jobId}/start_trip/',
      );

      final response = await ApiClient.instance.dio.get(
        '/services/jobs/${widget.jobId}/',
      );

      setState(() {
        _job = Map<String, dynamic>.from(response.data as Map);
      });
    } catch (_) {
      // If backend does not yet have start_trip, tracking still continues
      // because update_location allows accepted jobs too.
    }
  }

  Future<void> _completeJob() async {
    setState(() {
      _actionLoading = true;
      _error = null;
    });

    try {
      await ApiClient.instance.dio.post(
        '/services/jobs/${widget.jobId}/complete/',
      );

      await _stopLiveTracking();

      await FirebaseDatabase.instance
          .ref('jobs/${widget.jobId}/provider_location/status')
          .set('completed');

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Order completed')),
      );

      Navigator.of(context).pop();
    } on DioException catch (e) {
      setState(() {
        _error = e.response?.data?.toString() ?? 'Failed to complete order.';
      });
    } finally {
      if (mounted) {
        setState(() => _actionLoading = false);
      }
    }
  }

  double? get _distanceKm {
    if (_providerPosition == null || _customerPosition == null) return null;

    final meters = Geolocator.distanceBetween(
      _providerPosition!.latitude,
      _providerPosition!.longitude,
      _customerPosition!.latitude,
      _customerPosition!.longitude,
    );

    return meters / 1000;
  }

  int? get _etaMinutes {
    final distance = _distanceKm;

    if (distance == null) return null;

    const averageUrbanSpeedKmh = 25.0;
    final hours = distance / averageUrbanSpeedKmh;

    return (hours * 60).ceil().clamp(1, 999);
  }

  Set<Marker> get _markers {
    final markers = <Marker>{};

    if (_providerPosition != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('provider'),
          position: _providerPosition!,
          infoWindow: const InfoWindow(title: 'You'),
          icon: BitmapDescriptor.defaultMarkerWithHue(
            BitmapDescriptor.hueGreen,
          ),
        ),
      );
    }

    if (_customerPosition != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('customer'),
          position: _customerPosition!,
          infoWindow: const InfoWindow(title: 'Client'),
          icon: BitmapDescriptor.defaultMarkerWithHue(
            BitmapDescriptor.hueRed,
          ),
        ),
      );
    }

    return markers;
  }

  Set<Polyline> get _polylines {
    if (_providerPosition == null || _customerPosition == null) return {};

    return {
      Polyline(
        polylineId: const PolylineId('provider_to_customer'),
        points: [_providerPosition!, _customerPosition!],
        width: 5,
      ),
    };
  }

  LatLng get _initialCenter {
    return _providerPosition ??
        _customerPosition ??
        const LatLng(-1.286389, 36.817223);
  }

  @override
  Widget build(BuildContext context) {
    final distance = _distanceKm;
    final eta = _etaMinutes;

    return Scaffold(
      appBar: AppBar(
        title: Text('Live tracking #${widget.jobId}'),
        actions: [
          IconButton(
            onPressed: _loadJob,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Expanded(
                  child: AppConfig.enableGoogleMaps
                      ? BoltLiveMap(
                          providerPosition: _providerPosition,
                          customerPosition: _customerPosition,
                          followProvider: true,
                          onMapCreated: (controller) {
                            _mapController = controller;
                          },
                        )
                      : _TrackingFallback(
                          providerPosition: _providerPosition,
                          customerPosition: _customerPosition,
                          streaming: _streaming,
                        ),
                ),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    boxShadow: [
                      BoxShadow(
                        blurRadius: 12,
                        offset: const Offset(0, -4),
                        color: Colors.black.withOpacity(0.08),
                      ),
                    ],
                  ),
                  child: SafeArea(
                    top: false,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _streaming
                              ? 'Live tracking is active'
                              : 'Live tracking is not active',
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          distance == null || eta == null
                              ? 'Waiting for GPS location...'
                              : 'Distance to client: ${distance.toStringAsFixed(2)} km · ETA: about $eta min',
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            _error!,
                            style: const TextStyle(color: Colors.red),
                          ),
                        ],
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: _streaming
                                    ? _stopLiveTracking
                                    : _startLiveTracking,
                                icon: Icon(
                                  _streaming
                                      ? Icons.pause
                                      : Icons.play_arrow,
                                ),
                                label: Text(
                                  _streaming
                                      ? 'Pause tracking'
                                      : 'Start tracking',
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: ElevatedButton.icon(
                                onPressed:
                                    _actionLoading ? null : _completeJob,
                                icon: const Icon(Icons.flag),
                                label: const Text('Complete'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class _TrackingFallback extends StatelessWidget {
  final LatLng? providerPosition;
  final LatLng? customerPosition;
  final bool streaming;

  const _TrackingFallback({
    required this.providerPosition,
    required this.customerPosition,
    required this.streaming,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Card(
        margin: const EdgeInsets.all(18),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                streaming
                    ? Icons.location_searching
                    : Icons.location_disabled,
                size: 42,
              ),
              const SizedBox(height: 12),
              Text(
                streaming
                    ? 'Live location is streaming'
                    : 'Tracking is paused',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 12),
              if (providerPosition != null) ...[
                Text(
                  'Provider: ${providerPosition!.latitude.toStringAsFixed(6)}, '
                  '${providerPosition!.longitude.toStringAsFixed(6)}',
                ),
              ],
              if (customerPosition != null) ...[
                const SizedBox(height: 6),
                Text(
                  'Client: ${customerPosition!.latitude.toStringAsFixed(6)}, '
                  '${customerPosition!.longitude.toStringAsFixed(6)}',
                ),
              ],
              const SizedBox(height: 12),
              const Text(
                'Google Map preview is disabled. Enable Google Maps to see the moving marker.',
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}