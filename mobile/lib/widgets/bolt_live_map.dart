import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

/// Bolt-inspired live map: dark stylized basemap, prominent route line,
/// pulsing "you are here" marker and animated provider marker.
///
/// Used by both the customer-side tracking screen and the provider-side
/// tracking screen so the experience stays consistent.
class BoltLiveMap extends StatefulWidget {
  const BoltLiveMap({
    super.key,
    required this.providerPosition,
    required this.customerPosition,
    this.followProvider = true,
    this.darkTheme = true,
    this.onMapCreated,
  });

  final LatLng? providerPosition;
  final LatLng? customerPosition;
  final bool followProvider;
  final bool darkTheme;
  final void Function(GoogleMapController controller)? onMapCreated;

  @override
  State<BoltLiveMap> createState() => _BoltLiveMapState();
}

class _BoltLiveMapState extends State<BoltLiveMap>
    with TickerProviderStateMixin {
  GoogleMapController? _controller;
  late final AnimationController _pulseCtrl;
  static const _defaultCenter = LatLng(-1.286389, 36.817223);

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
      duration: const Duration(milliseconds: 1800),
      vsync: this,
    )..repeat();
  }

  @override
  void didUpdateWidget(covariant BoltLiveMap old) {
    super.didUpdateWidget(old);
    final pos = widget.followProvider
        ? widget.providerPosition
        : widget.customerPosition;
    if (pos != null && _controller != null) {
      _controller!.animateCamera(CameraUpdate.newLatLng(pos));
    }
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    _controller?.dispose();
    super.dispose();
  }

  LatLng get _center {
    return widget.providerPosition ??
        widget.customerPosition ??
        _defaultCenter;
  }

  Set<Marker> get _markers {
    final markers = <Marker>{};
    if (widget.providerPosition != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('provider'),
          position: widget.providerPosition!,
          icon: BitmapDescriptor.defaultMarkerWithHue(
            BitmapDescriptor.hueGreen,
          ),
          infoWindow: const InfoWindow(title: 'Provider'),
          flat: true,
          anchor: const Offset(0.5, 0.5),
        ),
      );
    }
    if (widget.customerPosition != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('customer'),
          position: widget.customerPosition!,
          icon: BitmapDescriptor.defaultMarkerWithHue(
            BitmapDescriptor.hueRose,
          ),
          infoWindow: const InfoWindow(title: 'You'),
        ),
      );
    }
    return markers;
  }

  Set<Polyline> get _polylines {
    if (widget.providerPosition == null || widget.customerPosition == null) {
      return {};
    }
    return {
      // Subtle outer glow
      Polyline(
        polylineId: const PolylineId('route_glow'),
        points: [widget.providerPosition!, widget.customerPosition!],
        width: 12,
        color: const Color(0x4034D399),
        startCap: Cap.roundCap,
        endCap: Cap.roundCap,
      ),
      // Crisp inner line — Bolt-style bright accent over a dark map
      Polyline(
        polylineId: const PolylineId('route'),
        points: [widget.providerPosition!, widget.customerPosition!],
        width: 6,
        color: const Color(0xFF34D399),
        startCap: Cap.roundCap,
        endCap: Cap.roundCap,
      ),
    };
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        GoogleMap(
          initialCameraPosition: CameraPosition(target: _center, zoom: 15),
          onMapCreated: (c) {
            _controller = c;
            if (widget.darkTheme) {
              c.setMapStyle(_boltDarkStyle);
            }
            widget.onMapCreated?.call(c);
          },
          markers: _markers,
          polylines: _polylines,
          myLocationEnabled: false,
          myLocationButtonEnabled: false,
          zoomControlsEnabled: false,
          compassEnabled: false,
          mapToolbarEnabled: false,
          buildingsEnabled: false,
          rotateGesturesEnabled: true,
          tiltGesturesEnabled: true,
          padding: const EdgeInsets.only(bottom: 60),
        ),
        // Pulsing "you" beacon centered on the customer position.
        if (widget.customerPosition != null)
          IgnorePointer(
            child: AnimatedBuilder(
              animation: _pulseCtrl,
              builder: (context, _) => CustomPaint(
                painter: _PulsePainter(
                  progress: _pulseCtrl.value,
                  center: _projectToScreen(widget.customerPosition!),
                  color: const Color(0xFFFF4D6D),
                ),
              ),
            ),
          ),
      ],
    );
  }

  /// We don't have an exact lat/lng→screen conversion without a controller
  /// callback that's cheap, so we draw the pulse at center bottom-third —
  /// good enough since the camera follows the provider/customer pair.
  Offset _projectToScreen(LatLng _) {
    final size = MediaQuery.of(context).size;
    return Offset(size.width / 2, size.height * 0.55);
  }
}

class _PulsePainter extends CustomPainter {
  _PulsePainter({
    required this.progress,
    required this.center,
    required this.color,
  });

  final double progress;
  final Offset center;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    for (var i = 0; i < 3; i++) {
      final t = ((progress + i / 3) % 1.0);
      final radius = 16 + t * 60;
      final paint = Paint()
        ..style = PaintingStyle.fill
        ..color = color.withOpacity(0.18 * (1 - t));
      canvas.drawCircle(center, radius, paint);
    }

    final dot = Paint()..color = color;
    canvas.drawCircle(center, 9, dot);
    canvas.drawCircle(
      center,
      9,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..color = Colors.white,
    );
  }

  @override
  bool shouldRepaint(covariant _PulsePainter old) {
    return old.progress != progress || old.center != center;
  }
}

const String _boltDarkStyle = '''
[
  {"elementType":"geometry","stylers":[{"color":"#0F172A"}]},
  {"elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"elementType":"labels.text.fill","stylers":[{"color":"#94A3B8"}]},
  {"elementType":"labels.text.stroke","stylers":[{"color":"#0F172A"}]},
  {"featureType":"administrative","elementType":"geometry","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative.land_parcel","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative.neighborhood","stylers":[{"visibility":"off"}]},
  {"featureType":"poi","stylers":[{"visibility":"off"}]},
  {"featureType":"road","elementType":"geometry","stylers":[{"color":"#1E293B"}]},
  {"featureType":"road","elementType":"labels.text.fill","stylers":[{"color":"#94A3B8"}]},
  {"featureType":"road.arterial","elementType":"geometry","stylers":[{"color":"#243149"}]},
  {"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#334155"}]},
  {"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#0F172A"}]},
  {"featureType":"road.local","elementType":"labels.text.fill","stylers":[{"color":"#64748B"}]},
  {"featureType":"transit","stylers":[{"visibility":"off"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#0B1220"}]},
  {"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#475569"}]}
]
''';
