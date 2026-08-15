import { z } from "zod";
import { detail, handleApiError, json, readJson } from "@/lib/api";
import { signAccessToken, verifyToken } from "@/lib/jwt";
import { db } from "@/lib/store";

const schema = z.object({
  refresh: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await readJson(req));
    const payload = await verifyToken(body.refresh);
    if (payload.typ !== "refresh") {
      return detail("Invalid refresh token", 401);
    }
    const profile = await db.getProfile(payload.sub);
    if (!profile) return detail("User not found", 401);
    const access = await signAccessToken({
      id: profile.id,
      username: profile.username,
      email: profile.email,
      role: profile.role,
      full_name: profile.full_name,
    });
    return json({ access });
  } catch (e) {
    return handleApiError(e);
  }
}
