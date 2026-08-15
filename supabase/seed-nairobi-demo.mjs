/**
 * Seed Nairobi demo data from updated-s-link seed_nairobi_demo.py into Supabase.
 *
 * Preferred (deps resolve from web/node_modules):
 *   cd web && npm run seed:nairobi
 *
 * Reads web/.env.local for SUPABASE_URL + SERVICE_ROLE_KEY.
 * Demo password for all seeded accounts: DemoPass123!
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const DEMO_PASSWORD = "DemoPass123!";

const SERVICES = [
  ["Plumbing", "plumbing"],
  ["Electrical", "electrical_services"],
  ["Cleaning", "cleaning_services"],
  ["Appliance Repair", "home_repair_service"],
  ["Salon & Beauty", "spa"],
  ["Carpentry", "carpenter"],
  ["Mechanic", "car_repair"],
  ["Pest Control", "pest_control"],
  ["Painting", "format_paint"],
  ["Laundry", "local_laundry_service"],
];

// username, full_name, category, lat, lng, price_min, price_max, rating, completed, status, response_min
const PROVIDERS = [
  ["plumber_01", "James Mwangi", "Plumbing", -1.2921, 36.8219, 600, 1800, 4.7, 38, "available", 12],
  ["plumber_02", "John Kariuki", "Plumbing", -1.2864, 36.8172, 700, 2200, 4.5, 29, "available", 16],
  ["plumber_03", "Isaac Omondi", "Plumbing", -1.3032, 36.7073, 800, 2600, 4.6, 51, "busy", 25],
  ["plumber_04", "Moses Karanja", "Plumbing", -1.2676, 36.8108, 650, 2100, 4.2, 21, "available", 20],
  ["plumber_05", "Collins Wekesa", "Plumbing", -1.3227, 36.7949, 900, 2800, 4.8, 67, "available", 14],
  ["electrician_01", "Brian Otieno", "Electrical", -1.2657, 36.8085, 1000, 3500, 4.6, 44, "available", 25],
  ["electrician_02", "Paul Maina", "Electrical", -1.2864, 36.8172, 1200, 4000, 4.8, 72, "available", 15],
  ["electrician_03", "Elijah Kiprono", "Electrical", -1.3032, 36.7073, 900, 3200, 4.3, 26, "busy", 32],
  ["electrician_04", "David Ouma", "Electrical", -1.2921, 36.7820, 1100, 3800, 4.5, 39, "available", 18],
  ["electrician_05", "Simon Njoroge", "Electrical", -1.2501, 36.8836, 1300, 4200, 4.7, 54, "available", 17],
  ["cleaner_01", "Mary Wanjiku", "Cleaning", -1.3032, 36.7073, 800, 2500, 4.8, 64, "available", 18],
  ["cleaner_02", "Nancy Achieng", "Cleaning", -1.2921, 36.7820, 700, 2200, 4.6, 42, "available", 15],
  ["cleaner_03", "Rose Njeri", "Cleaning", -1.2676, 36.8108, 900, 2800, 4.7, 58, "available", 20],
  ["cleaner_04", "Esther Muthoni", "Cleaning", -1.2230, 36.8970, 750, 2400, 4.4, 31, "busy", 35],
  ["cleaner_05", "Mercy Atieno", "Cleaning", -1.3227, 36.7949, 1000, 3000, 4.9, 86, "available", 12],
  ["appliance_01", "Grace Nyambura", "Appliance Repair", -1.2196, 36.8862, 1500, 6000, 4.4, 29, "busy", 35],
  ["appliance_02", "Patrick Ochieng", "Appliance Repair", -1.3032, 36.7073, 1300, 5500, 4.7, 48, "available", 19],
  ["appliance_03", "Victor Muthama", "Appliance Repair", -1.2864, 36.8172, 1200, 5200, 4.5, 36, "available", 22],
  ["appliance_04", "Diana Awuor", "Appliance Repair", -1.2676, 36.8108, 1400, 5800, 4.3, 24, "available", 28],
  ["appliance_05", "Edwin Kamau", "Appliance Repair", -1.2921, 36.7820, 1100, 5000, 4.6, 41, "available", 20],
  ["beauty_01", "Amina Hassan", "Salon & Beauty", -1.2864, 36.8172, 700, 3000, 4.9, 92, "available", 10],
  ["beauty_02", "Grace Anyango", "Salon & Beauty", -1.2921, 36.7820, 800, 3200, 4.6, 41, "available", 18],
  ["beauty_03", "Lydia Wambua", "Salon & Beauty", -1.2501, 36.8836, 750, 3100, 4.7, 55, "available", 15],
  ["beauty_04", "Sharon Akinyi", "Salon & Beauty", -1.3032, 36.7073, 900, 3500, 4.5, 38, "busy", 25],
  ["beauty_05", "Pauline Ndungu", "Salon & Beauty", -1.2676, 36.8108, 850, 3300, 4.8, 63, "available", 12],
  ["carpenter_01", "Peter Kamau", "Carpentry", -1.3227, 36.7949, 1200, 5000, 4.5, 57, "available", 20],
  ["carpenter_02", "Michael Njenga", "Carpentry", -1.2676, 36.8108, 1000, 4500, 4.3, 34, "available", 22],
  ["carpenter_03", "Samuel Gitau", "Carpentry", -1.2864, 36.8172, 1100, 4800, 4.6, 49, "available", 18],
  ["carpenter_04", "Dennis Mutua", "Carpentry", -1.3032, 36.7073, 900, 4200, 4.2, 28, "busy", 30],
  ["carpenter_05", "Alex Onyango", "Carpentry", -1.2921, 36.7820, 1300, 5200, 4.7, 61, "available", 16],
  ["mechanic_01", "Daniel Mutiso", "Mechanic", -1.3099, 36.8282, 1000, 4500, 4.3, 31, "available", 22],
  ["mechanic_02", "Peter Mwangi", "Mechanic", -1.2864, 36.8172, 1200, 5000, 4.7, 66, "available", 18],
  ["mechanic_03", "George Kamau", "Mechanic", -1.2921, 36.7820, 1500, 6000, 4.8, 82, "available", 14],
  ["mechanic_04", "Ahmed Hassan", "Mechanic", -1.3227, 36.7949, 1300, 5500, 4.6, 53, "available", 19],
  ["mechanic_05", "Martin Ochieng", "Mechanic", -1.2574, 36.7873, 1400, 6200, 4.9, 91, "available", 12],
  ["pest_01", "Faith Chebet", "Pest Control", -1.2574, 36.7873, 1800, 7000, 4.6, 22, "available", 30],
  ["pest_02", "Robert Mwenda", "Pest Control", -1.2921, 36.7820, 1600, 6500, 4.5, 30, "available", 28],
  ["pest_03", "Charles Oduya", "Pest Control", -1.2864, 36.8172, 1700, 6800, 4.7, 44, "available", 25],
  ["pest_04", "Irene Wanjiku", "Pest Control", -1.3032, 36.7073, 1500, 6200, 4.4, 27, "busy", 35],
  ["pest_05", "Tom Kimani", "Pest Control", -1.2676, 36.8108, 2000, 7500, 4.8, 51, "available", 20],
  ["painter_01", "Kevin Odhiambo", "Painting", -1.2833, 36.7500, 1500, 6500, 4.2, 18, "available", 28],
  ["painter_02", "Evans Mutua", "Painting", -1.2864, 36.8172, 1400, 6000, 4.5, 32, "available", 21],
  ["painter_03", "Joseph Njiru", "Painting", -1.2921, 36.7820, 1300, 5800, 4.6, 45, "available", 18],
  ["painter_04", "Stella Moraa", "Painting", -1.3032, 36.7073, 1200, 5500, 4.3, 29, "busy", 30],
  ["painter_05", "Felix Otieno", "Painting", -1.2676, 36.8108, 1600, 7000, 4.7, 56, "available", 16],
  ["laundry_01", "Lucy Njeri", "Laundry", -1.2501, 36.8836, 500, 2200, 4.5, 41, "available", 16],
  ["laundry_02", "Sarah Wambui", "Laundry", -1.3032, 36.7073, 600, 2400, 4.4, 36, "available", 19],
  ["laundry_03", "Ann Cherono", "Laundry", -1.2864, 36.8172, 550, 2300, 4.6, 48, "available", 14],
  ["laundry_04", "Beatrice Juma", "Laundry", -1.2921, 36.7820, 700, 2600, 4.3, 27, "busy", 25],
  ["laundry_05", "Cynthia Oloo", "Laundry", -1.2676, 36.8108, 650, 2500, 4.7, 59, "available", 12],
];

const CUSTOMERS = [
  ["demo_customer", "Demo Customer", "customer@demo.local"],
  ["westlands_client", "Westlands Client", "westlands.client@demo.local"],
  ["kilimani_client", "Kilimani Client", "kilimani.client@demo.local"],
  ["kasarani_client", "Kasarani Client", "kasarani.client@demo.local"],
];

const JOBS = [
  ["demo_customer", "plumber_01", "Plumbing", "Kitchen sink leak repair", -1.286389, 36.817223, "Nairobi CBD", "completed", "standard", 1200, 5, "Fast, polite and fixed the leak."],
  ["westlands_client", "cleaner_01", "Cleaning", "Deep cleaning two-bedroom apartment", -1.2676, 36.8108, "Westlands", "completed", "standard", 2200, 5, "Very thorough cleaning."],
  ["kilimani_client", "electrician_01", "Electrical", "Urgent wiring diagnostic", -1.2921, 36.7820, "Kilimani", "in_progress", "premium", 3200, null, ""],
  ["kasarani_client", "appliance_01", "Appliance Repair", "Fridge diagnostic and repair", -1.2230, 36.8970, "Kasarani", "accepted", "standard", 2800, null, ""],
  ["demo_customer", "beauty_01", "Salon & Beauty", "Home manicure and hair styling", -1.286389, 36.817223, "Nairobi CBD", "completed", "premium", 2600, 5, "Excellent service and arrived quickly."],
  ["westlands_client", "mechanic_01", "Mechanic", "Battery check and minor repair", -1.2676, 36.8108, "Westlands", "completed", "budget", 1400, 4, "Good diagnosis and fair price."],
  ["kilimani_client", "carpenter_01", "Carpentry", "Repair wardrobe hinges", -1.2921, 36.7820, "Kilimani", "pending_provider", "budget", 1500, null, ""],
  ["kasarani_client", "painter_01", "Painting", "Interior painting two rooms", -1.2230, 36.8970, "Kasarani", "completed", "standard", 5500, 4, "Neat work and finished on time."],
  ["demo_customer", "pest_01", "Pest Control", "Cockroach fumigation entire house", -1.286389, 36.817223, "Nairobi CBD", "completed", "standard", 3500, 5, "Thorough job, no more pests."],
  ["westlands_client", "laundry_01", "Laundry", "Wash and iron weekly clothes bundle", -1.2676, 36.8108, "Westlands", "in_progress", "budget", 900, null, ""],
];

const ADS = [
  ["Hardware Hub Ngong Road", "Tools and fittings for plumbers and electricians", "tools", "Nairobi", -1.3001, 36.7834, "active", 2500],
  ["CleanPro Supplies", "Detergents, gloves and cleaning machines", "materials", "Nairobi", -1.3032, 36.7073, "active", 1800],
  ["AutoCare Spares", "Car batteries, oil and fast-moving spares", "auto", "Nairobi", -1.3099, 36.8282, "active", 3000],
];

function loadEnvLocal() {
  const envPath = path.join(root, "web", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function tier(completed, rating) {
  if (completed >= 80 && rating >= 4.7) return "platinum";
  if (completed >= 50 && rating >= 4.5) return "gold";
  if (completed >= 20 && rating >= 4.2) return "silver";
  return "bronze";
}

function fail(label, error) {
  console.error(`FAIL ${label}:`, error?.message || error);
  process.exit(1);
}

async function upsertProfile(sb, row) {
  const { data: existing } = await sb.from("profiles").select("id").eq("username", row.username).maybeSingle();
  if (existing) {
    const { data, error } = await sb.from("profiles").update(row).eq("id", existing.id).select().single();
    if (error) fail(`update profile ${row.username}`, error);
    return data;
  }
  const { data, error } = await sb.from("profiles").insert(row).select().single();
  if (error) fail(`insert profile ${row.username}`, error);
  return data;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 8);
  const now = new Date();
  const usersByUsername = new Map();

  console.log("→ Seeding categories…");
  for (const [name, icon] of SERVICES) {
    const { error } = await sb.from("service_categories").upsert({ name, icon }, { onConflict: "name" });
    if (error) fail(`category ${name}`, error);
  }
  const { data: cats, error: catsErr } = await sb.from("service_categories").select("*");
  if (catsErr) fail("list categories", catsErr);
  const catByName = Object.fromEntries((cats || []).map((c) => [c.name, c]));

  console.log("→ Seeding admin + sponsor + customers…");
  const admin = await upsertProfile(sb, {
    username: "demo_admin",
    email: "admin@demo.local",
    role: "admin",
    full_name: "Demo Admin",
    phone: "254700000001",
    password_hash: passwordHash,
  });
  usersByUsername.set("demo_admin", admin);

  const sponsor = await upsertProfile(sb, {
    username: "demo_sponsor",
    email: "sponsor@demo.local",
    role: "provider",
    full_name: "Demo Sponsor",
    phone: "254700000002",
    password_hash: passwordHash,
  });
  usersByUsername.set("demo_sponsor", sponsor);

  for (const [username, fullName, email] of CUSTOMERS) {
    const profile = await upsertProfile(sb, {
      username,
      email: email.toLowerCase(),
      role: "customer",
      full_name: fullName,
      phone: "2547" + String(Math.floor(10000000 + Math.random() * 89999999)),
      password_hash: passwordHash,
    });
    usersByUsername.set(username, profile);
  }

  console.log(`→ Seeding ${PROVIDERS.length} providers…`);
  for (const [
    username, fullName, categoryName, lat, lng, priceMin, priceMax, rating, completed, status, responseMin,
  ] of PROVIDERS) {
    const category = catByName[categoryName];
    if (!category) fail(`missing category ${categoryName}`);

    const profile = await upsertProfile(sb, {
      username,
      email: `${username}@demo.local`,
      role: "provider",
      full_name: fullName,
      phone: "2547" + String(Math.floor(10000000 + Math.random() * 89999999)),
      password_hash: passwordHash,
    });
    usersByUsername.set(username, profile);

    const providerRow = {
      user_id: profile.id,
      category_id: category.id,
      bio: `Verified Nairobi ${categoryName.toLowerCase()} provider with demo pricing, rating, and dispatch data.`,
      base_lat: lat,
      base_lng: lng,
      current_lat: lat,
      current_lng: lng,
      last_seen_at: now.toISOString(),
      service_radius_km: 25,
      price_min: priceMin,
      price_max: priceMax,
      rating_avg: rating,
      rating_count: Math.max(Math.floor(completed / 2), 1),
      total_jobs_completed: completed,
      verified: true,
      is_suspended: false,
      current_status: status,
      average_response_minutes: responseMin,
      next_available_at: status === "busy" ? new Date(now.getTime() + responseMin * 60_000).toISOString() : null,
      tier: tier(completed, rating),
      mpesa_till_or_paybill: "174379",
    };

    const { data: existingProv } = await sb
      .from("service_provider_profiles")
      .select("id")
      .eq("user_id", profile.id)
      .maybeSingle();

    let providerId;
    if (existingProv) {
      const { data, error } = await sb
        .from("service_provider_profiles")
        .update(providerRow)
        .eq("id", existingProv.id)
        .select()
        .single();
      if (error) fail(`update provider ${username}`, error);
      providerId = data.id;
    } else {
      const { data, error } = await sb.from("service_provider_profiles").insert(providerRow).select().single();
      if (error) fail(`insert provider ${username}`, error);
      providerId = data.id;
    }

    const { data: existingDoc } = await sb
      .from("provider_legal_documents")
      .select("id")
      .eq("profile_id", providerId)
      .eq("title", `Demo verification - ${fullName}`)
      .maybeSingle();
    if (!existingDoc) {
      const { error } = await sb.from("provider_legal_documents").insert({
        profile_id: providerId,
        title: `Demo verification - ${fullName}`,
        file_path: `demo/demo-verification-${username}.txt`,
      });
      if (error) fail(`doc ${username}`, error);
    }
  }

  console.log("→ Seeding jobs / payments / locations / ratings…");
  for (const [
    customerUsername, providerUsername, categoryName, description, lat, lng, address, status, pricePref, quote, score, comment,
  ] of JOBS) {
    const customer = usersByUsername.get(customerUsername);
    const provider = usersByUsername.get(providerUsername);
    const category = catByName[categoryName];
    if (!customer || !provider || !category) fail(`job refs ${description}`);

    const { data: existingJob } = await sb
      .from("job_requests")
      .select("id")
      .eq("customer_id", customer.id)
      .eq("provider_id", provider.id)
      .eq("description", description)
      .maybeSingle();

    const jobRow = {
      customer_id: customer.id,
      provider_id: provider.id,
      category_id: category.id,
      description,
      location_lat: lat,
      location_lng: lng,
      address_text: address,
      status,
      is_paid: ["in_progress", "completed"].includes(status),
      provider_access_otp: "123456",
      provider_access_token: `demo-token-${customerUsername}-${providerUsername}`,
      client_price_preference: pricePref,
      quoted_price: quote,
      ai_match_reason: `Demo AI matched ${providerUsername} for ${categoryName} using proximity, availability, rating, and predicted price KSh ${quote}.`,
      pending_since: status === "pending_provider" ? now.toISOString() : null,
    };

    let job;
    if (existingJob) {
      const { data, error } = await sb.from("job_requests").update(jobRow).eq("id", existingJob.id).select().single();
      if (error) fail(`update job ${description}`, error);
      job = data;
    } else {
      const { data, error } = await sb.from("job_requests").insert(jobRow).select().single();
      if (error) fail(`insert job ${description}`, error);
      job = data;
    }

    if (["accepted", "in_progress", "completed"].includes(status)) {
      const { data: pay } = await sb.from("payments").select("id").eq("job_id", job.id).maybeSingle();
      const paymentRow = {
        job_id: job.id,
        provider_id: provider.id,
        amount: 50,
        currency: "KES",
        mpesa_reference: `DEMO${String(job.id).padStart(5, "0")}`,
        phone_number: customer.phone || "",
        status: ["in_progress", "completed"].includes(status) ? "success" : "pending",
      };
      if (pay) {
        const { error } = await sb.from("payments").update(paymentRow).eq("id", pay.id);
        if (error) fail(`payment ${job.id}`, error);
      } else {
        const { error } = await sb.from("payments").insert(paymentRow);
        if (error) fail(`payment insert ${job.id}`, error);
      }

      const { data: loc } = await sb
        .from("provider_locations")
        .select("id")
        .eq("job_id", job.id)
        .eq("provider_id", provider.id)
        .maybeSingle();
      const locRow = { provider_id: provider.id, job_id: job.id, lat: lat + 0.003, lng: lng + 0.002 };
      if (loc) {
        await sb.from("provider_locations").update(locRow).eq("id", loc.id);
      } else {
        await sb.from("provider_locations").insert(locRow);
      }
    }

    if (score) {
      const { data: rating } = await sb.from("ratings").select("id").eq("job_id", job.id).maybeSingle();
      const ratingRow = {
        job_id: job.id,
        customer_id: customer.id,
        provider_id: provider.id,
        score,
        comment: comment || "",
      };
      if (rating) {
        await sb.from("ratings").update(ratingRow).eq("id", rating.id);
      } else {
        await sb.from("ratings").insert(ratingRow);
      }
    }
  }

  console.log("→ Seeding ads…");
  for (const [title, description, category, city, lat, lng, status, amount] of ADS) {
    const { data: existing } = await sb
      .from("ad_placements")
      .select("id")
      .eq("sponsor_id", sponsor.id)
      .eq("title", title)
      .maybeSingle();
    const adRow = {
      sponsor_id: sponsor.id,
      title,
      description,
      category,
      target_country: "Kenya",
      target_city: city,
      store_lat: lat,
      store_lng: lng,
      status,
      amount_paid: amount,
      starts_at: new Date(now.getTime() - 86400000).toISOString(),
      ends_at: new Date(now.getTime() + 30 * 86400000).toISOString(),
    };
    if (existing) {
      const { error } = await sb.from("ad_placements").update(adRow).eq("id", existing.id);
      if (error) fail(`ad ${title}`, error);
    } else {
      const { error } = await sb.from("ad_placements").insert(adRow);
      if (error) fail(`ad insert ${title}`, error);
    }
  }

  const { count: providerCount } = await sb
    .from("service_provider_profiles")
    .select("*", { count: "exact", head: true })
    .eq("verified", true);

  console.log("OK — Nairobi demo seed complete");
  console.log(`  Demo password : ${DEMO_PASSWORD}`);
  console.log(`  Categories    : ${SERVICES.length}`);
  console.log(`  Providers     : ${PROVIDERS.length} (verified in DB ≈ ${providerCount ?? "?"})`);
  console.log("  Customer login: demo_customer");
  console.log("  Admin login   : demo_admin");
  console.log("  Provider login: e.g. plumber_01, cleaner_03, mechanic_05");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
