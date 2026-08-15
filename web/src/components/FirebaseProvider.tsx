"use client";

import { useEffect } from "react";
import { getFirebaseApp, initFirebaseAnalytics } from "@/lib/firebase";

/** Initializes Firebase + Analytics once on the client. */
export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return;
    getFirebaseApp();
    void initFirebaseAnalytics();
  }, []);

  return <>{children}</>;
}
