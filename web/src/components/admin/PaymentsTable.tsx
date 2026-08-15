"use client";

import { Pagination } from "@/components/admin/Pagination";
import { formatHumanLabel } from "@/lib/format";

type Props = {
  payments: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function PaymentsTable({ payments, page, pageSize, total, onPageChange }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Reference</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={String(p.id)} className="border-t border-[var(--border)]">
                <td className="px-4 py-3">#{String(p.id)}</td>
                <td className="px-4 py-3">#{String(p.job_id ?? p.job)}</td>
                <td className="px-4 py-3">
                  {String(p.currency)} {String(p.amount)}
                </td>
                <td className="px-4 py-3">{formatHumanLabel(p.status)}</td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">
                  {String(p.mpesa_reference || "—")}
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-[var(--muted)]" colSpan={5}>
                  No payments yet.
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
