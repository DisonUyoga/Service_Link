"use client";

import { useEffect, useState } from "react";
import { Pagination } from "@/components/admin/Pagination";
import { formatHumanLabel } from "@/lib/format";

type AdRow = Record<string, unknown>;

type AdDraft = {
  title: string;
  description: string;
  category: string;
  status: "pending_review" | "active" | "paused";
  target_country: string;
  target_city: string;
};

type Props = {
  ads: AdRow[];
  onSetStatus: (id: number, status: string) => Promise<void>;
  onSaveAd: (id: number, patch: AdDraft) => Promise<void>;
  onDeleteAd: (id: number) => Promise<void>;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

function toDraft(ad: AdRow): AdDraft {
  const status = String(ad.status || "pending_review");
  return {
    title: String(ad.title || ""),
    description: String(ad.description || ""),
    category: String(ad.category || ""),
    status:
      status === "active" || status === "paused" || status === "pending_review"
        ? status
        : "pending_review",
    target_country: String(ad.target_country || ""),
    target_city: String(ad.target_city || ""),
  };
}

function statusClass(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700";
  if (status === "paused") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export function AdsTable({
  ads,
  onSetStatus,
  onSaveAd,
  onDeleteAd,
  page,
  pageSize,
  total,
  onPageChange,
}: Props) {
  const [editing, setEditing] = useState<AdRow | null>(null);
  const [draft, setDraft] = useState<AdDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) setDraft(toDraft(editing));
    else setDraft(null);
  }, [editing]);

  async function handleSave() {
    if (!editing || !draft) return;
    if (!draft.title.trim()) {
      alert("Title is required");
      return;
    }
    setSaving(true);
    try {
      await onSaveAd(Number(editing.id), {
        ...draft,
        title: draft.title.trim(),
        description: draft.description.trim(),
        category: draft.category.trim(),
        target_country: draft.target_country.trim(),
        target_city: draft.target_city.trim(),
      });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!confirm(`Delete ad “${String(editing.title)}”? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await onDeleteAd(Number(editing.id));
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {ads.map((a) => (
              <tr key={String(a.id)} className="border-t border-[var(--border)]">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{String(a.title)}</div>
                  {a.description ? (
                    <div className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]">
                      {String(a.description)}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">{String(a.category || "—")}</td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">
                  {[a.target_city, a.target_country].filter(Boolean).map(String).join(", ") || "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusClass(String(a.status))}`}>
                    {formatHumanLabel(a.status)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="text-[var(--brand-dark)] hover:underline"
                      onClick={() => setEditing(a)}
                    >
                      Edit
                    </button>
                    <button
                      className="text-[var(--success)] hover:underline"
                      onClick={() => void onSetStatus(Number(a.id), "active")}
                    >
                      Activate
                    </button>
                    <button
                      className="text-[var(--warn)] hover:underline"
                      onClick={() => void onSetStatus(Number(a.id), "paused")}
                    >
                      Pause
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {ads.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-[var(--muted)]" colSpan={5}>
                  No ads yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />

      {editing && draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <section
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Edit ad"
          >
            <div className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Edit ad</h3>
                <p className="text-xs text-[var(--muted)]">Ad #{String(editing.id)}</p>
              </div>
              <button
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                onClick={() => setEditing(null)}
                disabled={saving}
              >
                Close
              </button>
            </div>

            <div className="space-y-3 p-5">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Title
                </span>
                <input
                  className="w-full rounded-xl border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--brand)]"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Description
                </span>
                <textarea
                  className="min-h-24 w-full rounded-xl border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--brand)]"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    Category
                  </span>
                  <input
                    className="w-full rounded-xl border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--brand)]"
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    Status
                  </span>
                  <select
                    className="w-full rounded-xl border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--brand)]"
                    value={draft.status}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        status: e.target.value as AdDraft["status"],
                      })
                    }
                  >
                    <option value="pending_review">Pending review</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    Target city
                  </span>
                  <input
                    className="w-full rounded-xl border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--brand)]"
                    value={draft.target_city}
                    onChange={(e) => setDraft({ ...draft, target_city: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    Target country
                  </span>
                  <input
                    className="w-full rounded-xl border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--brand)]"
                    value={draft.target_country}
                    onChange={(e) => setDraft({ ...draft, target_country: e.target.value })}
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-5 py-4">
              <button
                className="rounded-lg px-3 py-2 text-sm text-[var(--danger)] hover:bg-red-50"
                onClick={() => void handleDelete()}
                disabled={saving}
              >
                Delete
              </button>
              <div className="flex gap-2">
                <button
                  className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                  onClick={() => setEditing(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  onClick={() => void handleSave()}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
