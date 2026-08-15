/** Normalize Kenyan MSISDN to 2547XXXXXXXX (digits only). */
export function normalizeMsisdn(raw: string): string {
  if (!raw) return "";
  let cleaned = raw.trim().replace(/[\s-]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (cleaned.startsWith("0") && cleaned.length >= 10) {
    cleaned = `254${cleaned.slice(1)}`;
  }
  if (!/^\d{10,15}$/.test(cleaned)) {
    throw Object.assign(
      new Error("Enter a valid phone number (e.g. 0712345678 or 254712345678)."),
      { status: 400 },
    );
  }
  return cleaned;
}
