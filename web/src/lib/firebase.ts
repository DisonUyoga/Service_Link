import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getDatabase, type Database } from "firebase/database";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

export function getFirebaseApp(): FirebaseApp {
  if (getApps().length) return getApp();
  return initializeApp(firebaseConfig);
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

let analyticsPromise: Promise<Analytics | null> | null = null;

/** Browser-only Analytics init (safe for Next.js App Router). */
export function initFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!analyticsPromise) {
    analyticsPromise = (async () => {
      try {
        const supported = await isSupported();
        if (!supported) return null;
        return getAnalytics(getFirebaseApp());
      } catch (err) {
        console.warn("Firebase Analytics unavailable:", err);
        return null;
      }
    })();
  }
  return analyticsPromise;
}

/** Realtime Database (optional — set NEXT_PUBLIC_FIREBASE_DATABASE_URL). */
export function getFirebaseDatabase(): Database | null {
  if (!firebaseConfig.databaseURL) return null;
  return getDatabase(getFirebaseApp());
}

export type GoogleSignInResult = {
  idToken: string;
  email: string;
  name: string;
  uid: string;
  photoURL: string | null;
};

async function toSignInResult(user: User): Promise<GoogleSignInResult> {
  const idToken = await user.getIdToken(/* forceRefresh */ true);
  const email = user.email;
  if (!email) {
    throw new Error("Google account did not return an email address");
  }
  return {
    idToken,
    email,
    name: user.displayName || email.split("@")[0],
    uid: user.uid,
    photoURL: user.photoURL,
  };
}

/**
 * Google sign-in via Firebase Auth.
 * Tries popup first; falls back to redirect when popups are blocked.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (typeof window === "undefined") {
    throw new Error("Google sign-in is only available in the browser");
  }
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
    throw new Error("Firebase is not configured");
  }

  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  provider.addScope("email");
  provider.addScope("profile");

  try {
    const credential = await signInWithPopup(auth, provider);
    return toSignInResult(credential.user);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "";
    // Popup blocked / unsupported → redirect flow
    if (
      code === "auth/popup-blocked" ||
      code === "auth/popup-closed-by-user" ||
      code === "auth/cancelled-popup-request"
    ) {
      if (code === "auth/popup-blocked") {
        await signInWithRedirect(auth, provider);
        // Navigation away; caller should not continue
        throw new Error("Redirecting to Google sign-in…");
      }
      throw new Error("Google sign-in was cancelled");
    }
    if (code === "auth/unauthorized-domain") {
      throw new Error(
        "This domain is not authorized in Firebase Authentication. Add localhost / your production host under Authorized domains.",
      );
    }
    throw err instanceof Error ? err : new Error("Google sign-in failed");
  }
}

/** Complete a pending redirect-based Google sign-in (call on login page mount). */
export async function completeGoogleRedirectIfPresent(): Promise<GoogleSignInResult | null> {
  if (typeof window === "undefined") return null;
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return null;
  const auth = getFirebaseAuth();
  const result = await getRedirectResult(auth);
  if (!result?.user) return null;
  return toSignInResult(result.user);
}

export async function signOutFirebase(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return;
  try {
    await signOut(getFirebaseAuth());
  } catch {
    // ignore — local JWT clear is enough for app session
  }
}
