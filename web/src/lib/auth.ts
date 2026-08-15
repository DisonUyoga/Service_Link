import { bearerFrom, verifyToken } from "@/lib/jwt";
import { db } from "@/lib/store";
import type { Profile } from "@/lib/types";

export async function requireUser(req: Request): Promise<Profile> {
  const token = bearerFrom(req);
  if (!token) {
    throw Object.assign(new Error("Authentication credentials were not provided."), {
      status: 401,
    });
  }
  try {
    const payload = await verifyToken(token);
    if (payload.typ === "refresh") {
      throw Object.assign(new Error("Invalid token type"), { status: 401 });
    }
    const profile = await db.getProfile(payload.sub);
    if (!profile) {
      throw Object.assign(new Error("User not found"), { status: 401 });
    }
    return profile;
  } catch (e) {
    if (e instanceof Error && (e as Error & { status?: number }).status) throw e;
    throw Object.assign(new Error("Invalid or expired token"), { status: 401 });
  }
}

export async function optionalUser(req: Request): Promise<Profile | null> {
  try {
    return await requireUser(req);
  } catch {
    return null;
  }
}

export function requireRole(user: Profile, roles: Profile["role"][]) {
  if (!roles.includes(user.role) && user.role !== "admin") {
    throw Object.assign(new Error("You do not have permission to perform this action."), {
      status: 403,
    });
  }
}
