"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Web entry: admin portal only — send people to login or admin console. */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("slink_access");
    if (!token) {
      router.replace("/login");
      return;
    }
    void fetch("/api/accounts/me/", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("unauthorized");
        return res.json();
      })
      .then((me: { role?: string }) => {
        if (me.role === "admin") router.replace("/admin");
        else router.replace("/login");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center text-sm text-[var(--muted)]">
      Opening admin console…
    </div>
  );
}
