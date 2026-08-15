import { createRemoteJWKSet, jwtVerify } from "jose";

const certsUrl =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const jwks = createRemoteJWKSet(new URL(certsUrl));

export type VerifiedFirebaseUser = {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified: boolean;
};

/**
 * Verify a Firebase Auth ID token using Google's public JWKS.
 * No service-account JSON required (verify-only).
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "";

  if (!projectId) {
    throw Object.assign(new Error("Firebase project ID is not configured"), { status: 500 });
  }

  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(idToken, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error("Invalid or expired Google/Firebase token"), { status: 401 });
  }

  const uid = typeof payload.user_id === "string" ? payload.user_id : String(payload.sub || "");
  const email = typeof payload.email === "string" ? payload.email : "";
  const emailVerified = payload.email_verified === true;

  if (!uid) {
    throw Object.assign(new Error("Token missing user id"), { status: 401 });
  }
  if (!email) {
    throw Object.assign(new Error("Token missing email"), { status: 401 });
  }
  if (!emailVerified) {
    throw Object.assign(new Error("Google email is not verified"), { status: 401 });
  }

  return {
    uid,
    email,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
    email_verified: true,
  };
}
