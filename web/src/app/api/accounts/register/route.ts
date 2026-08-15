import { z } from "zod";
import { detail, handleApiError, json, rateLimit, clientIp, readJson } from "@/lib/api";
import { normalizeMsisdn } from "@/lib/phone";
import { logger } from "@/lib/logger";
import { db } from "@/lib/store";

const schema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["customer", "provider", "admin"]).default("customer"),
  phone_number: z.string().optional(),
  phone: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  full_name: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    if (!rateLimit(`register:${clientIp(req)}`, 10)) {
      logger.warn("auth.registration_rate_limited", { ip: clientIp(req) });
      return detail("Too many requests", 429);
    }
    const body = schema.parse(await readJson(req));
    if (body.role === "admin") {
      return detail("Cannot self-register as admin", 400);
    }
    const rawPhone = body.phone_number ?? body.phone;
    const name =
      body.full_name ||
      [body.first_name, body.last_name].filter(Boolean).join(" ").trim() ||
      undefined;
    // Single write: uniqueness checks + hash run in parallel inside db.register
    const profile = await db.register({
      username: body.username,
      email: body.email,
      password: body.password,
      role: body.role,
      phone: rawPhone ? normalizeMsisdn(rawPhone) : "",
      full_name: name,
    });
    logger.info("auth.registration_succeeded", {
      request_id: req.headers.get("x-request-id"),
      user_id: profile.id,
      role: profile.role,
    });
    return json(
      {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        role: profile.role,
        phone_number: profile.phone,
        phone: profile.phone,
        full_name: profile.full_name,
      },
      201,
    );
  } catch (e) {
    return handleApiError(e);
  }
}
