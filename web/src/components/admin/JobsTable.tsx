"use client";

import { Pagination } from "@/components/admin/Pagination";
import { formatHumanLabel } from "@/lib/format";

type Props = {
  jobs: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function JobsTable({ jobs, page, pageSize, total, onPageChange }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Paid</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={String(j.id)} className="border-t border-[var(--border)]">
                <td className="px-4 py-3">#{String(j.id)}</td>
                <td className="px-4 py-3">{String(j.description)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-[var(--brand-light)] px-2 py-0.5 text-xs text-[var(--brand-dark)]">
                    {formatHumanLabel(j.status)}
                  </span>
                </td>
                <td className="px-4 py-3">{j.is_paid ? "Yes" : "No"}</td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-[var(--muted)]" colSpan={4}>
                  No jobs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />
    </div>
  );
}
