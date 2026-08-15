"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/types";

export type AdminOverview = {
  jobs: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  providers: Array<Record<string, unknown>>;
  ads: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  role?: Role;
};

export type AdminTab =
  | "overview"
  | "providers"
  | "jobs"
  | "payments"
  | "ads"
  | "complaints"
  | "access"
  | "quality"
  | "terms";

export const ADMIN_ONLY_TABS: AdminTab[] = ["ads", "access", "quality", "terms"];

export const OPERATIONS_TABS: AdminTab[] = [
  "overview",
  "providers",
  "jobs",
  "payments",
  "complaints",
];

export function isAdminOnlyTab(tab: AdminTab) {
  return ADMIN_ONLY_TABS.includes(tab);
}

export function useAdminOverview() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const access = localStorage.getItem("slink_access");
    if (!access) {
      router.replace("/login");
      return;
    }
    setToken(access);
    const storedRole = localStorage.getItem("slink_role");
    if (storedRole === "admin" || storedRole === "operations") {
      setRole(storedRole);
    }
  }, [router]);

  const load = useCallback(
    async (access = token, opts?: { soft?: boolean }) => {
      if (!access) return;
      if (!opts?.soft) setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/admin/overview/", {
          headers: { Authorization: `Bearer ${access}` },
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || "Failed to load");
        setData(body);
        if (body.role === "admin" || body.role === "operations") {
          setRole(body.role);
          localStorage.setItem("slink_role", body.role);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to load";
        setError(message);
        if (message.toLowerCase().includes("token") || message.includes("401")) {
          localStorage.removeItem("slink_access");
          localStorage.removeItem("slink_role");
          router.replace("/login");
        }
      } finally {
        if (!opts?.soft) setLoading(false);
      }
    },
    [token, router],
  );

  useEffect(() => {
    if (token) void load(token);
  }, [token, load]);

  const softRefresh = useCallback(() => {
    if (token) void load(token, { soft: true });
  }, [token, load]);

  return { token, data, role, error, loading, load, softRefresh, setError };
}
