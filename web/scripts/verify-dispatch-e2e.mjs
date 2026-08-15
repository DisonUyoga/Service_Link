import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const base = "http://localhost:3001/api";
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${response.status} ${body.detail || JSON.stringify(body)}`);
  return body;
}

async function token(username, password) {
  const data = await request("/accounts/token/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return data.access;
}

const headers = (access) => ({
  Authorization: `Bearer ${access}`,
  "Content-Type": "application/json",
});

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

let jobId;
try {
  const customer = await token("demo_customer", "DemoPass123!");
  const created = await request("/services/jobs/", {
    method: "POST",
    headers: headers(customer),
    body: JSON.stringify({
      category: "Plumbing",
      description: "E2E test: urgent kitchen sink leak near Nairobi CBD.",
      location_lat: -1.286389,
      location_lng: 36.817223,
      formatted_address: "Nairobi CBD test pin",
      recipient_name: "E2E Recipient",
      recipient_phone: "0712345678",
    }),
  });
  jobId = created.id;
  if (!created.dispatch?.dispatched) throw new Error("Initial AI dispatch was not created");

  const { data: initial, error: initialError } = await service
    .from("job_dispatches")
    .select("provider_user_id,status,rank")
    .eq("job_id", jobId)
    .order("rank");
  if (initialError || !initial?.length || initial[0].status !== "notified") {
    throw new Error("Initial dispatch rows are missing or invalid");
  }

  await request("/services/jobs/expire-pending/?timeout_min=0", {
    method: "POST",
    headers: headers(customer),
  });
  const { data: broadcast, error: broadcastError } = await service
    .from("job_dispatches")
    .select("provider_user_id,status,rank")
    .eq("job_id", jobId)
    .order("rank");
  if (broadcastError || !broadcast?.some((row) => row.status === "broadcast")) {
    throw new Error("Fallback broadcast was not created");
  }

  const receiver = broadcast.find((row) => row.status === "broadcast");
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("username")
    .eq("id", receiver.provider_user_id)
    .single();
  if (profileError || !profile?.username) throw new Error("Could not resolve broadcast recipient");

  const providerAccess = await token(profile.username, "DemoPass123!");
  await request(`/services/jobs/${jobId}/`, {
    headers: headers(providerAccess),
  });
  await request(`/services/jobs/${jobId}/accept/`, {
    method: "POST",
    headers: headers(providerAccess),
  });

  const { data: claimed, error: claimedError } = await service
    .from("job_requests")
    .select("status,provider_id")
    .eq("id", jobId)
    .single();
  if (claimedError || !["accepted", "in_progress"].includes(claimed.status) || claimed.provider_id !== receiver.provider_user_id) {
    throw new Error("Broadcast provider did not atomically claim the job");
  }

  console.log("DISPATCH_E2E_OK", JSON.stringify({
    job_id: jobId,
    candidate_count: initial.length,
    broadcast_recipient: profile.username,
  }));
} finally {
  if (jobId) {
    const { error } = await service.from("job_requests").delete().eq("id", jobId);
    if (error) console.error("Test cleanup failed:", error.message);
  }
}
