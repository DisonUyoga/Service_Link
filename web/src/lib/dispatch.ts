import { createServiceClient } from "@/lib/supabase/admin";
import { rankProvidersWithGemini } from "@/lib/ai/provider-ranking";
import { notifyDevices } from "@/lib/notifications/fcm";
import { logger } from "@/lib/logger";

type Candidate = {
  id: number;
  score?: number;
  distance_km: number;
  rating_avg: number;
  tier: string;
  price_min?: number;
  price_max?: number;
};

async function notifyUsers(
  userIds: string[],
  job: { id: number; description: string; formatted_address?: string },
  broadcast: boolean,
) {
  const client = createServiceClient();
  const { data: rows, error } = await client
    .from("provider_device_tokens")
    .select("token")
    .in("user_id", userIds);
  if (error) throw error;
  return notifyDevices(
    (rows ?? []).map((row) => row.token),
    {
      title: broadcast ? "New job available near you" : "New job request",
      body: `${job.description.slice(0, 110)}${job.formatted_address ? ` · ${job.formatted_address}` : ""}`,
      data: {
        type: broadcast ? "job_broadcast" : "job_offer",
        job_id: String(job.id),
      },
    },
  );
}

/** Stores all AI-ranked candidates but alerts only rank #1. */
export async function startAiDispatch(
  job: { id: number; description: string; formatted_address?: string },
  candidates: Candidate[],
) {
  const ranking = await rankProvidersWithGemini(job.description, candidates);
  if (!ranking.orderedIds.length) return { ...ranking, dispatched: false };

  const client = createServiceClient();
  const { data: profiles, error } = await client
    .from("service_provider_profiles")
    .select("id, user_id")
    .in("id", ranking.orderedIds);
  if (error) throw error;
  const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile.user_id]));
  const rows = ranking.orderedIds.flatMap((profileId, index) => {
    const userId = byId.get(profileId);
    return userId
      ? [{
          job_id: job.id,
          provider_user_id: userId,
          rank: index + 1,
          status: index === 0 ? "notified" : "queued",
          wave: 1,
          notified_at: index === 0 ? new Date().toISOString() : null,
        }]
      : [];
  });
  if (!rows.length) return { ...ranking, dispatched: false };

  const first = rows[0];
  const { error: insertError } = await client
    .from("job_dispatches")
    .upsert(rows, { onConflict: "job_id,provider_user_id" });
  if (insertError) throw insertError;
  const { error: jobError } = await client
    .from("job_requests")
    .update({
      provider_id: first.provider_user_id,
      dispatch_started_at: new Date().toISOString(),
      ai_dispatch_reason: ranking.reason,
    })
    .eq("id", job.id);
  if (jobError) throw jobError;
  const push = await notifyUsers([first.provider_user_id], job, false);
  logger.info("dispatch.initial", {
    job_id: job.id,
    candidate_count: rows.length,
    ai: ranking.usedAi,
    push_sent: push.sent,
  });
  return { ...ranking, dispatched: true, initial_provider_id: first.provider_user_id, push };
}

/** After timeout, open the job to all remaining ranked providers and notify them. */
export async function broadcastTimedOutDispatches(timeoutMinutes = 5) {
  const client = createServiceClient();
  const cutoff = new Date(Date.now() - timeoutMinutes * 60_000).toISOString();
  const { data: jobs, error } = await client
    .from("job_requests")
    .select("id, description, formatted_address, pending_since")
    .eq("status", "pending_provider")
    .not("dispatch_started_at", "is", null)
    .is("dispatch_broadcast_at", null)
    .lt("dispatch_started_at", cutoff);
  if (error) throw error;

  const broadcasts: Array<{ job_id: number; recipients: number; push_sent: number }> = [];
  for (const job of jobs ?? []) {
    const { data: queued, error: queuedError } = await client
      .from("job_dispatches")
      .select("provider_user_id")
      .eq("job_id", job.id)
      .eq("status", "queued");
    if (queuedError) throw queuedError;
    const users = (queued ?? []).map((row) => row.provider_user_id);
    if (!users.length) continue;
    const now = new Date().toISOString();
    const { error: dispatchError } = await client
      .from("job_dispatches")
      .update({ status: "broadcast", wave: 2, notified_at: now })
      .eq("job_id", job.id)
      .eq("status", "queued");
    if (dispatchError) throw dispatchError;
    const { error: jobError } = await client
      .from("job_requests")
      .update({ provider_id: null, dispatch_broadcast_at: now })
      .eq("id", job.id)
      .eq("status", "pending_provider");
    if (jobError) throw jobError;
    const push = await notifyUsers(users, job, true);
    broadcasts.push({ job_id: job.id, recipients: users.length, push_sent: push.sent });
  }
  return { count: broadcasts.length, broadcasts };
}
