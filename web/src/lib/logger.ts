type LogMeta = Record<string, unknown>;

const sensitiveKeys = /password|token|authorization|cookie|phone|email|file|document/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sensitiveKeys.test(key) ? "[redacted]" : sanitize(item, depth + 1),
      ]),
    );
  }
  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 500)}…`;
  }
  return value;
}

function write(level: "debug" | "info" | "warn" | "error", event: string, meta: LogMeta = {}) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const safeMeta = sanitize(meta) as LogMeta;
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "s-link-api",
    level,
    event,
    ...safeMeta,
  });
  console[level](line);
}

export const logger = {
  debug: (event: string, meta?: LogMeta) => write("debug", event, meta),
  info: (event: string, meta?: LogMeta) => write("info", event, meta),
  warn: (event: string, meta?: LogMeta) => write("warn", event, meta),
  error: (event: string, meta?: LogMeta) => write("error", event, meta),
};
