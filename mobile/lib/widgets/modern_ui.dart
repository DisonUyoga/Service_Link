import 'package:flutter/material.dart';

/// S-Link brand palette — single source of truth for app colors.
const kBrandBlue = Color(0xFF0082D6);
const kBrandBlueDark = Color(0xFF0058A3);
const kBrandBlueLight = Color(0xFF2EA4FF);
const kBrandCyan = Color(0xFF24C6DC);
const kBrandNavy = Color(0xFF102A43);
const kSoftBackground = Color(0xFFF5F8FC);
const kBrandSurface = Color(0xFFE6F2FF);

/// Status colors used across job lifecycle.
const kStatusSuccess = Color(0xFF1B8A3B);
const kStatusInfo = kBrandBlue;
const kStatusWarning = Color(0xFFB7791F);
const kStatusDanger = Color(0xFFC0392B);

/// Brand gradient (used for primary CTAs and the home header).
const kBrandGradient = LinearGradient(
  colors: [kBrandBlue, kBrandBlueLight, kBrandCyan],
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
);

class AnimatedEntrance extends StatelessWidget {
  const AnimatedEntrance({
    super.key,
    required this.child,
    this.delay = Duration.zero,
    this.offset = const Offset(0, 18),
  });

  final Widget child;
  final Duration delay;
  final Offset offset;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: 520 + delay.inMilliseconds),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) {
        final delayed = delay.inMilliseconds == 0
            ? value
            : ((value * (520 + delay.inMilliseconds) - delay.inMilliseconds) / 520).clamp(0.0, 1.0);
        return Opacity(
          opacity: delayed,
          child: Transform.translate(
            offset: Offset(offset.dx * (1 - delayed), offset.dy * (1 - delayed)),
            child: child,
          ),
        );
      },
      child: child,
    );
  }
}

class ModernCard extends StatelessWidget {
  const ModernCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.onTap,
    this.color = Colors.white,
    this.radius = 24,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color color;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final card = AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
      padding: padding,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: Colors.white.withOpacity(0.65)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.07),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: child,
    );

    if (onTap == null) return card;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(radius),
        onTap: onTap,
        child: card,
      ),
    );
  }
}

class GradientIconBubble extends StatelessWidget {
  const GradientIconBubble({super.key, required this.icon, this.size = 52});

  final IconData icon;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: size,
      width: size,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [kBrandBlue, kBrandCyan],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(size * 0.34),
        boxShadow: [
          BoxShadow(
            color: kBrandBlue.withOpacity(0.28),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Icon(icon, color: Colors.white, size: size * 0.54),
    );
  }
}

class PremiumBackground extends StatelessWidget {
  const PremiumBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFFF7FBFF), Color(0xFFEFF7FF)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: child,
    );
  }
}
