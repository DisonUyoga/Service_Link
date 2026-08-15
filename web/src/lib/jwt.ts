import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import type { AuthUser, Role } from "@/lib/types";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export async function signAccessToken(user: AuthUser, expiresIn = "30m") {
  return new SignJWT({
    sub: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    name: user.full_name || user.name || user.username,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function signRefreshToken(user: AuthUser, expiresIn = "7d") {
  return new SignJWT({
    sub: user.id,
    typ: "refresh",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return payload as {
    sub: string;
    username?: string;
    email?: string;
    role?: Role;
    name?: string;
    typ?: string;
  };
}

export function bearerFrom(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}
