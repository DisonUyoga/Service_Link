/// Display-only: turn snake_case / kebab labels into readable text.
String formatHumanLabel(Object? value) {
  final raw = (value ?? '').toString().trim();
  if (raw.isEmpty) return '';
  return raw
      .replaceAll(RegExp(r'[_-]+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim()
      .split(' ')
      .where((part) => part.isNotEmpty)
      .map((part) {
        final lower = part.toLowerCase();
        return '${lower[0].toUpperCase()}${lower.substring(1)}';
      })
      .join(' ');
}
