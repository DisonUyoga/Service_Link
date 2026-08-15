"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  completeGoogleRedirectIfPresent,
  signInWithGoogle,
} from "@/lib/firebase";
import { clearAppSession } from "@/lib/session";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function finishAdminLogin(idToken: string) {
    const res = await fetch("/api/accounts/google-login/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken, portal: "admin" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      await clearAppSession();
      throw new Error(body.detail || `Admin sign-in failed (HTTP ${res.status})`);
    }
    if (body.user?.role !== "admin") {
      await clearAppSession();
      throw new Error("This portal is for administrators only");
    }
    localStorage.setItem("slink_access", body.access);
    if (body.refresh) localStorage.setItem("slink_refresh", body.refresh);
    // Hard navigation so the console mounts with the token already persisted
    window.location.replace("/admin");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const redirected = await completeGoogleRedirectIfPresent();
        if (!redirected || cancelled) return;
        setLoading(true);
        await finishAdminLogin(redirected.idToken);
      } catch (err) {
        console.error("Google redirect sign-in failed", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Google sign-in failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onGoogle() {
    setLoading(true);
    setError("");
    try {
      const result = await signInWithGoogle();
      await finishAdminLogin(result.idToken);
    } catch (err) {
      console.error("Google sign-in failed", err);
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      if (!msg.toLowerCase().includes("redirecting")) setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        background:
          "radial-gradient(1200px 600px at 10% -10%, var(--brand-light), transparent), var(--background)",
      }}
    >
      <div className="w-full max-w-sm rounded-3xl border border-[var(--border)] bg-white p-8 text-center shadow-sm">
        <div className="mb-5 flex justify-center">
          <Image
            src="/s-link-logo.png"
            alt="S-Link"
            width={96}
            height={96}
            className="rounded-2xl object-cover shadow-md"
            priority
          />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--brand)]">
          S-Link Admin
        </p>
        <h1 className="mt-1 text-2xl font-bold">Admin sign in</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Sign in with Google to open the operations console.
        </p>

        <button
          type="button"
          disabled={loading}
          onClick={() => void onGoogle()}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-[var(--brand)] py-3 text-sm font-medium text-white hover:bg-[var(--brand-dark)] disabled:opacity-60"
        >
          <GoogleIcon />
          {loading ? "Connecting…" : "Continue with Google"}
        </button>

        {error && <p className="mt-4 text-left text-sm text-[var(--danger)]">{error}</p>}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16.1 19 13 24 13c3.1 0 5.8 1.1 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.5 7.1l.1.1 6.2 5.2C37.1 38.3 44 33 44 24c0-1.3-.1-2.5-.4-3.5z"
      />
    </svg>
  );
}
