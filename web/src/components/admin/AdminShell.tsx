"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { AdminBusyOverlay } from "@/components/admin/AdminBusyOverlay";
import type { AdminTab } from "@/hooks/useAdminOverview";
import { ADMIN_ONLY_TABS } from "@/hooks/useAdminOverview";
import type { LiveConnectionState } from "@/hooks/useAdminLiveFeed";
import { formatHumanLabel } from "@/lib/format";
import type { Role } from "@/lib/types";

const NAV: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "providers", label: "Providers" },
  { id: "jobs", label: "Jobs" },
  { id: "payments", label: "Payments" },
  { id: "ads", label: "Ads" },
  { id: "complaints", label: "Complaints" },
  { id: "terms", label: "Terms" },
  { id: "access", label: "Access" },
  { id: "quality", label: "Data quality" },
];

type Props = {
  tab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  connection: LiveConnectionState;
  onLogout: () => void;
  role?: Role | null;
  busy?: boolean;
  busyLabel?: string;
  children: React.ReactNode;
};

export function AdminShell({
  tab,
  onTabChange,
  connection,
  onLogout,
  role = null,
  busy = false,
  busyLabel,
  children,
}: Props) {
  const isOperations = role === "operations";
  const visibleNav = NAV.filter((item) => !isOperations || !ADMIN_ONLY_TABS.includes(item.id));

  const liveLabel =
    connection === "live"
      ? "Live"
      : connection === "connecting"
        ? "Connecting"
        : connection === "reconnecting"
          ? "Reconnecting"
          : "Offline";

  return (
    <div className="relative min-h-screen bg-[var(--background)] lg:h-screen lg:overflow-hidden lg:grid lg:grid-cols-[240px_1fr]">
      <AdminBusyOverlay active={busy} label={busyLabel} />
      <aside className="border-b border-[var(--border)] bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-4 py-4 lg:block">
          <div className="flex items-center gap-3">
            <BrandLogo size={40} showWordmark={false} />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">
                S-Link
              </p>
              <h1 className="text-sm font-bold text-slate-900">
                {isOperations ? "Operations Console" : "Admin Console"}
              </h1>
            </div>
          </div>
          {isOperations && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 lg:mt-3 lg:inline-flex">
              Operations staff
            </span>
          )}
          <div className="hidden items-center gap-2 text-xs text-[var(--muted)] lg:mt-4 lg:flex">
            <span
              className={`h-2 w-2 rounded-full ${
                connection === "live"
                  ? "animate-pulse bg-emerald-500"
                  : connection === "offline"
                    ? "bg-slate-400"
                    : "animate-pulse bg-amber-400"
              }`}
            />
            Realtime {liveLabel}
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:pb-6">
          {visibleNav.map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              disabled={busy}
              className={`whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm transition ${
                tab === item.id
                  ? "bg-[var(--brand)] font-medium text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              } disabled:cursor-wait disabled:opacity-60`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col lg:h-screen lg:overflow-hidden">
        <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--border)] bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                {isOperations ? "Operations staff" : "Operations"}
              </p>
              <p className="text-base font-semibold text-slate-900">{formatHumanLabel(tab)}</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {isOperations && (
                <span className="hidden rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 sm:inline-flex">
                  Operations staff
                </span>
              )}
              {busy ? (
                <span className="hidden items-center gap-2 rounded-full border border-[var(--border)] bg-slate-50 px-3 py-1 text-xs text-slate-600 sm:inline-flex">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-[var(--brand)]" />
                  Busy
                </span>
              ) : (
                <span className="hidden rounded-full border border-[var(--border)] bg-slate-50 px-3 py-1 text-xs text-[var(--muted)] sm:inline-flex sm:items-center sm:gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      connection === "live"
                        ? "animate-pulse bg-emerald-500"
                        : connection === "offline"
                          ? "bg-slate-400"
                          : "animate-pulse bg-amber-400"
                    }`}
                  />
                  {liveLabel}
                </span>
              )}
              <Link href="/" className="rounded-lg px-3 py-1.5 text-[var(--muted)] hover:bg-slate-100">
                Home
              </Link>
              <button
                onClick={onLogout}
                disabled={busy}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"
              >
                Log out
              </button>
            </div>
          </div>
        </header>
        <main
          className={`min-h-0 flex-1 overflow-y-auto ${
            tab === "overview" ? "p-2 sm:p-3" : "px-4 py-5 sm:px-6"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
