"use client";

import { useMemo, useState } from "react";
import { AdminLiveMap, type CustomerJobLocation, type LiveProvider } from "@/components/AdminLiveMap";
import type { LiveConnectionState } from "@/hooks/useAdminLiveFeed";

export type LiveMapLayer = "providers" | "jobs";

type Props = {
  providers: LiveProvider[];
  customerJobs: CustomerJobLocation[];
  connection: LiveConnectionState;
  loading: boolean;
};

export function LiveOpsMapSection({ providers, customerJobs, connection, loading }: Props) {
  const [layer, setLayer] = useState<LiveMapLayer>("providers");

  const activeProviders = layer === "providers" ? providers : [];
  const activeJobs = layer === "jobs" ? customerJobs : [];

  const loadingLabel = useMemo(
    () =>
      layer === "providers"
        ? "Fetching provider locations…"
        : "Fetching customer job pins…",
    [layer],
  );

  return (
    <section className="relative h-[calc(100vh-5.5rem)] min-h-[520px] overflow-hidden rounded-2xl border border-[var(--border)] bg-slate-100 shadow-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto rounded-xl border border-white/70 bg-white/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
          <p className="font-semibold text-slate-900">
            {layer === "providers" ? "Provider live map" : "Customer jobs map"}
          </p>
          <div className="mt-2 inline-flex rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setLayer("providers")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                layer === "providers"
                  ? "bg-white text-teal-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Providers
            </button>
            <button
              type="button"
              onClick={() => setLayer("jobs")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                layer === "jobs"
                  ? "bg-white text-orange-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Customer jobs
            </button>
          </div>
          <p className="mt-2 text-[var(--muted)]">
            {layer === "providers" ? (
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-teal-700" /> {providers.length}{" "}
                providers
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-orange-700" /> {customerJobs.length}{" "}
                jobs
              </span>
            )}
          </p>
        </div>
        <div className="pointer-events-auto rounded-full border border-white/70 bg-white/95 px-3 py-1.5 text-xs font-medium capitalize text-slate-700 shadow-sm backdrop-blur">
          {connection}
        </div>
      </div>
      <div className="h-full w-full">
        {loading ? (
          <div className="relative flex h-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-sky-50">
            <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_20%_30%,rgba(15,118,110,0.08),transparent_40%),radial-gradient(circle_at_80%_70%,rgba(194,65,12,0.08),transparent_35%)]" />
            <div className="relative z-[1] flex flex-col items-center gap-3 rounded-2xl border border-white/80 bg-white/90 px-6 py-5 shadow-lg backdrop-blur">
              <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-[var(--brand)]" />
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-900">Refreshing live locations</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{loadingLabel}</p>
              </div>
            </div>
          </div>
        ) : (
          <AdminLiveMap
            key={layer}
            layer={layer}
            providers={activeProviders}
            customerJobs={activeJobs}
          />
        )}
      </div>
    </section>
  );
}
