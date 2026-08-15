"use client";

import { signOutFirebase } from "@/lib/firebase";

/** Clear app JWT + Firebase Auth session. */
export async function clearAppSession() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("slink_access");
    localStorage.removeItem("slink_refresh");
    localStorage.removeItem("slink_role");
  }
  await signOutFirebase();
}
