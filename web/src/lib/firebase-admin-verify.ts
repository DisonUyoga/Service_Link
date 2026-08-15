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
 * Projects whose tokens are accepted. The admin web console and the Flutter app
 * sign in against different Firebase projects, so both must be trusted.
 */
function acceptedProjectIds(): string[] {
  const raw = [
    ...(process.env.FIREBASE_AUTH_PROJECT_IDS || "").split(","),
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    process.env.FIREBASE_AUTH_PROJECT_ID,
    process.env.FIREBASE_PROJECT_ID,
  ];
  return [...new Set(raw.map((v) => (v || "").trim()).filter(Boolean))];
}

/**
 * Verify a Firebase Auth ID token using Google's public JWKS.
 * No service-account JSON required (verify-only).
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  const projectIds = acceptedProjectIds();

  if (projectIds.length === 0) {
    throw Object.assign(new Error("Firebase project ID is not configured"), { status: 500 });
  }

  let payload: Record<string, unknown> | null = null;
  for (const projectId of projectIds) {
    try {
      const verified = await jwtVerify(idToken, jwks, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
      });
      payload = verified.payload as Record<string, unknown>;
      break;
    } catch {
      // try the next accepted project
    }
  }

  if (!payload) {
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
