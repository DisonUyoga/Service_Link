/** Turn snake_case / kebab labels into readable UI text (display only). */
export function formatHumanLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/gi, (char) => char.toUpperCase());
}
