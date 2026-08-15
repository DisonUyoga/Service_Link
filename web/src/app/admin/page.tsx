"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { clearAppSession } from "@/lib/session";
import { AdminLiveMap, type CustomerJobLocation, type LiveProvider } from "@/components/AdminLiveMap";
import { useAdminLiveFeed } from "@/hooks/useAdminLiveFeed";

type Overview = {
  jobs: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  providers: Array<Record<string, unknown>>;
  ads: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
};

export default function AdminPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"providers" | "jobs" | "payments" | "ads" | "complaints">("providers");
  const [complaints, setComplaints] = useState<Array<Record<string, unknown>>>([]);
  const [docsByProvider, setDocsByProvider] = useState<Record<number, Array<Record<string, unknown>>>>({});
  const [docsOpen, setDocsOpen] = useState<number | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("slink_access");
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
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
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
        if (String(e).toLowerCase().includes("token") || String(e).includes("401")) {
          localStorage.removeItem("slink_access");
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

  useEffect(() => {
    if (token && tab === "complaints") void loadComplaints(token);
  }, [token, tab]);

  const softRefresh = useCallback(() => {
    if (token) void load(token, { soft: true });
  }, [token, load]);

  const { connection } = useAdminLiveFeed({
    token,
    onRefresh: softRefresh,
  });

  async function patchProvider(providerId: number, patch: Record<string, unknown>) {
    if (!token) return;
    const res = await fetch("/api/services/providers/admin/", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ provider_id: providerId, ...patch }),
    });
    const body = await res.json();
    if (!res.ok) {
      alert(body.detail || "Update failed");
      return;
    }
    await load(token, { soft: true });
  }

  async function setAdStatus(id: number, status: string) {
    if (!token) return;
    const res = await fetch(`/api/ads/my/${id}/`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });
    const body = await res.json();
    if (!res.ok) {
      alert(body.detail || "Update failed");
      return;
    }
    await load(token, { soft: true });
  }

  async function loadComplaints(access = token) {
    if (!access) return;
    const res = await fetch("/api/services/complaints/", {
      headers: { Authorization: `Bearer ${access}` },
    });
    if (res.ok) setComplaints(await res.json());
  }

  async function loadProviderDocs(profileId: number) {
    if (!token) return;
    const res = await fetch(
      `/api/services/providers/admin/documents/?profile_id=${profileId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await res.json();
    if (!res.ok) {
      alert(body.detail || "Failed to load documents");
      return;
    }
    setDocsByProvider((prev) => ({ ...prev, [profileId]: body }));
    setDocsOpen(profileId);
  }

  async function reviewDoc(documentId: number, review_status: "approved" | "rejected") {
    if (!token) return;
    const notes =
      review_status === "rejected"
        ? window.prompt("Rejection reason (optional)") || ""
        : "";
    const res = await fetch("/api/services/providers/admin/documents/", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ document_id: documentId, review_status, review_notes: notes }),
    });
    const body = await res.json();
    if (!res.ok) {
      alert(body.detail || "Review failed");
      return;
    }
    if (docsOpen != null) await loadProviderDocs(docsOpen);
  }

  async function patchComplaint(id: number, status: string) {
    if (!token) return;
    const resolution_notes =
      status === "resolved" || status === "dismissed"
        ? window.prompt("Resolution notes") || ""
        : "";
    const res = await fetch("/api/services/complaints/", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, status, resolution_notes }),
    });
    if (!res.ok) {
      const body = await res.json();
      alert(body.detail || "Update failed");
      return;
    }
    await loadComplaints(token);
  }

  async function logout() {
    await clearAppSession();
    router.replace("/login");
  }

  const customerJobs: CustomerJobLocation[] = (data?.jobs ?? []).flatMap((job) => {
    const lat = Number(job.location_lat);
    const lng = Number(job.location_lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    return [
      {
        id: Number(job.id),
        description: String(job.description ?? "Service request"),
        status: String(job.status ?? "pending_provider"),
        lat,
        lng,
        address: String(job.address_text ?? ""),
      },
    ];
  });

  const providers: LiveProvider[] = (data?.providers ?? []).flatMap((provider) => {
    // Prefer live heartbeat coords, then job trail, then onboarding base.
    const currentLat = Number(provider.current_lat);
    const currentLng = Number(provider.current_lng);
    const baseLat = Number(provider.base_lat);
    const baseLng = Number(provider.base_lng);
    const lat = Number.isFinite(currentLat) ? currentLat : baseLat;
    const lng = Number.isFinite(currentLng) ? currentLng : baseLng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

    const activeJob = (data?.jobs ?? []).find(
      (job) =>
        Number(job.provider) === Number(provider.id) &&
        ["accepted", "in_progress"].includes(String(job.status)),
    );
    const latest = activeJob?.latest_location as
      | { lat?: number; lng?: number; recorded_at?: string }
      | null
      | undefined;
    const latestLat = Number(latest?.lat);
    const latestLng = Number(latest?.lng);
    const heartbeatAsLatest =
      Number.isFinite(currentLat) && Number.isFinite(currentLng)
        ? {
            lat: currentLat,
            lng: currentLng,
            recordedAt: provider.last_seen_at
              ? String(provider.last_seen_at)
              : undefined,
          }
        : null;
    return [
      {
        id: Number(provider.id),
        name: String(provider.user_name ?? "Provider"),
        lat: baseLat || lat,
        lng: baseLng || lng,
        status: String(provider.current_status ?? "offline"),
        ...(Number.isFinite(latestLat) && Number.isFinite(latestLng)
          ? {
              latestLocation: {
                lat: latestLat,
                lng: latestLng,
                recordedAt: latest?.recorded_at,
              },
            }
          : heartbeatAsLatest
            ? { latestLocation: heartbeatAsLatest }
            : {}),
      },
    ];
  });

  const liveLabel =
    connection === "live"
      ? "Live"
      : connection === "connecting"
        ? "Connecting…"
        : connection === "reconnecting"
          ? "Reconnecting…"
          : "Offline";

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Image
              src="/s-link-logo.png"
              alt="S-Link"
              width={40}
              height={40}
              className="rounded-xl object-cover shadow-sm"
              priority
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--brand)]">
                S-Link
              </p>
              <h1 className="text-xl font-bold">Admin Console</h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/" className="text-[var(--muted)] hover:text-foreground">
              Home
            </Link>
            <button
              onClick={logout}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-700"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <section
          className="mb-6 rounded-2xl p-6 text-white shadow-sm"
          style={{
            background:
              "linear-gradient(90deg, var(--brand-mid) 0%, var(--brand) 55%, var(--brand-dark) 100%)",
          }}
        >
          <h2 className="text-2xl font-bold">Live Operations Map</h2>
          <p className="mt-1 text-sm text-white/90">
            Provider and customer locations update automatically via Supabase Realtime.
          </p>
        </section>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div>
              <h2 className="font-semibold">Live locations</h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                <span className="mr-3 inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[var(--brand)]" /> Providers:{" "}
                  {providers.length}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-600" /> Customer jobs:{" "}
                  {customerJobs.length}
                </span>
              </p>
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-slate-50 px-3 py-1.5 text-xs font-medium"
              title="Connected to Supabase Realtime"
            >
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
            </div>
          </div>
          <div className="h-[62vh] min-h-[440px]">
            {(data || !loading) && (
              <AdminLiveMap providers={providers} customerJobs={customerJobs} />
            )}
            {loading && !data && (
              <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
                Loading live locations…
              </div>
            )}
          </div>
        </section>

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          {[
            ["Providers", data?.providers.length ?? "—"],
            ["Jobs", data?.jobs.length ?? "—"],
            ["Payments", data?.payments.length ?? "—"],
            ["Ads", data?.ads.length ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
              <p className="mt-1 text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(["providers", "jobs", "payments", "ads", "complaints"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm capitalize ${
                tab === t
                  ? "bg-[var(--brand)] text-white"
                  : "bg-white border border-[var(--border)] text-[var(--muted)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
          {loading && !data && <p className="p-6 text-sm text-[var(--muted)]">Loading…</p>}
          {tab === "providers" && (
            <table className="w-full text-left text-sm">
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
                {(data?.providers || []).map((p) => (
                  <tr key={String(p.id)} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3">
                      <div className="font-medium">{String(p.user_name)}</div>
                      <div className="text-xs text-[var(--muted)]">
                        ★ {String(p.rating_avg)} ({String(p.rating_count)})
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize">{String(p.tier)}</td>
                    <td className="px-4 py-3">{String(p.total_jobs_completed)}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                        {p.verified ? "verified" : "unverified"} · {String(p.current_status)}
                        {p.is_suspended ? " · suspended" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 space-x-2">
                      <button
                        className="text-[var(--brand-dark)] hover:underline"
                        onClick={() => void loadProviderDocs(Number(p.id))}
                      >
                        Docs
                      </button>
                      <button
                        className="text-[var(--brand-dark)] hover:underline"
                        onClick={() =>
                          patchProvider(Number(p.id), {
                            verified: true,
                            current_status: "available",
                          })
                        }
                      >
                        Verify
                      </button>
                      <button
                        className="text-[var(--danger)] hover:underline"
                        onClick={() =>
                          patchProvider(Number(p.id), {
                            is_suspended: !p.is_suspended,
                            suspended_reason: p.is_suspended ? "" : "Policy violation",
                          })
                        }
                      >
                        {p.is_suspended ? "Unsuspend" : "Suspend"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "providers" && docsOpen != null && (
            <div className="border-t border-[var(--border)] bg-slate-50 p-4 text-sm">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium">KYC documents · provider #{docsOpen}</p>
                <button className="text-xs text-[var(--muted)]" onClick={() => setDocsOpen(null)}>
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
                        {String(d.document_type)} · {String(d.review_status)}
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
                        onClick={() => void reviewDoc(Number(d.id), "approved")}
                      >
                        Approve
                      </button>
                      <button
                        className="text-[var(--danger)] hover:underline"
                        onClick={() => void reviewDoc(Number(d.id), "rejected")}
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === "jobs" && (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Paid</th>
                </tr>
              </thead>
              <tbody>
                {(data?.jobs || []).map((j) => (
                  <tr key={String(j.id)} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3">#{String(j.id)}</td>
                    <td className="px-4 py-3">{String(j.description)}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-[var(--brand-light)] px-2 py-0.5 text-xs text-[var(--brand-dark)]">
                        {String(j.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{j.is_paid ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "payments" && (
            <table className="w-full text-left text-sm">
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
                {(data?.payments || []).map((p) => (
                  <tr key={String(p.id)} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3">#{String(p.id)}</td>
                    <td className="px-4 py-3">#{String(p.job_id ?? p.job)}</td>
                    <td className="px-4 py-3">
                      {String(p.currency)} {String(p.amount)}
                    </td>
                    <td className="px-4 py-3">{String(p.status)}</td>
                    <td className="px-4 py-3 text-xs text-[var(--muted)]">
                      {String(p.mpesa_reference || "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "complaints" && (
            <table className="w-full text-left text-sm">
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
                    <td className="px-4 py-3">{String(c.category)}</td>
                    <td className="px-4 py-3 max-w-md truncate">{String(c.body)}</td>
                    <td className="px-4 py-3">{String(c.status)}</td>
                    <td className="px-4 py-3 space-x-2">
                      <button
                        className="text-[var(--brand-dark)] hover:underline"
                        onClick={() => void patchComplaint(Number(c.id), "in_review")}
                      >
                        Review
                      </button>
                      <button
                        className="text-[var(--success)] hover:underline"
                        onClick={() => void patchComplaint(Number(c.id), "resolved")}
                      >
                        Resolve
                      </button>
                      <button
                        className="text-[var(--muted)] hover:underline"
                        onClick={() => void patchComplaint(Number(c.id), "dismissed")}
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
          )}

          {tab === "ads" && (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.ads || []).map((a) => (
                  <tr key={String(a.id)} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3">{String(a.title)}</td>
                    <td className="px-4 py-3">{String(a.category || "—")}</td>
                    <td className="px-4 py-3">{String(a.status)}</td>
                    <td className="px-4 py-3 space-x-2">
                      <button
                        className="text-[var(--success)] hover:underline"
                        onClick={() => setAdStatus(Number(a.id), "active")}
                      >
                        Activate
                      </button>
                      <button
                        className="text-[var(--warn)] hover:underline"
                        onClick={() => setAdStatus(Number(a.id), "paused")}
                      >
                        Pause
                      </button>
                    </td>
                  </tr>
                ))}
                {(data?.ads || []).length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-[var(--muted)]" colSpan={4}>
                      No ads yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
