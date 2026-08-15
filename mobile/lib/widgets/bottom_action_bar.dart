import 'package:flutter/material.dart';

/// Minimum breathing room between a pinned action and the screen edge or the
/// Android system navigation bar.
const double kBottomActionGap = 24;

/// Scroll padding for screens whose primary action is the last item in a list
/// or form, so it never sits flush against the system navigation bar.
EdgeInsets bottomActionScrollPadding(
  BuildContext context, {
  EdgeInsets base = EdgeInsets.zero,
}) {
  final systemInset = MediaQuery.viewPaddingOf(context).bottom;
  return base.copyWith(bottom: base.bottom + systemInset + kBottomActionGap);
}

/// A pinned footer for a screen's primary action.
///
/// Adds the system navigation-bar inset plus [kBottomActionGap] so the button
/// reads as a floating footer instead of being glued to the bottom edge.
class BottomActionBar extends StatelessWidget {
  const BottomActionBar({
    super.key,
    required this.child,
    this.showDivider = true,
  });

  final Widget child;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final systemInset = MediaQuery.viewPaddingOf(context).bottom;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: showDivider
            ? Border(
                top: BorderSide(
                  color: theme.dividerColor.withValues(alpha: 0.35),
                ),
              )
            : null,
      ),
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          14,
          20,
          systemInset + kBottomActionGap,
        ),
        child: child,
      ),
    );
  }
}
