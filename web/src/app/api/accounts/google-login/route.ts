import { z } from "zod";
import { detail, handleApiError, json, rateLimit, clientIp, readJson } from "@/lib/api";
import { env } from "@/lib/env";
import { signAccessToken, signRefreshToken } from "@/lib/jwt";
import { verifyFirebaseIdToken } from "@/lib/firebase-admin-verify";
import { assertProviderCanLogin } from "@/lib/provider-gate";
import { db } from "@/lib/store";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/types";

/**
 * Dual-mode Google login:
 * - Admin portal: requires Firebase id_token (+ portal:"admin")
 * - Flutter / Django-compatible: accepts { email, name } like the original Django API
 * - Optional: id_token without portal also works (verified Firebase path)
 */
const schema = z
  .object({
    id_token: z.string().min(20).optional(),
    email: z.string().email().optional(),
    name: z.string().optional(),
    portal: z.enum(["admin"]).optional(),
    role: z.enum(["customer", "provider"]).optional(),
  })
  .refine((b) => !!b.id_token || !!b.email, {
    message: "email or id_token is required",
  });

type PortalRole = "admin" | "operations";

async function getPortalAllowlistRole(email: string): Promise<PortalRole | null> {
  const normalized = email.trim().toLowerCase();
  try {
    const { data, error } = await createServiceClient()
      .from("admin_allowlist")
      .select("email, role")
      .eq("email", normalized)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return data.role === "operations" ? "operations" : "admin";
  } catch {
    // Backward-compatible fallback while a deployment is waiting for migration 015.
    const legacy = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (legacy.length === 0) {
      return env.demoMode || env.NODE_ENV !== "production" ? "admin" : null;
    }
    return legacy.includes(normalized) ? "admin" : null;
  }
}

async function issueTokens(
  profile: {
    id: string;
    username: string;
    email: string;
    role: Role;
    full_name: string;
    phone: string;
    firebase_uid?: string;
  },
  created: boolean,
  displayName?: string,
) {
  await assertProviderCanLogin(profile as import("@/lib/types").Profile);
  const user = {
    id: profile.id,
    username: profile.username,
    email: profile.email,
    role: profile.role,
    name: displayName || profile.full_name,
    full_name: profile.full_name,
  };
  const access = await signAccessToken(user);
  const refresh = await signRefreshToken(user);
  return json({
    access,
    refresh,
    created,
    user: {
      id: profile.id,
      username: profile.username,
      email: profile.email,
      role: profile.role,
      name: displayName || profile.full_name,
      full_name: profile.full_name,
      phone: profile.phone,
      phone_number: profile.phone,
      ...(profile.firebase_uid ? { firebase_uid: profile.firebase_uid } : {}),
    },
  });
}

export async function POST(req: Request) {
  try {
    if (!rateLimit(`google:${clientIp(req)}`, 20)) {
      return detail("Too many requests", 429);
    }

    const body = schema.parse(await readJson(req));
    const isAdminPortal = body.portal === "admin";

    // Admin / operations portal always requires a verified Firebase ID token
    if (isAdminPortal) {
      if (!body.id_token) {
        return detail("id_token is required for admin portal sign-in", 400);
      }
      const verified = await verifyFirebaseIdToken(body.id_token);
      const portalRole = await getPortalAllowlistRole(verified.email);
      if (!portalRole) {
        return detail(
          "This Google account is not authorized for the admin portal. Ask an owner to add your email under Access.",
          403,
        );
      }
      const { profile, created } = await db.googleLogin(verified.email, verified.name, {
        firebase_uid: verified.uid,
        role: portalRole,
      });
      if (profile.role !== "admin" && profile.role !== "operations") {
        return detail("Admin or operations access only", 403);
      }
      return issueTokens(profile, created, verified.name);
    }

    // Firebase ID token path (optional upgrade for mobile)
    if (body.id_token) {
      const verified = await verifyFirebaseIdToken(body.id_token);
      const { profile, created } = await db.googleLogin(verified.email, verified.name, {
        firebase_uid: verified.uid,
        role: body.role === "provider" ? "provider" : "customer",
      });
      return issueTokens(profile, created, verified.name);
    }

    // Django-compatible Flutter path: { email, name }
    if (!body.email) {
      return detail("email is required", 400);
    }
    const { profile, created } = await db.googleLogin(body.email, body.name, {
      role: body.role === "provider" ? "provider" : "customer",
    });
    return issueTokens(profile, created, body.name);
  } catch (e) {
    return handleApiError(e);
  }
}
