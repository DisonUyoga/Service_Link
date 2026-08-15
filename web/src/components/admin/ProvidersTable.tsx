"use client";

import { useState } from "react";
import { PromptModal } from "@/components/admin/PromptModal";
import { Pagination } from "@/components/admin/Pagination";
import { formatHumanLabel } from "@/lib/format";

type Props = {
  providers: Array<Record<string, unknown>>;
  docsByProvider: Record<number, Array<Record<string, unknown>>>;
  docsOpen: number | null;
  onDocsOpen: (id: number | null) => void;
  onLoadDocs: (profileId: number) => Promise<void>;
  providerDetail: Record<string, unknown> | null;
  providerDetailLoading: boolean;
  onOpenProviderDetails: (profileId: number) => Promise<void>;
  onCloseProviderDetails: () => void;
  onPatchProvider: (providerId: number, patch: Record<string, unknown>) => Promise<void>;
  onReviewDoc: (
    documentId: number,
    review_status: "approved" | "rejected",
    review_notes?: string,
  ) => Promise<void>;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function ProvidersTable({
  providers,
  docsByProvider,
  docsOpen,
  onDocsOpen,
  onLoadDocs,
  providerDetail,
  providerDetailLoading,
  onOpenProviderDetails,
  onCloseProviderDetails,
  onPatchProvider,
  onReviewDoc,
  page,
  pageSize,
  total,
  onPageChange,
}: Props) {
  const [rejectDocId, setRejectDocId] = useState<number | null>(null);

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Jobs</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr
                key={String(p.id)}
                className="cursor-pointer border-t border-[var(--border)] transition-colors hover:bg-slate-50"
                onClick={() => void onOpenProviderDetails(Number(p.id))}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{formatHumanLabel(p.user_name)}</div>
                  <div className="text-xs text-[var(--muted)]">
                    ★ {String(p.rating_avg)} ({String(p.rating_count)})
                  </div>
                </td>
                <td className="px-4 py-3 capitalize">{formatHumanLabel(p.tier)}</td>
                <td className="px-4 py-3">{String(p.total_jobs_completed)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {p.verified ? "Verified" : "Unverified"} · {formatHumanLabel(p.current_status)}
                    {p.is_suspended ? " · Suspended" : ""}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="text-[var(--brand-dark)] hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onOpenProviderDetails(Number(p.id));
                      }}
                    >
                      Details
                    </button>
                    <button
                      className="text-[var(--brand-dark)] hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onPatchProvider(Number(p.id), {
                          verified: true,
                          current_status: "available",
                        });
                      }}
                    >
                      Verify
                    </button>
                    <button
                      className="text-[var(--danger)] hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onPatchProvider(Number(p.id), {
                          is_suspended: !p.is_suspended,
                          suspended_reason: p.is_suspended ? "" : "Policy violation",
                        });
                      }}
                    >
                      {p.is_suspended ? "Unsuspend" : "Suspend"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {docsOpen != null && (
        <div className="border-t border-[var(--border)] bg-slate-50 p-4 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium">KYC documents · provider #{docsOpen}</p>
            <button className="text-xs text-[var(--muted)]" onClick={() => onDocsOpen(null)}>
              Close
            </button>
          </div>
          {(docsByProvider[docsOpen] || []).length === 0 && (
            <p className="text-[var(--muted)]">No documents uploaded.</p>
          )}
          <ul className="space-y-2">
            {(docsByProvider[docsOpen] || []).map((d) => (
              <li
                key={String(d.id)}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2"
              >
                <div>
                  <div className="font-medium">{String(d.title)}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {formatHumanLabel(d.document_type)} · {formatHumanLabel(d.review_status)}
                  </div>
                  {d.file ? (
                    <a
                      className="text-xs text-[var(--brand-dark)] underline"
                      href={String(d.file)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open file
                    </a>
                  ) : null}
                </div>
                <div className="space-x-2">
                  <button
                    className="text-[var(--success)] hover:underline"
                    onClick={() => void onReviewDoc(Number(d.id), "approved")}
                  >
                    Approve
                  </button>
                  <button
                    className="text-[var(--danger)] hover:underline"
                    onClick={() => setRejectDocId(Number(d.id))}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />

      {(providerDetail || providerDetailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <section
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Provider details"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--border)] bg-white px-6 py-4">
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  {providerDetail
                    ? formatHumanLabel(providerDetail.user_name || "Provider")
                    : "Loading provider…"}
                </p>
                {providerDetail && (
                  <p className="text-sm text-[var(--muted)]">
                    Provider #{String(providerDetail.id)} ·{" "}
                    {formatHumanLabel(providerDetail.current_status)}
                  </p>
                )}
              </div>
              <button className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={onCloseProviderDetails}>
                Close
              </button>
            </div>

            {providerDetailLoading && !providerDetail ? (
              <p className="p-6 text-sm text-[var(--muted)]">Loading full profile and documents…</p>
            ) : providerDetail ? (
              <div className="space-y-6 p-6">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Detail label="Email" value={providerDetail.user_email} />
                  <Detail label="Phone" value={providerDetail.user_phone} />
                  <Detail label="Service" value={providerDetail.category && typeof providerDetail.category === "object" ? (providerDetail.category as { name?: string }).name : ""} />
                  <Detail label="Tier" value={formatHumanLabel(providerDetail.tier)} />
                  <Detail label="Pricing" value={`KES ${String(providerDetail.price_min ?? "—")} – ${String(providerDetail.price_max ?? "—")}`} />
                  <Detail label="Rating" value={`${String(providerDetail.rating_avg)} (${String(providerDetail.rating_count)} reviews)`} />
                  <Detail label="Completed jobs" value={providerDetail.total_jobs_completed} />
                  <Detail label="Response time" value={providerDetail.average_response_minutes != null ? `${String(providerDetail.average_response_minutes)} min` : ""} />
                  <Detail label="Service radius" value={providerDetail.service_radius_km != null ? `${String(providerDetail.service_radius_km)} km` : ""} />
                  <Detail label="Verification" value={providerDetail.verified ? "Verified" : "Unverified"} />
                  <Detail label="Profile" value={providerDetail.profile_complete ? "Complete" : "Incomplete"} />
                  <Detail label="Suspension" value={providerDetail.is_suspended ? `Suspended · ${String(providerDetail.suspended_reason || "No reason")}` : "Active"} />
                </div>

                <div>
                  <h3 className="font-semibold text-slate-900">Profile & location</h3>
                  <p className="mt-1 text-sm text-slate-700">{String(providerDetail.bio || "No biography provided.")}</p>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {String(providerDetail.area_formatted_address || "No service area saved")}
                    {providerDetail.base_lat != null && providerDetail.base_lng != null
                      ? ` · ${String(providerDetail.base_lat)}, ${String(providerDetail.base_lng)}`
                      : ""}
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-slate-900">Identity & uploaded documents</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {formatHumanLabel(providerDetail.id_document_kind || "ID type not recorded")} ·{" "}
                    {String(providerDetail.id_document_number || "ID number not recorded")}
                  </p>
                  {Array.isArray(providerDetail.documents) && providerDetail.documents.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {providerDetail.documents.map((document) => {
                        const d = document as Record<string, unknown>;
                        return (
                          <li key={String(d.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3">
                            <div>
                              <p className="font-medium text-slate-900">{String(d.title)}</p>
                              <p className="text-xs text-[var(--muted)]">
                                {formatHumanLabel(d.document_type)} · {formatHumanLabel(d.review_status)} · uploaded{" "}
                                {String(d.uploaded_at || "—")}
                              </p>
                              {d.review_notes ? <p className="mt-1 text-xs text-slate-600">Review note: {String(d.review_notes)}</p> : null}
                            </div>
                            <div className="flex items-center gap-3">
                              {d.file ? <a className="text-sm text-[var(--brand-dark)] underline" href={String(d.file)} target="_blank" rel="noreferrer">Open file</a> : null}
                              <button className="text-sm text-[var(--success)] hover:underline" onClick={() => void onReviewDoc(Number(d.id), "approved")}>Approve</button>
                              <button className="text-sm text-[var(--danger)] hover:underline" onClick={() => setRejectDocId(Number(d.id))}>Reject</button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[var(--muted)]">No documents uploaded.</p>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      )}

      <PromptModal
        open={rejectDocId != null}
        title="Reject document"
        description="Optional reason shared with the provider."
        confirmLabel="Reject"
        placeholder="Missing ID page, blurry image…"
        onCancel={() => setRejectDocId(null)}
        onConfirm={(notes) => {
          if (rejectDocId == null) return;
          void onReviewDoc(rejectDocId, "rejected", notes);
          setRejectDocId(null);
        }}
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: unknown }) {
  const text = value == null || value === "" ? "—" : String(value);
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 break-words text-sm text-slate-900">{text}</p>
    </div>
  );
}
