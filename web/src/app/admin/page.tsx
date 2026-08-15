"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAppSession } from "@/lib/session";
import type { CustomerJobLocation, LiveProvider } from "@/components/AdminLiveMap";
import { AdminShell } from "@/components/admin/AdminShell";
import { AccessPanel } from "@/components/admin/AccessPanel";
import { AdsTable } from "@/components/admin/AdsTable";
import { ComplaintsTable } from "@/components/admin/ComplaintsTable";
import { DataQualityPanel } from "@/components/admin/DataQualityPanel";
import { JobsTable } from "@/components/admin/JobsTable";
import { LiveOpsMapSection } from "@/components/admin/LiveOpsMapSection";
import { PaymentsTable } from "@/components/admin/PaymentsTable";
import { Pagination } from "@/components/admin/Pagination";
import { ProvidersTable } from "@/components/admin/ProvidersTable";
import { TermsPanel, type TermsVersion } from "@/components/admin/TermsPanel";
import { useAdminLiveFeed } from "@/hooks/useAdminLiveFeed";
import {
  type AdminTab,
  isAdminOnlyTab,
  useAdminOverview,
} from "@/hooks/useAdminOverview";
import type { AllowlistRole } from "@/components/admin/AccessPanel";

export default function AdminPage() {
  const pageSize = 20;
  const router = useRouter();
  const { token, data, role, error, loading, load, softRefresh } = useAdminOverview();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [complaints, setComplaints] = useState<Array<Record<string, unknown>>>([]);
  const [docsByProvider, setDocsByProvider] = useState<Record<number, Array<Record<string, unknown>>>>({});
  const [docsOpen, setDocsOpen] = useState<number | null>(null);
  const [providerDetail, setProviderDetail] = useState<Record<string, unknown> | null>(null);
  const [providerDetailLoading, setProviderDetailLoading] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busyDepthRef = useRef(0);
  const [allowedEmails, setAllowedEmails] = useState<
    Array<{ email: string; added_at: string; role?: AllowlistRole }>
  >([]);
  const [emailToAdd, setEmailToAdd] = useState("");
  const [roleToAdd, setRoleToAdd] = useState<AllowlistRole>("operations");
  const [pages, setPages] = useState<Record<string, number>>({});
  const [terms, setTerms] = useState<TermsVersion[]>([]);
  const [termsLoading, setTermsLoading] = useState(false);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityMessage, setQualityMessage] = useState("");
  const [qualitySummary, setQualitySummary] = useState<{
    total_providers: number;
    outside_kenya: number;
    missing_coords: number;
    inside_kenya: number;
    last_audit_at?: string | null;
    last_deleted?: number | null;
  } | null>(null);
  const [qualityCandidates, setQualityCandidates] = useState<
    Array<{
      provider_id: number;
      user_id: string;
      username?: string;
      email?: string;
      reasons: string[];
      base_lat?: number | null;
      base_lng?: number | null;
      current_lat?: number | null;
      current_lng?: number | null;
    }>
  >([]);

  function pageFor(key: string) {
    return pages[key] ?? 1;
  }

  function setPage(key: string, page: number) {
    setPages((previous) => ({ ...previous, [key]: Math.max(1, page) }));
  }

  function pageItems<T>(key: string, items: T[]) {
    const page = pageFor(key);
    const maxPage = Math.max(1, Math.ceil(items.length / pageSize));
    const safePage = Math.min(page, maxPage);
    return items.slice((safePage - 1) * pageSize, safePage * pageSize);
  }

  async function withBusy<T>(label: string, action: () => Promise<T>): Promise<T> {
    busyDepthRef.current += 1;
    setBusyLabel(label);
    try {
      return await action();
    } finally {
      busyDepthRef.current = Math.max(0, busyDepthRef.current - 1);
      if (busyDepthRef.current === 0) setBusyLabel(null);
    }
  }

  const { connection } = useAdminLiveFeed({
    token,
    onRefresh: softRefresh,
  });

  const loadComplaints = useCallback(
    async (access = token) => {
      if (!access) return;
      const res = await fetch("/api/services/complaints/", {
        headers: { Authorization: `Bearer ${access}` },
      });
      if (res.ok) setComplaints(await res.json());
    },
    [token],
  );

  const loadAllowedEmails = useCallback(
    async (access = token) => {
      if (!access) return;
      const res = await fetch("/api/admin/allowed-emails/", {
        headers: { Authorization: `Bearer ${access}` },
      });
      const body = await res.json();
      if (!res.ok) {
        alert(body.detail || "Failed to load admin access");
        return;
      }
      setAllowedEmails(body);
    },
    [token],
  );

  const loadQuality = useCallback(
    async (access = token) => {
      if (!access) return;
      setQualityLoading(true);
      setQualityMessage("");
      try {
        const res = await fetch("/api/admin/data-quality/", {
          headers: { Authorization: `Bearer ${access}` },
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || "Audit failed");
        setQualitySummary(body.summary);
        setQualityCandidates(body.candidates || []);
        setQualityMessage(
          `Audit complete: ${body.summary.outside_kenya} outside Kenya, ${body.summary.missing_coords} missing coordinates.`,
        );
      } catch (e) {
        setQualityMessage(e instanceof Error ? e.message : "Audit failed");
      } finally {
        setQualityLoading(false);
      }
    },
    [token],
  );

  const loadTerms = useCallback(
    async (access = token) => {
      if (!access) return;
      setTermsLoading(true);
      try {
        const res = await fetch("/api/admin/terms/", {
          headers: { Authorization: `Bearer ${access}` },
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || "Failed to load terms");
        setTerms(body);
      } finally {
        setTermsLoading(false);
      }
    },
    [token],
  );

  const isFullAdmin = role === "admin";

  useEffect(() => {
    if (role === "operations" && isAdminOnlyTab(tab)) {
      setTab("overview");
    }
  }, [role, tab]);

  useEffect(() => {
    if (!token) return;
    if (tab === "complaints") void loadComplaints(token);
    if (isFullAdmin && tab === "access") void loadAllowedEmails(token);
    if (isFullAdmin && tab === "quality") void loadQuality(token);
    if (isFullAdmin && tab === "terms") void loadTerms(token);
  }, [token, tab, isFullAdmin, loadComplaints, loadAllowedEmails, loadQuality, loadTerms]);

  function handleTabChange(next: AdminTab) {
    if (role === "operations" && isAdminOnlyTab(next)) {
      setTab("overview");
      return;
    }
    setTab(next);
  }

  async function patchProvider(providerId: number, patch: Record<string, unknown>) {
    await withBusy("Updating provider…", async () => {
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
    });
  }

  async function setAdStatus(id: number, status: string) {
    await withBusy("Updating ad…", async () => {
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
    });
  }

  async function saveAd(
    id: number,
    patch: {
      title: string;
      description: string;
      category: string;
      status: string;
      target_country: string;
      target_city: string;
    },
  ) {
    await withBusy("Saving ad…", async () => {
      if (!token) return;
      const res = await fetch(`/api/ads/my/${id}/`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) {
        alert(body.detail || "Failed to save ad");
        return;
      }
      await load(token, { soft: true });
    });
  }

  async function deleteAd(id: number) {
    await withBusy("Deleting ad…", async () => {
      if (!token) return;
      const res = await fetch(`/api/ads/my/${id}/`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert((body as { detail?: string }).detail || "Failed to delete ad");
        return;
      }
      await load(token, { soft: true });
    });
  }

  async function loadProviderDocs(profileId: number) {
    await withBusy("Loading documents…", async () => {
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
    });
  }

  async function openProviderDetails(profileId: number) {
    await withBusy("Loading provider details…", async () => {
      if (!token) return;
      setProviderDetail(null);
      setProviderDetailLoading(true);
      try {
        const res = await fetch(`/api/services/providers/admin/?provider_id=${profileId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || "Failed to load provider details");
        setProviderDetail(body);
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to load provider details");
      } finally {
        setProviderDetailLoading(false);
      }
    });
  }

  async function reviewDoc(
    documentId: number,
    review_status: "approved" | "rejected",
    review_notes = "",
  ) {
    await withBusy(review_status === "approved" ? "Approving document…" : "Rejecting document…", async () => {
      if (!token) return;
      const res = await fetch("/api/services/providers/admin/documents/", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ document_id: documentId, review_status, review_notes }),
      });
      const body = await res.json();
      if (!res.ok) {
        alert(body.detail || "Review failed");
        return;
      }
      if (docsOpen != null) await loadProviderDocs(docsOpen);
      if (providerDetail?.id != null) await openProviderDetails(Number(providerDetail.id));
    });
  }

  async function patchComplaint(id: number, status: string, resolution_notes = "") {
    await withBusy("Updating complaint…", async () => {
      if (!token) return;
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
    });
  }

  async function addAllowedEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withBusy("Granting portal access…", async () => {
      if (!token || !emailToAdd.trim()) return;
      const res = await fetch("/api/admin/allowed-emails/", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToAdd, role: roleToAdd }),
      });
      const body = await res.json();
      if (!res.ok) {
        alert(body.detail || "Could not grant access");
        return;
      }
      setEmailToAdd("");
      setRoleToAdd("operations");
      await loadAllowedEmails(token);
    });
  }

  async function removeAllowedEmail(email: string) {
    await withBusy("Removing admin access…", async () => {
      if (!token) return;
      const res = await fetch("/api/admin/allowed-emails/", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json();
        alert(body.detail || "Could not remove access");
        return;
      }
      await loadAllowedEmails(token);
    });
  }

  async function createTerms(payload: {
    version: string;
    title: string;
    body: string;
    audience: "all" | "customer" | "provider";
    publish: boolean;
  }) {
    await withBusy(payload.publish ? "Publishing terms…" : "Saving terms…", async () => {
      if (!token) return;
      const res = await fetch("/api/admin/terms/", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        alert(body.detail || "Could not save terms");
        return;
      }
      await loadTerms(token);
    });
  }

  async function publishTerms(id: number) {
    await withBusy("Publishing terms…", async () => {
      if (!token) return;
      const res = await fetch("/api/admin/terms/", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id, publish: true }),
      });
      const body = await res.json();
      if (!res.ok) {
        alert(body.detail || "Could not publish terms");
        return;
      }
      await loadTerms(token);
    });
  }

  async function runCleanup() {
    await withBusy("Cleaning outside-Kenya providers…", async () => {
      if (!token) return;
      setQualityLoading(true);
      setQualityMessage("");
      try {
        const res = await fetch("/api/admin/data-quality/cleanup/", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ confirm: true }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || "Cleanup failed");
        setQualityMessage(`Deleted ${body.deleted_count} outside-Kenya providers.`);
        await Promise.all([loadQuality(token), load(token, { soft: true })]);
      } catch (e) {
        setQualityMessage(e instanceof Error ? e.message : "Cleanup failed");
      } finally {
        setQualityLoading(false);
      }
    });
  }

  async function logout() {
    await clearAppSession();
    router.replace("/login");
  }

  const customerJobs: CustomerJobLocation[] = useMemo(
    () =>
      (data?.jobs ?? []).flatMap((job) => {
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
      }),
    [data?.jobs],
  );

  const providers: LiveProvider[] = useMemo(
    () =>
      (data?.providers ?? []).flatMap((provider) => {
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
                recordedAt: provider.last_seen_at ? String(provider.last_seen_at) : undefined,
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
      }),
    [data?.providers, data?.jobs],
  );

  return (
    <AdminShell
      tab={tab}
      onTabChange={handleTabChange}
      connection={connection}
      onLogout={logout}
      role={role}
      busy={Boolean(busyLabel) || (loading && !data)}
      busyLabel={busyLabel || (loading && !data ? "Loading admin console…" : undefined)}
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {tab === "overview" && (
        <LiveOpsMapSection
          providers={providers}
          customerJobs={customerJobs}
          connection={connection}
          loading={loading && !data}
        />
      )}

      {tab === "providers" && (
        <ProvidersTable
          providers={pageItems("providers", data?.providers || [])}
          docsByProvider={docsByProvider}
          docsOpen={docsOpen}
          onDocsOpen={setDocsOpen}
          onLoadDocs={loadProviderDocs}
          providerDetail={providerDetail}
          providerDetailLoading={providerDetailLoading}
          onOpenProviderDetails={openProviderDetails}
          onCloseProviderDetails={() => setProviderDetail(null)}
          onPatchProvider={patchProvider}
          onReviewDoc={reviewDoc}
          page={pageFor("providers")}
          pageSize={pageSize}
          total={data?.providers.length || 0}
          onPageChange={(page) => setPage("providers", page)}
        />
      )}

      {tab === "jobs" && (
        <JobsTable
          jobs={pageItems("jobs", data?.jobs || [])}
          page={pageFor("jobs")}
          pageSize={pageSize}
          total={data?.jobs.length || 0}
          onPageChange={(page) => setPage("jobs", page)}
        />
      )}
      {tab === "payments" && (
        <PaymentsTable
          payments={pageItems("payments", data?.payments || [])}
          page={pageFor("payments")}
          pageSize={pageSize}
          total={data?.payments.length || 0}
          onPageChange={(page) => setPage("payments", page)}
        />
      )}
      {isFullAdmin && tab === "ads" && (
        <AdsTable
          ads={pageItems("ads", data?.ads || [])}
          onSetStatus={setAdStatus}
          onSaveAd={saveAd}
          onDeleteAd={deleteAd}
          page={pageFor("ads")}
          pageSize={pageSize}
          total={data?.ads.length || 0}
          onPageChange={(page) => setPage("ads", page)}
        />
      )}
      {tab === "complaints" && (
        <ComplaintsTable
          complaints={pageItems("complaints", complaints)}
          onPatch={patchComplaint}
          page={pageFor("complaints")}
          pageSize={pageSize}
          total={complaints.length}
          onPageChange={(page) => setPage("complaints", page)}
        />
      )}
      {isFullAdmin && tab === "access" && (
        <AccessPanel
          emails={pageItems("access", allowedEmails)}
          emailToAdd={emailToAdd}
          roleToAdd={roleToAdd}
          onEmailToAddChange={setEmailToAdd}
          onRoleToAddChange={setRoleToAdd}
          onAdd={addAllowedEmail}
          onRemove={removeAllowedEmail}
          page={pageFor("access")}
          pageSize={pageSize}
          total={allowedEmails.length}
          onPageChange={(page) => setPage("access", page)}
        />
      )}
      {isFullAdmin && tab === "terms" && (
        <div className="space-y-4">
          <TermsPanel
            terms={pageItems("terms", terms)}
            loading={termsLoading}
            onCreate={createTerms}
            onPublish={publishTerms}
          />
          <div className="rounded-2xl border border-[var(--border)] bg-white shadow-sm">
            <Pagination
              page={pageFor("terms")}
              pageSize={pageSize}
              total={terms.length}
              onPageChange={(page) => setPage("terms", page)}
            />
          </div>
        </div>
      )}
      {isFullAdmin && tab === "quality" && (
        <DataQualityPanel
          loading={qualityLoading}
          summary={qualitySummary}
          candidates={qualityCandidates}
          message={qualityMessage}
          onAudit={async () => {
            await withBusy("Auditing provider locations…", async () => {
              await loadQuality(token);
            });
          }}
          onCleanup={runCleanup}
        />
      )}
    </AdminShell>
  );
}
