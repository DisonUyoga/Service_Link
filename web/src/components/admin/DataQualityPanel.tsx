"use client";

import { formatHumanLabel } from "@/lib/format";

type AuditRow = {
  provider_id: number;
  user_id: string;
  username?: string;
  email?: string;
  reasons: string[];
  base_lat?: number | null;
  base_lng?: number | null;
  current_lat?: number | null;
  current_lng?: number | null;
};

type Props = {
  loading: boolean;
  summary: {
    total_providers: number;
    outside_kenya: number;
    missing_coords: number;
    inside_kenya: number;
    last_audit_at?: string | null;
    last_deleted?: number | null;
  } | null;
  candidates: AuditRow[];
  message: string;
  onAudit: () => Promise<void>;
  onCleanup: () => Promise<void>;
};

export function DataQualityPanel({
  loading,
  summary,
  candidates,
  message,
  onAudit,
  onCleanup,
}: Props) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Kenya location quality</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Providers are flagged when their base or live coordinates fall outside Kenya’s national
          boundary. Missing coordinates are retained.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Providers", summary?.total_providers ?? "—"],
            ["Outside Kenya", summary?.outside_kenya ?? "—"],
            ["Missing coords", summary?.missing_coords ?? "—"],
            ["Inside Kenya", summary?.inside_kenya ?? "—"],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
              <p className="mt-1 text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            disabled={loading}
            onClick={() => void onAudit()}
            className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Run dry-run audit
          </button>
          <button
            disabled={loading || !summary?.outside_kenya}
            onClick={() => {
              if (
                window.confirm(
                  `Delete ${summary?.outside_kenya ?? 0} providers whose coordinates are outside Kenya? A backup will be written first.`,
                )
              ) {
                void onCleanup();
              }
            }}
            className="rounded-xl bg-[var(--danger)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Delete outside-Kenya providers
          </button>
        </div>
        {summary?.last_audit_at ? (
          <p className="mt-3 text-xs text-[var(--muted)]">
            Last audit: {new Date(summary.last_audit_at).toLocaleString()}
            {summary.last_deleted != null ? ` · Last deleted: ${summary.last_deleted}` : ""}
          </p>
        ) : null}
        {message ? <p className="mt-3 text-sm text-[var(--brand-dark)]">{message}</p> : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h3 className="font-medium">Outside-Kenya candidates</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Base</th>
                <th className="px-4 py-3">Current</th>
                <th className="px-4 py-3">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((row) => (
                <tr key={row.provider_id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3">#{row.provider_id}</td>
                  <td className="px-4 py-3">
                    <div>{formatHumanLabel(row.username || row.user_id)}</div>
                    <div className="text-xs text-[var(--muted)]">{row.email || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {row.base_lat != null && row.base_lng != null
                      ? `${row.base_lat.toFixed(4)}, ${row.base_lng.toFixed(4)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {row.current_lat != null && row.current_lng != null
                      ? `${row.current_lat.toFixed(4)}, ${row.current_lng.toFixed(4)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {row.reasons.map((reason) => formatHumanLabel(reason)).join(", ")}
                  </td>
                </tr>
              ))}
              {candidates.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-[var(--muted)]" colSpan={5}>
                    Run an audit to list providers outside Kenya.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
