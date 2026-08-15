"use client";

import { useState } from "react";
import { PromptModal } from "@/components/admin/PromptModal";
import { Pagination } from "@/components/admin/Pagination";

export type AllowlistRole = "admin" | "operations";

type Props = {
  emails: Array<{ email: string; added_at: string; role?: AllowlistRole }>;
  emailToAdd: string;
  roleToAdd: AllowlistRole;
  onEmailToAddChange: (value: string) => void;
  onRoleToAddChange: (value: AllowlistRole) => void;
  onAdd: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onRemove: (email: string) => Promise<void>;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function AccessPanel({
  emails,
  emailToAdd,
  roleToAdd,
  onEmailToAddChange,
  onRoleToAddChange,
  onAdd,
  onRemove,
  page,
  pageSize,
  total,
  onPageChange,
}: Props) {
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">Portal access</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Only Google accounts listed here can open this console. Choose Administrator for full
        access, or Operations staff for day-to-day provider, KYC, and complaint work.
      </p>
      <form onSubmit={onAdd} className="mt-4 flex max-w-xl flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={emailToAdd}
          onChange={(event) => onEmailToAddChange(event.target.value)}
          placeholder="ops@example.com"
          className="min-w-0 flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
        />
        <select
          value={roleToAdd}
          onChange={(event) => onRoleToAddChange(event.target.value as AllowlistRole)}
          className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
        >
          <option value="admin">Administrator</option>
          <option value="operations">Operations staff</option>
        </select>
        <button className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white">
          Grant access
        </button>
      </form>
      <ul className="mt-5 max-w-xl divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
        {emails.map((entry) => (
          <li key={entry.email} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="break-all font-medium text-slate-900">{entry.email}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {entry.role === "operations" ? "Operations staff" : "Administrator"}
              </p>
            </div>
            <button
              onClick={() => setPendingRemove(entry.email)}
              className="shrink-0 text-[var(--danger)] hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
        {emails.length === 0 && (
          <li className="px-4 py-5 text-sm text-[var(--muted)]">No allowed portal users found.</li>
        )}
      </ul>
      <div className="max-w-xl">
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />
      </div>

      <PromptModal
        open={pendingRemove != null}
        title="Remove portal access"
        description={
          pendingRemove
            ? `Type REMOVE to confirm deleting access for ${pendingRemove}.`
            : undefined
        }
        confirmLabel="Remove"
        placeholder="REMOVE"
        required
        onCancel={() => setPendingRemove(null)}
        onConfirm={(value) => {
          if (value.trim().toUpperCase() !== "REMOVE" || !pendingRemove) return;
          void onRemove(pendingRemove);
          setPendingRemove(null);
        }}
      />
    </section>
  );
}
