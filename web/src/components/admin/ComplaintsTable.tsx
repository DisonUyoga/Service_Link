"use client";

import { useState } from "react";
import { PromptModal } from "@/components/admin/PromptModal";
import { Pagination } from "@/components/admin/Pagination";
import { formatHumanLabel } from "@/lib/format";

type Props = {
  complaints: Array<Record<string, unknown>>;
  onPatch: (id: number, status: string, resolution_notes?: string) => Promise<void>;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function ComplaintsTable({
  complaints,
  onPatch,
  page,
  pageSize,
  total,
  onPageChange,
}: Props) {
  const [modal, setModal] = useState<{ id: number; status: string } | null>(null);

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Body</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {complaints.map((c) => (
              <tr key={String(c.id)} className="border-t border-[var(--border)]">
                <td className="px-4 py-3">#{String(c.id)}</td>
                <td className="px-4 py-3">{formatHumanLabel(c.category)}</td>
                <td className="max-w-md truncate px-4 py-3">{String(c.body)}</td>
                <td className="px-4 py-3">{formatHumanLabel(c.status)}</td>
                <td className="px-4 py-3 space-x-2">
                  <button
                    className="text-[var(--brand-dark)] hover:underline"
                    onClick={() => void onPatch(Number(c.id), "in_review")}
                  >
                    Review
                  </button>
                  <button
                    className="text-[var(--success)] hover:underline"
                    onClick={() => setModal({ id: Number(c.id), status: "resolved" })}
                  >
                    Resolve
                  </button>
                  <button
                    className="text-[var(--muted)] hover:underline"
                    onClick={() => setModal({ id: Number(c.id), status: "dismissed" })}
                  >
                    Dismiss
                  </button>
                </td>
              </tr>
            ))}
            {complaints.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-[var(--muted)]" colSpan={5}>
                  No complaints yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />

      <PromptModal
        open={modal != null}
        title={modal?.status === "resolved" ? "Resolve complaint" : "Dismiss complaint"}
        description="Add a short resolution note for the audit trail."
        confirmLabel="Save"
        placeholder="Resolution notes"
        onCancel={() => setModal(null)}
        onConfirm={(notes) => {
          if (!modal) return;
          void onPatch(modal.id, modal.status, notes);
          setModal(null);
        }}
      />
    </div>
  );
}
