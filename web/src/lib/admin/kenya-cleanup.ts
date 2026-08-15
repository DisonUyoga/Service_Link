import { classifyKenyaCoords } from "@/lib/geo/kenya";
import { createServiceClient } from "@/lib/supabase/admin";

export type OutsideKenyaCandidate = {
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

export async function auditOutsideKenyaProviders() {
  const client = createServiceClient();
  const { data, error } = await client
    .from("service_provider_profiles")
    .select(
      "id, user_id, base_lat, base_lng, current_lat, current_lng, profiles(username, email)",
    )
    .order("id");
  if (error) throw error;

  const candidates: OutsideKenyaCandidate[] = [];
  let missing = 0;
  let inside = 0;

  for (const row of data || []) {
    const profile = Array.isArray((row as { profiles?: unknown }).profiles)
      ? (row as { profiles: Array<{ username?: string; email?: string }> }).profiles[0]
      : (row as { profiles?: { username?: string; email?: string } | null }).profiles;
    const classification = classifyKenyaCoords(row);
    if (classification.missing_coords) {
      missing += 1;
      continue;
    }
    if (classification.outside_kenya) {
      candidates.push({
        provider_id: row.id,
        user_id: row.user_id,
        username: profile?.username,
        email: profile?.email,
        reasons: classification.reasons,
        base_lat: row.base_lat,
        base_lng: row.base_lng,
        current_lat: row.current_lat,
        current_lng: row.current_lng,
      });
    } else {
      inside += 1;
    }
  }

  return {
    summary: {
      total_providers: (data || []).length,
      outside_kenya: candidates.length,
      missing_coords: missing,
      inside_kenya: inside,
      last_audit_at: new Date().toISOString(),
    },
    candidates,
  };
}

export async function deleteOutsideKenyaProvider(candidate: {
  provider_id: number;
  user_id: string;
}) {
  const client = createServiceClient();
  await client.from("provider_legal_documents").delete().eq("profile_id", candidate.provider_id);
  await client.from("provider_locations").delete().eq("provider_id", candidate.user_id);
  await client.from("job_requests").update({ provider_id: null }).eq("provider_id", candidate.user_id);
  const { error: providerError } = await client
    .from("service_provider_profiles")
    .delete()
    .eq("id", candidate.provider_id);
  if (providerError) throw providerError;
  const { error: profileError } = await client.from("profiles").delete().eq("id", candidate.user_id);
  if (profileError) throw profileError;
}

export async function backupOutsideKenyaRows(candidates: OutsideKenyaCandidate[]) {
  const client = createServiceClient();
  const userIds = candidates.map((row) => row.user_id);
  const providerIds = candidates.map((row) => row.provider_id);
  if (!userIds.length) {
    return { profiles: [], providers: [], candidates };
  }
  const [{ data: profiles, error: profileError }, { data: providers, error: providerError }] =
    await Promise.all([
      client.from("profiles").select("*").in("id", userIds),
      client.from("service_provider_profiles").select("*").in("id", providerIds),
    ]);
  if (profileError) throw profileError;
  if (providerError) throw providerError;
  return {
    created_at: new Date().toISOString(),
    profiles: profiles || [],
    providers: providers || [],
    candidates,
  };
}
