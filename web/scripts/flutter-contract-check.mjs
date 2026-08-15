/**
 * Flutter ↔ Next API contract smoke test (updated-s-link Dio inventory).
 * Usage: node scripts/flutter-contract-check.mjs
 * Env: BASE_URL (default http://localhost:3001/api)
 */
const BASE = process.env.BASE_URL || "http://localhost:3001/api";

async function req(method, path, { body, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const suffix = Math.floor(Math.random() * 1e6);
  const cust = `fc${suffix}`;
  const prov = `fp${suffix}`;

  let r = await req("GET", "/config/");
  assert(r.status === 200 && typeof r.data.connection_fee_kes === "number", "config");

  r = await req("GET", "/services/autocomplete/?q=plumb");
  assert(r.status === 200 && Array.isArray(r.data), "autocomplete");

  r = await req("POST", "/accounts/register/", {
    body: {
      username: cust,
      email: `${cust}@t.com`,
      password: "password123",
      role: "customer",
      phone_number: "0712345678",
    },
  });
  assert(r.status === 201, `register customer ${r.status}`);
  assert(r.data.phone_number === "254712345678" || r.data.phone === "254712345678", "register phone");

  r = await req("POST", "/accounts/register/", {
    body: { username: prov, email: `${prov}@t.com`, password: "password123", role: "provider" },
  });
  assert(r.status === 201, `register provider ${r.status}`);

  r = await req("POST", "/accounts/token/", { body: { username: cust, password: "password123" } });
  assert(r.status === 200 && typeof r.data.access === "string", "customer token");
  assert(r.data.role === "customer" && r.data.username === cust, "token extras");
  const custTok = r.data.access;

  r = await req("POST", "/accounts/token/", { body: { username: prov, password: "password123" } });
  assert(r.status === 200 && typeof r.data.access === "string", "provider token");
  const provTok = r.data.access;

  r = await req("POST", "/accounts/google-login/", {
    body: { email: `g${suffix}@gmail.com`, name: "Google User" },
  });
  assert(r.status === 200 && typeof r.data.access === "string", "django google login");

  r = await req("GET", "/accounts/me/", { token: custTok });
  assert(r.status === 200 && r.data.role === "customer", "me");
  assert(typeof r.data.phone_number === "string", "me phone_number alias");

  r = await req("PATCH", "/accounts/me/", {
    token: custTok,
    body: { phone_number: "0799887766" },
  });
  assert(r.status === 200 && r.data.phone_number === "254799887766", "patch me phone");

  r = await req("GET", "/services/categories/");
  assert(r.status === 200 && Array.isArray(r.data) && r.data.length >= 1, "categories");
  const categoryId = r.data[0].id;

  r = await req("PUT", "/services/providers/me/", {
    token: provTok,
    body: {
      bio: "Licensed tech",
      mpesa_till_or_paybill: "123456",
      category_id: categoryId,
      base_lat: -1.286389,
      base_lng: 36.817223,
      price_min: 800,
      price_max: 2500,
      average_response_minutes: 12,
      current_status: "available",
    },
  });
  assert(r.status === 200 && typeof r.data.id === "number", "provider me");
  assert(r.data.price_min === 800, "provider me price_min");
  assert(r.data.profile_complete === true, "provider me profile_complete");
  assert(!("category_id" in r.data), "provider me omits category_id write field");
  const providerId = r.data.id;

  r = await req("POST", "/services/providers/me/heartbeat/", {
    token: provTok,
    body: { lat: -1.2865, lng: 36.8175, status: "available" },
  });
  assert(r.status === 200 && r.data.detail === "Heartbeat received.", "heartbeat");

  r = await req("GET", "/services/providers/me/heartbeat/status/", { token: provTok });
  assert(r.status === 200 && r.data.is_live === true, "heartbeat status");

  r = await req("GET", "/services/admin/monitor/providers/live/");
  assert(r.status === 401 || r.status === 403, "admin live requires auth");

  r = await req("POST", "/accounts/token/", {
    body: { username: "admin", password: "password123" },
  });
  // Demo memory store seeds admin; production/Supabase may not — skip positive path if unavailable.
  if (r.status === 200 && typeof r.data.access === "string") {
    const adminTok = r.data.access;
    r = await req("GET", "/services/admin/monitor/providers/live/", { token: adminTok });
    assert(r.status === 200 && Array.isArray(r.data.providers), "admin live");
    assert(
      r.data.providers.some((p) => p.profile_id === providerId || p.lat != null),
      "admin live has coords",
    );
  } else {
    console.log("skip admin live positive check (no demo admin token)");
  }

  r = await req("GET", "/services/providers/me/analytics/", { token: provTok });
  assert(r.status === 200 && typeof r.data.user_name === "string", "analytics");
  assert("current_lat" in r.data, "analytics current_lat");

  r = await req("GET", "/services/providers/nearby/?lat=-1.286389&lng=36.817223", {
    token: custTok,
  });
  assert(r.status === 200 && Array.isArray(r.data), "nearby");
  const mine = r.data.find((p) => p.id === providerId);
  assert(mine, "nearby includes onboarded provider");
  assert(typeof mine.category === "number", "nearby category is id");
  assert(typeof mine.user_id === "number", "nearby user_id numeric for Flutter");

  r = await req("POST", "/ai/match-providers/", {
    body: {
      description: "leaking pipe",
      lat: -1.286389,
      lng: 36.817223,
      category_id: categoryId,
      price_preference: "standard",
      urgency: "normal",
      radius_km: 15,
    },
  });
  assert(r.status === 200 && Array.isArray(r.data.options), "ai match options");
  const match = r.data.options.find((p) => p.id === providerId) || r.data.options[0];
  assert(match && typeof match.predicted_price === "number", "ai predicted_price");
  assert(typeof match.user_id === "number", "ai user_id");

  r = await req("POST", "/payments/discovery/initiate/", {
    token: custTok,
    body: {
      phone_number: "0712345678",
      category_id: categoryId,
      lat: -1.286389,
      lng: 36.817223,
      query: "plumber",
    },
  });
  assert(r.status === 201 && typeof r.data.id === "number", "discovery initiate");
  assert(r.data.fee_enabled === false || r.data.is_paid === true, "discovery fee shape");
  const discoveryId = r.data.id;

  r = await req("POST", "/ai/predict-price/", {
    body: { lat: -1.286389, lng: 36.817223, category_id: categoryId },
  });
  assert(r.status === 200 && ("predicted_price" in r.data), "predict-price");

  r = await req("GET", "/services/jobs/expire-pending/", { token: custTok });
  assert(r.status === 200 && typeof r.data.count === "number", "expire-pending");

  r = await req("GET", `/payments/discovery/${discoveryId}/`, { token: custTok });
  assert(r.status === 200 && (r.data.is_paid === true || r.data.status === "success"), "discovery paid");

  r = await req("POST", "/services/jobs/", {
    token: custTok,
    body: {
      provider: match.user_id,
      category: match.category ?? categoryId,
      description: "Contract test job",
      location_lat: -1.286389,
      location_lng: 36.817223,
      address_text: "Customer location",
      quoted_price: match.predicted_price,
      client_price_preference: "standard",
      radius_km: 10,
      discovery_payment_id: discoveryId,
    },
  });
  assert(r.status === 201 && typeof r.data.id === "number", "create job");
  assert(typeof r.data.provider === "number", "job.provider is int");
  assert(typeof r.data.category === "number", "job.category is id");
  assert(r.data.is_paid === true, "job paid via discovery");
  const jobId = r.data.id;

  r = await req("POST", "/payments/initiate/", {
    token: custTok,
    body: { job: jobId, phone_number: "0712345678" },
  });
  assert(r.status === 201 && r.data.job === jobId, "initiate payment");

  r = await req("GET", `/payments/query/${jobId}/`, { token: custTok });
  assert(r.status === 200 && (r.data.is_paid === true || r.data.status === "success"), "query payment");

  r = await req("POST", `/services/jobs/${jobId}/accept/`, { token: provTok, body: {} });
  assert(r.status === 200 && String(r.data.detail).includes("accepted"), "accept");

  r = await req("POST", `/services/jobs/${jobId}/start_trip/`, { token: provTok, body: {} });
  assert(r.status === 200 && r.data.detail === "Live tracking started.", "start_trip");

  r = await req("GET", `/services/jobs/${jobId}/`, { token: custTok });
  assert(r.data.status === "in_progress", "after start_trip => in_progress");

  r = await req("POST", `/services/jobs/${jobId}/update_location/`, {
    token: provTok,
    body: { lat: -1.287, lng: 36.818 },
  });
  assert(r.status === 200 && r.data.detail === "Location updated.", "update_location");

  r = await req("GET", `/services/jobs/${jobId}/location/`, { token: custTok });
  assert(r.status === 200 && r.data.latest?.lat === -1.287, "location");

  r = await req("POST", `/services/jobs/${jobId}/complete/`, { token: provTok, body: {} });
  assert(r.status === 200 && r.data.detail === "Job marked as completed.", "complete");

  // Decline flow on a fresh pending job
  r = await req("POST", "/services/jobs/", {
    token: custTok,
    body: {
      provider: providerId,
      category: categoryId,
      description: "Decline me",
      location_lat: -1.286389,
      location_lng: 36.817223,
    },
  });
  assert(r.status === 201, "create decline job");
  const declineId = r.data.id;
  r = await req("POST", `/services/jobs/${declineId}/decline/`, { token: provTok, body: {} });
  assert(r.status === 200 && r.data.detail === "Job declined.", "decline");

  console.log("OK — updated Flutter Dio contract checks passed against", BASE);
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
