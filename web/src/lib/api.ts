import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function detail(message: string, status = 400) {
  return NextResponse.json({ detail: message }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    const msg = error.issues.map((i) => i.message).join("; ");
    logger.warn("api.validation_failed", {
      issue_count: error.issues.length,
      fields: error.issues.map((issue) => issue.path.join(".") || "body"),
    });
    return detail(msg || "Validation error", 400);
  }
  if (error instanceof Error) {
    const extra = error as Error & { status?: number; code?: string };
    const status =
      extra.status ??
      (error.message.toLowerCase().includes("unauthorized") ? 401 : 400);
    const level = status >= 500 ? "error" : "warn";
    logger[level]("api.request_failed", {
      status,
      code: extra.code,
      error_name: error.name,
      message: error.message,
    });
    if (extra.code) {
      return NextResponse.json(
        { detail: error.message, code: extra.code },
        { status },
      );
    }
    return detail(error.message, status);
  }
  logger.error("api.request_failed", {
    error_type: typeof error,
  });
  return detail("Internal server error", 500);
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw Object.assign(new Error("Invalid JSON body"), { status: 400 });
  }
}

const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

export function clientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
