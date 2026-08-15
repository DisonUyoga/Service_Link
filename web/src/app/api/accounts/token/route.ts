import { z } from "zod";
import { detail, handleApiError, json, rateLimit, clientIp, readJson } from "@/lib/api";
import { signAccessToken, signRefreshToken } from "@/lib/jwt";
import { logger } from "@/lib/logger";
import { assertProviderCanLogin } from "@/lib/provider-gate";
import { db } from "@/lib/store";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    if (!rateLimit(`token:${clientIp(req)}`, 20)) {
      logger.warn("auth.login_rate_limited", { ip: clientIp(req) });
      return detail("Too many requests", 429);
    }
    const body = schema.parse(await readJson(req));
    const profile = await db.authenticate(body.username, body.password);
    await assertProviderCanLogin(profile);
    const user = {
      id: profile.id,
      username: profile.username,
      email: profile.email,
      role: profile.role,
      full_name: profile.full_name,
    };
    const [access, refresh] = await Promise.all([
      signAccessToken(user),
      signRefreshToken(user),
    ]);
    logger.info("auth.login_succeeded", {
      request_id: req.headers.get("x-request-id"),
      user_id: profile.id,
      role: profile.role,
    });
    // Include `user` so mobile can skip the extra /accounts/me/ round-trip.
    return json({
      access,
      refresh,
      role: profile.role,
      username: profile.username,
      user: {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        role: profile.role,
        full_name: profile.full_name,
        phone: profile.phone,
        phone_number: profile.phone,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
