import { randomBytes, randomUUID } from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { computeTier } from "@/lib/store/memory";
import { hashPassword, verifyPassword } from "@/lib/password";
import type {
  AdPlacement,
  JobRequest,
  Profile,
  ServiceProviderProfile,
} from "@/lib/types";
import { JOB_DEFAULTS, PAYMENT_DEFAULTS, PROVIDER_DEFAULTS } from "@/lib/types";

type Db = ReturnType<typeof createServiceClient>;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fail(message: string, status = 500): never {
  throw Object.assign(new Error(message), { status });
}

const HEARTBEAT_TTL_MS = 5 * 60 * 1000;
function isFresh(timestamp: string | null | undefined, ttlMs = HEARTBEAT_TTL_MS) {
  return !!timestamp && Date.now() - new Date(timestamp).getTime() <= ttlMs;
}

function unwrap<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) {
    const status = result.error.code === "PGRST116" ? 404 : 400;
    fail(result.error.message, status);
  }
  return result.data;
}

function profile(row: any): Profile {
  return row as Profile;
}

function provider(row: any): ServiceProviderProfile {
  return row as ServiceProviderProfile;
}

function payment(row: any) {
  return { ...row, amount: Number(row.amount) };
}

export class SupabaseStore {
  private client(): Db {
    return createServiceClient();
  }

  async findProfileByUsername(username: string) {
    return unwrap(await this.client().from("profiles").select("*").eq("username", username).maybeSingle()) as Profile | null;
  }

  async findProfileByEmail(email: string) {
    return unwrap(
      await this.client().from("profiles").select("*").eq("email", email.toLowerCase()).maybeSingle(),
    ) as Profile | null;
  }

  async getProfile(id: string) {
    return unwrap(await this.client().from("profiles").select("*").eq("id", id).maybeSingle()) as Profile | null;
  }

  async updateProfile(id: string, patch: Partial<Profile>) {
    const row = unwrap(await this.client().from("profiles").update(patch).eq("id", id).select().maybeSingle()) as Profile | null;
    if (!row) fail("Profile not found", 404);
    return row;
  }

  async register(input: {
    username: string;
    email: string;
    password: string;
    role: Profile["role"];
    phone?: string;
    full_name?: string;
  }) {
    const email = input.email.toLowerCase();
    const [byUser, byEmail, password_hash] = await Promise.all([
      this.findProfileByUsername(input.username),
      this.findProfileByEmail(email),
      hashPassword(input.password),
    ]);
    if (byUser) fail("Username already taken", 400);
    if (byEmail) fail("Email already registered", 400);

    const row = unwrap(
      await this.client()
        .from("profiles")
        .insert({
          username: input.username,
          email,
          role: input.role,
          full_name: input.full_name || input.username,
          phone: input.phone || "",
          password_hash,
        })
        .select()
        .single(),
    );
    // Django does not create ServiceProviderProfile on register — onboarding does.
    return profile(row);
  }

  async authenticate(username: string, password: string) {
    const login = username.trim();
    let found = await this.findProfileByUsername(login);
    if (!found && login.includes("@")) {
      found = await this.findProfileByEmail(login.toLowerCase());
    }
    if (!found?.password_hash || !(await verifyPassword(password, found.password_hash))) {
      fail("No active account found with the given credentials", 401);
    }
    return found;
  }

  async googleLogin(
    email: string,
    name?: string,
    opts?: { firebase_uid?: string; role?: Profile["role"] },
  ) {
    let found = await this.findProfileByEmail(email);
    if (!found && opts?.firebase_uid) {
      found = unwrap(
        await this.client().from("profiles").select("*").eq("firebase_uid", opts.firebase_uid).maybeSingle(),
      ) as Profile | null;
    }
    let created = false;
    if (!found) {
      const base = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30) || "user";
      let username = base;
      for (let suffix = 1; await this.findProfileByUsername(username); suffix += 1) {
        username = `${base}${suffix}`;
      }
      const role =
        opts?.role === "admin"
          ? "admin"
          : opts?.role === "operations"
            ? "operations"
            : opts?.role === "provider"
              ? "provider"
              : "customer";
      const row = unwrap(
        await this.client()
          .from("profiles")
          .insert({
            username,
            email,
            role,
            full_name: name || username,
            phone: "",
            password_hash: await hashPassword(randomUUID()),
            firebase_uid: opts?.firebase_uid ?? null,
          })
          .select()
          .single(),
      );
      found = profile(row);
      created = true;
    } else {
      const patch: Partial<Profile> = {};
      if (name && (!found.full_name || found.full_name === found.username)) patch.full_name = name;
      if (opts?.role === "admin" || opts?.role === "operations") patch.role = opts.role;
      if (opts?.firebase_uid) patch.firebase_uid = opts.firebase_uid;
      if (Object.keys(patch).length) {
        found = profile(
          unwrap(await this.client().from("profiles").update(patch).eq("id", found.id).select().single()),
        );
      }
    }
    return { profile: found, created };
  }

  async listCategories() {
    return unwrap(await this.client().from("service_categories").select("*").order("id"));
  }

  async resolveCategory(value: string | number) {
    const query = this.client().from("service_categories").select("*");
    return unwrap(
      typeof value === "number" || /^\d+$/.test(String(value))
        ? await query.eq("id", Number(value)).maybeSingle()
        : await query.ilike("name", String(value)).maybeSingle(),
    );
  }

  async getProviderByUser(userId: string) {
    return unwrap(
      await this.client().from("service_provider_profiles").select("*").eq("user_id", userId).maybeSingle(),
    ) as ServiceProviderProfile | null;
  }

  async getProviderById(id: number) {
    return unwrap(
      await this.client().from("service_provider_profiles").select("*").eq("id", id).maybeSingle(),
    ) as ServiceProviderProfile | null;
  }

  async nearbyProviders(lat: number, lng: number, category?: string) {
    let query = this.client()
      .from("service_provider_profiles")
      .select("*, profiles!inner(username)")
      .eq("verified", true)
      .eq("is_suspended", false)
      .eq("current_status", "available");
    const cat = category ? await this.resolveCategory(category) : null;
    if (cat) query = query.eq("category_id", cat.id);

    const rows = unwrap(await query) as Array<any>;
    return rows
      .flatMap((p) => {
        const live = isFresh(p.last_seen_at) && p.current_lat != null && p.current_lng != null;
        const pointLat = live ? p.current_lat : p.base_lat;
        const pointLng = live ? p.current_lng : p.base_lng;
        if (pointLat == null || pointLng == null) return [];
        const distance = haversineKm(lat, lng, Number(pointLat), Number(pointLng));
        return {
          id: p.id,
          user_id: p.id,
          user_name: p.profiles?.username || "",
          category: p.category_id,
          bio: p.bio,
          base_lat: p.base_lat,
          base_lng: p.base_lng,
          current_lat: p.current_lat,
          current_lng: p.current_lng,
          last_seen_at: p.last_seen_at,
          location_source: live ? "heartbeat" : "base",
          price_min: Number(p.price_min),
          price_max: Number(p.price_max),
          average_response_minutes: Number(p.average_response_minutes),
          current_status: p.current_status,
          tier: p.tier,
          rating_avg: p.rating_avg,
          rating_count: p.rating_count,
          total_jobs_completed: p.total_jobs_completed,
          distance_km: Math.round(distance * 100) / 100,
          service_radius_km: p.service_radius_km,
          area_formatted_address: p.area_formatted_address || "",
        };
      })
      // Distance ranking only — no hard radius geofence
      .sort((a, b) => a.distance_km - b.distance_km)
      .map(({ service_radius_km: _r, ...rest }) => rest);
  }

  async upsertProviderMe(
    userId: string,
    data: Partial<Pick<ServiceProviderProfile, "category_id" | "bio" | "base_lat" | "base_lng" | "service_radius_km" | "mpesa_till_or_paybill" | "current_status" | "price_min" | "price_max" | "average_response_minutes" | "id_document_number" | "id_document_kind" | "area_place_id" | "area_formatted_address" | "profile_complete" | "terms_accepted_at">>,
  ) {
    let found = await this.getProviderByUser(userId);
    if (!found) {
      const row = unwrap(
        await this.client().from("service_provider_profiles").insert({ user_id: userId, ...PROVIDER_DEFAULTS, ...data }).select().single(),
      );
      found = provider(row);
    } else if (Object.keys(data).length) {
      found = provider(
        unwrap(
          await this.client()
            .from("service_provider_profiles")
            .update(data)
            .eq("id", found.id)
            .select()
            .single(),
        ),
      );
    }
    const [user, category] = await Promise.all([
      this.getProfile(userId),
      found.category_id ? this.resolveCategory(found.category_id) : Promise.resolve(null),
    ]);
    return {
      id: found.id,
      user_id: found.id,
      user_name: user?.username || "",
      user_email: user?.email || "",
      category: category ? { id: category.id, name: category.name } : null,
      bio: found.bio,
      base_lat: found.base_lat,
      base_lng: found.base_lng,
      service_radius_km: found.service_radius_km,
      mpesa_till_or_paybill: found.mpesa_till_or_paybill,
      verified: found.verified,
      price_min: Number(found.price_min),
      price_max: Number(found.price_max),
      average_response_minutes: Number(found.average_response_minutes),
      current_status: found.current_status,
      id_document_number: found.id_document_number || "",
      id_document_kind: found.id_document_kind || "",
      area_place_id: found.area_place_id || "",
      area_formatted_address: found.area_formatted_address || "",
      terms_accepted_at: found.terms_accepted_at,
      profile_complete: await this.isProviderProfileComplete(found),
    };
  }

  async listProviderDocuments(profileId: number) {
    const rows = unwrap(
      await this.client()
        .from("provider_legal_documents")
        .select("*")
        .eq("profile_id", profileId)
        .order("uploaded_at", { ascending: false }),
    ) as any[];
    return rows.map((row) => ({
      id: row.id,
      profile_id: row.profile_id,
      title: row.title,
      file: row.file_path,
      document_type: row.document_type || "other",
      review_status: row.review_status || "pending",
      review_notes: row.review_notes || "",
      reviewed_at: row.reviewed_at,
      reviewed_by: row.reviewed_by,
      uploaded_at: row.uploaded_at,
    }));
  }

  async isProviderProfileComplete(found: ServiceProviderProfile) {
    if (!(found.category_id && found.bio && found.base_lat != null && found.base_lng != null && found.price_min != null && found.price_max != null)) {
      return false;
    }
    if (!(found.id_document_number || "").trim()) return false;
    const docs = await this.listProviderDocuments(found.id);
    return docs.some((d) => d.document_type === "national_id_or_passport");
  }

  async providerAnalytics(userIdOrProfileId: string | number) {
    const found =
      typeof userIdOrProfileId === "number" || /^\d+$/.test(String(userIdOrProfileId))
        ? await this.getProviderById(Number(userIdOrProfileId))
        : await this.getProviderByUser(String(userIdOrProfileId));
    if (!found) fail("Provider not found", 404);
    const user = await this.getProfile(found.user_id);
    if (!user) fail("Provider user not found", 404);
    return {
      id: found.id,
      user_name: user.username,
      tier: found.tier,
      rating_avg: found.rating_avg,
      rating_count: found.rating_count,
      total_jobs_completed: found.total_jobs_completed,
      service_radius_km: found.service_radius_km,
      base_lat: found.base_lat,
      base_lng: found.base_lng,
      current_lat: found.current_lat,
      current_lng: found.current_lng,
      last_seen_at: found.last_seen_at,
      verified: found.verified,
      is_suspended: found.is_suspended,
      current_status: found.current_status,
    };
  }

  async listAdminProviders() {
    const providers = unwrap(await this.client().from("service_provider_profiles").select("*").order("id")) as ServiceProviderProfile[];
    return Promise.all(providers.map((item) => this.providerAnalytics(item.id)));
  }

  async getAdminProviderDetail(profileId: number) {
    const found = await this.getProviderById(profileId);
    if (!found) fail("Provider not found", 404);
    const [user, category, docs] = await Promise.all([
      this.getProfile(found.user_id),
      found.category_id ? this.resolveCategory(found.category_id) : Promise.resolve(null),
      this.listProviderDocuments(found.id),
    ]);

    return {
      id: found.id,
      user_id: found.user_id,
      user_name: user?.username || "",
      user_email: user?.email || "",
      user_phone: user?.phone || "",
      category: category ? { id: category.id, name: category.name } : null,
      bio: found.bio || "",
      tier: found.tier,
      rating_avg: found.rating_avg,
      rating_count: found.rating_count,
      total_jobs_completed: found.total_jobs_completed,
      price_min: Number(found.price_min),
      price_max: Number(found.price_max),
      average_response_minutes: Number(found.average_response_minutes),
      service_radius_km: found.service_radius_km,
      area_formatted_address: found.area_formatted_address || "",
      base_lat: found.base_lat,
      base_lng: found.base_lng,
      current_lat: found.current_lat,
      current_lng: found.current_lng,
      last_seen_at: found.last_seen_at,
      current_status: found.current_status,
      verified: found.verified,
      is_suspended: found.is_suspended,
      suspended_reason: found.suspended_reason || "",
      profile_complete: await this.isProviderProfileComplete(found),
      id_document_kind: found.id_document_kind || "",
      id_document_number: found.id_document_number || "",
      terms_accepted_at: found.terms_accepted_at,
      documents: docs,
    };
  }

  async addDocument(
    userId: string,
    title: string,
    fileUrl: string,
    opts?: { document_type?: string },
  ) {
    const found = await this.getProviderByUser(userId);
    if (!found) fail("Provider profile missing", 400);
    const documentType = opts?.document_type || "other";
    const row = unwrap(
      await this.client()
        .from("provider_legal_documents")
        .insert({
          profile_id: found.id,
          title,
          file_path: fileUrl,
          document_type: documentType,
          review_status: "pending",
        })
        .select()
        .single(),
    ) as any;
    return {
      id: row.id,
      title: row.title,
      file: row.file_path,
      document_type: row.document_type,
      review_status: row.review_status,
      review_notes: row.review_notes || "",
      uploaded_at: row.uploaded_at,
    };
  }

  async reviewDocument(
    documentId: number,
    adminUserId: string,
    patch: { review_status: "approved" | "rejected"; review_notes?: string },
  ) {
    const row = unwrap(
      await this.client()
        .from("provider_legal_documents")
        .update({
          review_status: patch.review_status,
          review_notes: patch.review_notes || "",
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminUserId,
        })
        .eq("id", documentId)
        .select()
        .single(),
    ) as any;
    return {
      id: row.id,
      title: row.title,
      file: row.file_path,
      document_type: row.document_type,
      review_status: row.review_status,
      review_notes: row.review_notes || "",
      reviewed_at: row.reviewed_at,
      uploaded_at: row.uploaded_at,
    };
  }

  async resolveProviderUserId(providerField: string | number) {
    if (typeof providerField === "number" || /^\d+$/.test(String(providerField))) {
      return (await this.getProviderById(Number(providerField)))?.user_id ?? null;
    }
    return (await this.getProfile(String(providerField)))?.id ?? null;
  }

  async serializeJob(job: JobRequest, viewer?: Profile | null) {
    const [latest, providerProfile, customer, category] = await Promise.all([
      unwrap(
        await this.client()
          .from("provider_locations")
          .select("*")
          .eq("job_id", job.id)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ) as any,
      job.provider_id ? this.getProviderByUser(job.provider_id) : Promise.resolve(null),
      this.getProfile(job.customer_id),
      this.resolveCategory(job.category_id),
    ]);
    const providerUser = providerProfile ? await this.getProfile(providerProfile.user_id) : null;
    const revealPhone =
      viewer?.role === "admin" ||
      viewer?.role === "operations" ||
      viewer?.id === job.customer_id ||
      (job.provider_id != null && viewer?.id === job.provider_id && job.status !== "pending_provider") ||
      job.status !== "pending_provider";
    return {
      id: job.id,
      customer: job.customer_id,
      provider: providerProfile?.id ?? null,
      category: job.category_id,
      description: job.description,
      location_lat: job.location_lat,
      location_lng: job.location_lng,
      address_text: job.address_text,
      recipient_name: job.recipient_name || "",
      recipient_phone: revealPhone ? job.recipient_phone || "" : "",
      access_notes: job.access_notes || "",
      place_id: job.place_id || "",
      formatted_address: job.formatted_address || job.address_text || "",
      status: job.status,
      is_paid: job.is_paid,
      provider_access_otp: job.provider_access_otp,
      provider_access_token: job.provider_access_token,
      ai_match_reason: job.ai_match_reason,
      client_price_preference: job.client_price_preference,
      quoted_price: job.quoted_price,
      requested_radius_km: job.requested_radius_km,
      pending_since: job.pending_since,
      request_sms_sent_at: job.request_sms_sent_at,
      arrival_sms_sent_at: job.arrival_sms_sent_at,
      expired_at: job.expired_at,
      fallback_provider_id: job.fallback_provider_id,
      category_name: category?.name ?? null,
      customer_name: customer?.full_name || customer?.username || "",
      provider_name: providerUser?.full_name || providerUser?.username || null,
      created_at: job.created_at,
      updated_at: job.updated_at,
      latest_location: latest ? { lat: latest.lat, lng: latest.lng, recorded_at: latest.recorded_at } : null,
    };
  }

  async listJobs(user: Profile) {
    let query = this.client().from("job_requests").select("*").order("created_at", { ascending: false });
    if (user.role === "provider") {
      const visibleDispatches = unwrap(
        await this.client()
          .from("job_dispatches")
          .select("job_id")
          .eq("provider_user_id", user.id)
          .in("status", ["notified", "broadcast", "accepted"]),
      ) as Array<{ job_id: number }>;
      const ids = visibleDispatches.map((item) => item.job_id);
      query = ids.length
        ? query.or(`provider_id.eq.${user.id},id.in.(${ids.join(",")})`)
        : query.eq("provider_id", user.id);
    }
    if (user.role === "customer") query = query.eq("customer_id", user.id);
    const jobs = unwrap(await query) as JobRequest[];
    return Promise.all(jobs.map((job) => this.serializeJob(job, user)));
  }

  async getJob(id: number) {
    const row = unwrap(await this.client().from("job_requests").select("*").eq("id", id).maybeSingle()) as JobRequest | null;
    if (!row) fail("Job not found", 404);
    return row;
  }

  async canProviderAccessDispatchedJob(jobId: number, providerUserId: string) {
    const row = unwrap(
      await this.client()
        .from("job_dispatches")
        .select("id")
        .eq("job_id", jobId)
        .eq("provider_user_id", providerUserId)
        .in("status", ["notified", "broadcast", "accepted"])
        .maybeSingle(),
    ) as { id: number } | null;
    return !!row;
  }

  async createJob(customerId: string, data: {
    provider?: string | number | null;
    category: string | number;
    description: string;
    location_lat: number;
    location_lng: number;
    address_text: string;
    discovery_payment_id?: number;
    quoted_price?: number;
    client_price_preference?: string;
    radius_km?: number;
    requested_radius_km?: number;
    ai_match_reason?: string;
    recipient_name?: string;
    recipient_phone?: string;
    access_notes?: string;
    place_id?: string;
    formatted_address?: string;
  }) {
    if (!(data.description || "").trim()) fail("Please describe the problem before creating a job.", 400);
    if (data.location_lat == null || data.location_lng == null) fail("A job location pin is required.", 400);
    const category = await this.resolveCategory(data.category);
    if (!category) fail("Invalid category", 400);
    const providerId = data.provider != null ? await this.resolveProviderUserId(data.provider) : null;
    if (data.provider != null && !providerId) fail("Invalid provider", 400);
    const createdAt = new Date().toISOString();
    const formatted = data.formatted_address || data.address_text || "";
    const row = unwrap(
      await this.client().from("job_requests").insert({
        customer_id: customerId, provider_id: providerId, category_id: category.id,
        description: data.description, location_lat: data.location_lat, location_lng: data.location_lng,
        address_text: formatted || data.address_text,
        is_paid: process.env.CONNECTION_FEE_ENABLED !== "true",
        ...JOB_DEFAULTS,
        recipient_name: data.recipient_name ?? "",
        recipient_phone: data.recipient_phone ?? "",
        access_notes: data.access_notes ?? "",
        place_id: data.place_id ?? "",
        formatted_address: formatted,
        provider_access_otp: String(Math.floor(100000 + Math.random() * 900000)),
        provider_access_token: randomBytes(24).toString("hex"),
        ai_match_reason: data.ai_match_reason ?? "",
        client_price_preference: data.client_price_preference ?? "",
        quoted_price: data.quoted_price ?? null,
        requested_radius_km: data.requested_radius_km ?? data.radius_km ?? null,
        pending_since: createdAt,
      }).select().single(),
    ) as JobRequest;
    if (data.discovery_payment_id && await this.consumeDiscoveryPayment(data.discovery_payment_id, customerId, row.id)) {
      unwrap(await this.client().from("job_requests").update({ is_paid: true }).eq("id", row.id));
      row.is_paid = true;
    }
    return this.serializeJob(row);
  }

  async updateJob(id: number, patch: Partial<JobRequest>) {
    const row = unwrap(await this.client().from("job_requests").update(patch).eq("id", id).select().maybeSingle()) as JobRequest | null;
    if (!row) fail("Job not found", 404);
    return this.serializeJob(row);
  }

  async acceptJob(jobId: number, providerUserId: string) {
    const job = await this.getJob(jobId);
    const provider = await this.getProviderByUser(providerUserId);
    if (!provider) fail("Only providers can accept jobs.", 403);
    if (provider.is_suspended) fail("Account suspended. You cannot accept new jobs.", 403);
    if (job.provider_id && job.provider_id !== providerUserId) {
      fail("Job assigned to another provider", 403);
    }
    if (job.status !== "pending_provider") fail("Job not available.", 400);
    if (!job.provider_id) {
      const dispatch = unwrap(
        await this.client()
          .from("job_dispatches")
          .select("id")
          .eq("job_id", jobId)
          .eq("provider_user_id", providerUserId)
          .in("status", ["notified", "broadcast"])
          .maybeSingle(),
      ) as { id: number } | null;
      if (!dispatch) fail("This job was not dispatched to you.", 403);
    }
    const open = unwrap(
      await this.client()
        .from("job_requests")
        .select("id")
        .eq("provider_id", providerUserId)
        .in("status", ["accepted", "in_progress"])
        .neq("id", jobId)
        .limit(1),
    ) as any[];
    if (open?.length) fail("Finish your current job before accepting a new one.", 409);
    // Django defaults to accepted; if Flutter already paid, advance to in_progress
    const nextStatus = job.is_paid ? "in_progress" : "accepted";
    const claimed = unwrap(
      await this.client()
        .from("job_requests")
        .update({ provider_id: providerUserId, status: nextStatus })
        .eq("id", jobId)
        .eq("status", "pending_provider")
        .select("id")
        .maybeSingle(),
    ) as { id: number } | null;
    if (!claimed) fail("Another provider has already accepted this job.", 409);
    unwrap(
      await this.client()
        .from("job_dispatches")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("job_id", jobId)
        .eq("provider_user_id", providerUserId),
    );
    unwrap(
      await this.client()
        .from("job_dispatches")
        .update({ status: "closed", responded_at: new Date().toISOString() })
        .eq("job_id", jobId)
        .neq("provider_user_id", providerUserId)
        .in("status", ["queued", "notified", "broadcast"]),
    );
    if (job.is_paid) {
      unwrap(
        await this.client()
          .from("service_provider_profiles")
          .update({ current_status: "busy" })
          .eq("user_id", providerUserId),
      );
    }
    return { detail: "Job accepted, awaiting payment." };
  }

  async markPaid(jobId: number) {
    const job = await this.getJob(jobId);
    if (job.status !== "accepted") fail("Job must be accepted first.", 400);
    unwrap(
      await this.client()
        .from("job_requests")
        .update({ is_paid: true, status: "in_progress" })
        .eq("id", jobId),
    );
    if (job.provider_id) {
      unwrap(
        await this.client()
          .from("service_provider_profiles")
          .update({ current_status: "busy" })
          .eq("user_id", job.provider_id),
      );
    }
    return { detail: "Payment recorded, job in progress." };
  }

  async startTrip(jobId: number, providerUserId: string) {
    const job = await this.getJob(jobId);
    if (job.provider_id !== providerUserId) fail("Only the assigned provider can start this trip.", 403);
    if (!["accepted", "in_progress"].includes(job.status)) {
      fail("Only accepted jobs can start live tracking.", 400);
    }
    if (job.status === "accepted") {
      unwrap(await this.client().from("job_requests").update({ status: "in_progress" }).eq("id", jobId));
    }
    unwrap(await this.client().from("service_provider_profiles").update({ current_status: "busy" }).eq("user_id", providerUserId));
    return { detail: "Live tracking started." };
  }

  async declineJob(jobId: number, providerUserId: string) {
    const job = await this.getJob(jobId);
    const provider = await this.getProviderByUser(providerUserId);
    if (!provider) fail("Only providers can decline jobs.", 403);
    if (job.status !== "pending_provider") fail("Only pending jobs can be declined.", 400);
    if (job.provider_id && job.provider_id !== providerUserId) {
      fail("This job is reserved for another provider.", 403);
    }
    const fallback = (unwrap(await this.client().from("service_provider_profiles").select("id").eq("category_id", job.category_id).eq("verified", true).eq("is_suspended", false).eq("current_status", "available").neq("user_id", providerUserId).limit(1)) as any[])[0];
    unwrap(await this.client().from("job_requests").update({ status: "cancelled", expired_at: new Date().toISOString(), fallback_provider_id: fallback?.id ?? null }).eq("id", jobId));
    return { detail: "Job declined.", fallback_provider_id: fallback?.id ?? null };
  }

  async completeJob(jobId: number, providerUserId: string) {
    const job = await this.getJob(jobId);
    if (job.provider_id !== providerUserId) fail("Not your job", 403);
    if (job.status !== "in_progress") fail("Job must be in progress to complete.", 400);
    unwrap(await this.client().from("job_requests").update({ status: "completed" }).eq("id", jobId));
    const provider = await this.getProviderByUser(providerUserId);
    if (provider) {
      const total = provider.total_jobs_completed + 1;
      unwrap(
        await this.client()
          .from("service_provider_profiles")
          .update({
            total_jobs_completed: total,
            tier: computeTier(total, provider.rating_avg),
            current_status: "available",
          })
          .eq("id", provider.id),
      );
    }
    return { detail: "Job marked as completed." };
  }

  async cancelJob(jobId: number, user: Profile) {
    const job = await this.getJob(jobId);
    if (user.role !== "admin" && user.id !== job.customer_id && user.id !== job.provider_id) fail("Forbidden", 403);
    if (["completed", "cancelled"].includes(job.status)) fail("Job already finished", 400);
    if (job.provider_id) {
      unwrap(await this.client().from("service_provider_profiles").update({ current_status: "available" }).eq("user_id", job.provider_id));
    }
    return { detail: "Job cancelled", job: await this.updateJob(jobId, { status: "cancelled" }) };
  }

  async updateLocation(jobId: number, providerUserId: string, lat: number, lng: number) {
    const job = await this.getJob(jobId);
    if (job.provider_id !== providerUserId) fail("Not your job", 403);
    if (!["accepted", "in_progress"].includes(job.status)) fail("Location updates not allowed", 400);
    const location = unwrap(
      await this.client().from("provider_locations").insert({ provider_id: providerUserId, job_id: jobId, lat, lng }).select().single(),
    );
    return { detail: "Location updated." };
  }

  async providerHeartbeat(userId: string, input: { lat: number; lng: number; status?: ServiceProviderProfile["current_status"] }) {
    const found = await this.getProviderByUser(userId);
    if (!found) fail("Provider profile missing", 404);
    const last_seen_at = new Date().toISOString();
    const patch = { current_lat: input.lat, current_lng: input.lng, last_seen_at, ...(input.status ? { current_status: input.status } : {}) };
    unwrap(await this.client().from("service_provider_profiles").update(patch).eq("id", found.id));
    const active = (unwrap(await this.client().from("job_requests").select("id").eq("provider_id", userId).in("status", ["accepted", "in_progress"]).limit(1)) as any[])[0];
    if (active) unwrap(await this.client().from("provider_locations").insert({ provider_id: userId, job_id: active.id, lat: input.lat, lng: input.lng }));
    return { detail: "Heartbeat received.", current_lat: input.lat, current_lng: input.lng, last_seen_at, active_job_id: active?.id ?? null, arrival_sms_sent: false };
  }

  async providerHeartbeatStatus(userId: string) {
    const found = await this.getProviderByUser(userId);
    if (!found) fail("Provider profile missing", 404);
    const [user, category, recent] = await Promise.all([
      this.getProfile(userId), found.category_id ? this.resolveCategory(found.category_id) : Promise.resolve(null),
      unwrap(await this.client().from("provider_locations").select("*").eq("provider_id", userId).order("recorded_at", { ascending: false }).limit(10)),
    ]);
    const seconds = found.last_seen_at ? Math.max(0, Math.floor((Date.now() - new Date(found.last_seen_at).getTime()) / 1000)) : null;
    return { username: user?.username || "", category: category?.name || null, current_status: found.current_status, current_lat: found.current_lat, current_lng: found.current_lng, last_seen_at: found.last_seen_at, seconds_since_last_heartbeat: seconds, is_live: isFresh(found.last_seen_at), ttl_minutes: 5, recent_job_locations: recent };
  }

  async latestLocation(jobId: number) {
    await this.getJob(jobId);
    const latest = unwrap(
      await this.client().from("provider_locations").select("*").eq("job_id", jobId).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
    ) as any;
    return { latest: latest ? { lat: latest.lat, lng: latest.lng, recorded_at: latest.recorded_at } : null };
  }

  async createRating(customerId: string, data: { job: number; score: number; comment?: string }) {
    const job = await this.getJob(data.job);
    if (job.customer_id !== customerId) fail("Only the customer can rate this job", 403);
    if (job.status !== "completed") fail("Job must be completed", 400);
    if (!job.provider_id) fail("No provider on job", 400);
    const existing = unwrap(await this.client().from("ratings").select("id").eq("job_id", job.id).maybeSingle());
    if (existing) fail("Job already rated", 400);
    const rating = unwrap(
      await this.client().from("ratings").insert({ job_id: job.id, customer_id: customerId, provider_id: job.provider_id, score: data.score, comment: data.comment || "" }).select().single(),
    ) as any;
    const found = await this.getProviderByUser(job.provider_id);
    if (found) {
      const ratingCount = found.rating_count + 1;
      const ratingAvg = Math.round(((found.rating_avg * found.rating_count + data.score) / ratingCount) * 100) / 100;
      unwrap(await this.client().from("service_provider_profiles").update({
        rating_count: ratingCount, rating_avg: ratingAvg, tier: computeTier(found.total_jobs_completed, ratingAvg),
      }).eq("id", found.id));
    }
    return rating;
  }

  async listRatings() {
    return unwrap(await this.client().from("ratings").select("*").order("created_at", { ascending: false }));
  }

  async initiatePayment(jobId: number, customerId: string, opts?: { phone_number?: string }) {
    const job = await this.getJob(jobId);
    if (job.customer_id !== customerId) fail("Not your job", 403);
    if (!job.provider_id) fail("Job has no assigned provider.", 400);
    let found = unwrap(await this.client().from("payments").select("*").eq("job_id", jobId).maybeSingle()) as any;
    if (!found) {
      found = unwrap(
        await this.client()
          .from("payments")
          .insert({ job_id: jobId, provider_id: job.provider_id, amount: 50, status: "initiated", ...PAYMENT_DEFAULTS, phone_number: opts?.phone_number ?? "" })
          .select()
          .single(),
      );
    }
    found = unwrap(
      await this.client().from("payments").update({ status: "pending" }).eq("id", found.id).select().single(),
    );

    // Match memory/demo behavior so Flutter can complete the loop without Daraja
    if (process.env.MPESA_AUTO_SUCCESS !== "false") {
      found = unwrap(
        await this.client()
          .from("payments")
          .update({ status: "success", mpesa_reference: `DEMO-${Date.now()}` })
          .eq("id", found.id)
          .select()
          .single(),
      );
      const jobPatch: Record<string, unknown> = { is_paid: true };
      if (job.status === "accepted") {
        jobPatch.status = "in_progress";
        unwrap(
          await this.client()
            .from("service_provider_profiles")
            .update({ current_status: "busy" })
            .eq("user_id", job.provider_id),
        );
      }
      unwrap(await this.client().from("job_requests").update(jobPatch).eq("id", jobId));
    }

    // Django PaymentSerializer field names
    return {
      id: found.id,
      job: found.job_id,
      provider: found.provider_id,
      amount: Number(found.amount),
      currency: found.currency,
      mpesa_reference: found.mpesa_reference,
      status: found.status,
      created_at: found.created_at,
      updated_at: found.updated_at,
      checkout_request_id: found.checkout_request_id,
      merchant_request_id: found.merchant_request_id,
      phone_number: found.phone_number,
      result_code: found.result_code,
      result_desc: found.result_desc,
    };
  }

  async paymentCallback(input: { job_id: number; result_code: string; mpesa_reference?: string }) {
    const job = await this.getJob(input.job_id);
    let found = unwrap(await this.client().from("payments").select("*").eq("job_id", input.job_id).maybeSingle()) as any;
    if (!found) {
      if (!job.provider_id) fail("Job has no provider", 400);
      found = unwrap(
        await this.client()
          .from("payments")
          .insert({ job_id: job.id, provider_id: job.provider_id, status: "pending", ...PAYMENT_DEFAULTS })
          .select()
          .single(),
      );
    }
    if (String(input.result_code) === "0") {
      unwrap(
        await this.client()
          .from("payments")
          .update({ status: "success", mpesa_reference: input.mpesa_reference || found.mpesa_reference })
          .eq("id", found.id),
      );
      // Django callback: is_paid + in_progress
      unwrap(
        await this.client()
          .from("job_requests")
          .update({ is_paid: true, status: "in_progress" })
          .eq("id", job.id),
      );
      if (job.provider_id) {
        unwrap(
          await this.client()
            .from("service_provider_profiles")
            .update({ current_status: "busy" })
            .eq("user_id", job.provider_id),
        );
      }
    } else {
      unwrap(await this.client().from("payments").update({ status: "failed" }).eq("id", found.id));
    }
    return { detail: "Callback processed." };
  }

  async listPayments() {
    return (unwrap(await this.client().from("payments").select("*").order("created_at", { ascending: false })) as any[]).map(payment);
  }

  async queryPayment(jobId: number, customerId: string) {
    const job = await this.getJob(jobId);
    if (job.customer_id !== customerId) fail("Not your job", 403);
    let found = unwrap(await this.client().from("payments").select("*").eq("job_id", jobId).maybeSingle()) as any;
    if (found?.status === "pending" && process.env.MPESA_AUTO_SUCCESS !== "false") {
      found = unwrap(await this.client().from("payments").update({ status: "success", mpesa_reference: found.mpesa_reference || `DEMO-${Date.now()}` }).eq("id", found.id).select().single());
      unwrap(await this.client().from("job_requests").update({ is_paid: true }).eq("id", jobId));
      job.is_paid = true;
    }
    return {
      status: found?.status ?? "initiated",
      result_code: found?.result_code ?? "",
      result_desc: found?.result_desc ?? "",
      is_paid: job.is_paid,
      raw: null,
    };
  }

  async initiateDiscoveryPayment(customerId: string, data: { phone_number: string; amount?: number; category_id?: number; lat?: number; lng?: number; query?: string; provider_count?: number }) {
    const feeEnabled = process.env.CONNECTION_FEE_ENABLED === "true";
    if (!feeEnabled) {
      const found = unwrap(await this.client().from("discovery_payments").insert({
        customer_id: customerId,
        amount: 0,
        currency: "KES",
        phone_number: (data.phone_number || "").slice(0, 20),
        category_id: data.category_id ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        query: (data.query ?? "").slice(0, 255),
        provider_count: data.provider_count ?? 0,
        checkout_request_id: "",
        merchant_request_id: "",
        mpesa_reference: "",
        result_code: "",
        result_desc: "Connection fee disabled by feature flag.",
        status: "success",
      }).select().single()) as any;
      return {
        ...found,
        customer: customerId,
        is_paid: true,
        fee_enabled: false,
        customer_message: "Connection fee is currently waived.",
      };
    }
    const amount = Math.max(50, data.amount ?? 50);
    let found = unwrap(await this.client().from("discovery_payments").insert({
      customer_id: customerId, amount, currency: "KES", phone_number: data.phone_number,
      category_id: data.category_id ?? null, lat: data.lat ?? null, lng: data.lng ?? null, query: data.query ?? "", provider_count: data.provider_count ?? 0,
      checkout_request_id: "", merchant_request_id: "", mpesa_reference: "", result_code: "", result_desc: "", status: "pending",
    }).select().single()) as any;
    if (process.env.MPESA_AUTO_SUCCESS !== "false") {
      found = unwrap(await this.client().from("discovery_payments").update({ status: "success", mpesa_reference: `DEMO-${Date.now()}`, result_code: "0" }).eq("id", found.id).select().single()) as any;
    }
    return {
      ...found,
      customer: customerId,
      is_paid: found.status === "success",
      fee_enabled: true,
      customer_message: found.status === "success" ? "Payment recorded." : "STK push sent.",
    };
  }

  async getDiscoveryPayment(id: number, customerId: string) {
    let found = unwrap(await this.client().from("discovery_payments").select("*").eq("id", id).eq("customer_id", customerId).maybeSingle()) as any;
    if (!found) fail("Discovery payment not found", 404);
    if (found.status === "pending" && process.env.MPESA_AUTO_SUCCESS !== "false") found = unwrap(await this.client().from("discovery_payments").update({ status: "success", mpesa_reference: `DEMO-${Date.now()}`, result_code: "0" }).eq("id", id).select().single()) as any;
    return { ...found, customer: customerId, is_paid: found.status === "success" };
  }

  async consumeDiscoveryPayment(id: number, customerId: string, jobId: number) {
    const found = unwrap(await this.client().from("discovery_payments").select("*").eq("id", id).eq("customer_id", customerId).maybeSingle()) as any;
    if (!found || found.status !== "success" || found.consumed_at) return false;
    unwrap(await this.client().from("discovery_payments").update({ consumed_at: new Date().toISOString(), consumed_job_id: jobId }).eq("id", id));
    return true;
  }

  async autocompleteServices(q: string) {
    const needle = q.trim();
    if (!needle) return [];
    const catRes = await this.client()
      .from("service_categories")
      .select("name")
      .ilike("name", `%${needle}%`)
      .limit(10);
    const categories = (catRes.data as any[]) || [];
    const provRes = await this.client()
      .from("service_provider_profiles")
      .select("bio, profiles!inner(username)")
      .ilike("bio", `%${needle}%`)
      .limit(10);
    const providers = (provRes.data as any[]) || [];
    const names = [
      ...categories.map((item) => item.name),
      ...providers.map((item) => item.profiles?.username).filter(Boolean),
    ];
    return [...new Set(names.filter(Boolean))].slice(0, 10);
  }

  async getAppConfig() {
    return { connection_fee_enabled: process.env.CONNECTION_FEE_ENABLED === "true", connection_fee_kes: Number(process.env.CONNECTION_FEE_KES || 50), geofence_default_radius_km: 10, geofence_max_radius_km: 30, arrival_notification_meters: 500, provider_response_timeout_min: 5 };
  }

  async listLiveProviders(staleAfterMin = 10) {
    const generated_at = new Date().toISOString();
    const rows = unwrap(await this.client().from("service_provider_profiles").select("*, profiles!inner(username,full_name), service_categories(name)")) as any[];
    const jobs = unwrap(await this.client().from("job_requests").select("*").in("status", ["accepted", "in_progress"])) as JobRequest[];
    const locations = unwrap(await this.client().from("provider_locations").select("*").order("recorded_at", { ascending: false })) as any[];
    const staleMs = staleAfterMin * 60_000;
    const providers = rows.flatMap((item) => {
      const active = jobs.find((job) => job.provider_id === item.user_id);
      const trail = active ? locations.find((location) => location.job_id === active.id) : null;
      const seen = trail?.recorded_at ?? item.last_seen_at;
      const lat = trail?.lat ?? item.current_lat ?? item.base_lat;
      const lng = trail?.lng ?? item.current_lng ?? item.base_lng;
      if (!seen || lat == null || lng == null || Date.now() - new Date(seen).getTime() > staleMs) return [];
      return [{ provider_id: item.id, profile_id: item.id, name: item.profiles?.full_name || item.profiles?.username || "", username: item.profiles?.username || "", category: item.service_categories?.name || null, status: item.current_status, tier: item.tier, rating_avg: Number(item.rating_avg), verified: item.verified, lat: Number(lat), lng: Number(lng), last_seen: seen, minutes_since_seen: Math.max(0, Math.round((Date.now() - new Date(seen).getTime()) / 6000) / 10), location_source: trail ? "job_trail" : isFresh(item.last_seen_at, staleMs) ? "heartbeat" : "base", active_job: active ? { id: active.id, status: active.status } : null }];
    });
    return { generated_at, count: providers.length, stale_after_min: staleAfterMin, excluded_stale: rows.length - providers.length, providers };
  }

  async listMyAds(userId: string) {
    return (unwrap(await this.client().from("ad_placements").select("*").eq("sponsor_id", userId).order("created_at", { ascending: false })) as any[]).map((row) => ({ ...row, amount_paid: Number(row.amount_paid) }));
  }

  async listAllAds() {
    return (unwrap(await this.client().from("ad_placements").select("*").order("created_at", { ascending: false })) as any[]).map((row) => ({ ...row, amount_paid: Number(row.amount_paid) }));
  }

  async getAd(id: number) {
    const row = unwrap(await this.client().from("ad_placements").select("*").eq("id", id).maybeSingle()) as any;
    return row ? { ...row, amount_paid: Number(row.amount_paid) } : null;
  }

  async deleteAd(id: number) {
    unwrap(await this.client().from("ad_placements").delete().eq("id", id));
    return true;
  }

  async listPublicAds(filters: { category?: string; country?: string; city?: string }) {
    let query = this.client().from("ad_placements").select("id,title,description,category,store_lat,store_lng").eq("status", "active");
    if (filters.category) query = query.ilike("category", filters.category);
    if (filters.country) query = query.ilike("target_country", filters.country);
    if (filters.city) query = query.ilike("target_city", filters.city);
    return unwrap(await query);
  }

  async createAd(userId: string, data: Partial<AdPlacement>) {
    const row = unwrap(
      await this.client().from("ad_placements").insert({
        sponsor_id: userId, title: data.title || "", description: data.description || "", category: data.category || "",
        target_country: data.target_country || "", target_city: data.target_city || "", store_lat: data.store_lat ?? null,
        store_lng: data.store_lng ?? null, amount_paid: data.amount_paid ?? 0,
      }).select().single(),
    ) as any;
    return { ...row, amount_paid: Number(row.amount_paid) };
  }

  async updateAd(id: number, userId: string | null, data: Partial<AdPlacement>, isAdmin = false) {
    const existing = await this.getAd(id);
    if (!existing) fail("Ad not found", 404);
    if (!isAdmin && existing.sponsor_id !== userId) fail("Forbidden", 403);
    const row = unwrap(await this.client().from("ad_placements").update(data).eq("id", id).select().single()) as any;
    return { ...row, amount_paid: Number(row.amount_paid) };
  }

  async setProviderAdmin(providerId: number, patch: Partial<Pick<ServiceProviderProfile, "verified" | "is_suspended" | "suspended_reason" | "current_status">>) {
    const found = await this.getProviderById(providerId);
    if (!found) fail("Provider not found", 404);
    unwrap(await this.client().from("service_provider_profiles").update(patch).eq("id", providerId));
    return this.providerAnalytics(providerId);
  }

  async matchProviders(lat: number, lng: number, opts?: { categoryId?: number; category?: string | number; categoryName?: string; description?: string; pricePreference?: string; urgency?: string; budgetMin?: number; budgetMax?: number; radiusKm?: number; priority?: string } | number, legacyDescription?: string) {
    const input = typeof opts === "number" ? { categoryId: opts, description: legacyDescription } : opts;
    const category = input?.categoryId ? await this.resolveCategory(input.categoryId) : input?.category ?? input?.categoryName ? await this.resolveCategory(input.category ?? input.categoryName!) : null;
    // Rank by distance to job pin; ignore hard radius cutoffs (legacy radiusKm kept in response for clients)
    const nearby = await this.nearbyProviders(lat, lng, category ? String(category.id) : undefined);
    const desc = (input?.description || "").toLowerCase();
    const options = nearby.map((item: any) => {
      let score = (5 - Math.min(item.distance_km, 20) / 4) + item.rating_avg;
      if (item.tier === "platinum") score += 2;
      if (item.tier === "gold") score += 1.5;
      if (item.tier === "silver") score += 1;
      if (desc && String(item.category).toLowerCase().includes(desc.split(" ")[0] || "")) score += 1;
      if (desc && item.bio.toLowerCase().includes(desc.slice(0, 12))) score += 0.5;
      if (input?.budgetMax != null && item.price_min <= input.budgetMax) score += 1;
      return { score: Math.round(score * 100) / 100, id: item.id, user_id: item.id, user_name: item.user_name, category: item.category, category_name: category?.name ?? null, tier: item.tier, rating_avg: item.rating_avg, rating_count: item.rating_count, total_jobs_completed: item.total_jobs_completed, current_status: item.current_status, distance_km: item.distance_km, location_source: item.location_source, last_seen_at: item.last_seen_at, price_min: item.price_min, price_max: item.price_max, predicted_price: Math.round((item.price_min + item.price_max) / 2 + item.distance_km * 25), price_prediction_confidence: item.rating_count >= 10 ? "High" : "Medium", ai_reason: `Nearest-ranked ${item.tier} provider${input?.urgency ? ` for ${input.urgency} request` : ""} (${item.distance_km} km from job pin).` };
    }).sort((a: any, b: any) => b.score - a.score);
    if (!category) {
      return {
        category: null,
        category_name: null,
        options: [],
        message: "No matching service category was found.",
      };
    }
    return { category: category.id, category_name: category.name, options, budget_fit: input?.budgetMax == null ? null : options.some((item: any) => item.price_min <= input.budgetMax!), client_budget_min: input?.budgetMin ?? null, client_budget_max: input?.budgetMax ?? null, priority: input?.priority ?? input?.urgency ?? null, radius_km: null, ranking: "nearest_to_pin" };
  }

  async feedbackSummary(providerId: number) {
    const found = await this.getProviderById(providerId);
    if (!found) fail("Provider not found", 404);
    const reviews = (unwrap(await this.client().from("ratings").select("*").eq("provider_id", found.user_id)) as any[]);
    const comments = reviews.map((review) => review.comment).filter(Boolean);
    return {
      provider_id: providerId,
      review_count: reviews.length,
      summary: comments.length === 0
        ? "No customer reviews yet."
        : `Customers highlight reliability and service quality. Average score ${found.rating_avg}/5 across ${reviews.length} reviews. Themes: ${comments.slice(0, 3).join("; ") || "general satisfaction"}.`,
    };
  }

  async getJobByAccessToken(token: string, otp: string) {
    const row = unwrap(
      await this.client()
        .from("job_requests")
        .select("*")
        .eq("provider_access_token", token)
        .eq("provider_access_otp", otp)
        .maybeSingle(),
    ) as JobRequest | null;
    if (!row) fail("Invalid session token or OTP", 404);
    return this.serializeJob(row);
  }

  async expirePendingJobs(timeoutMin = 5) {
    const cutoff = new Date(Date.now() - timeoutMin * 60_000).toISOString();
    const candidates = unwrap(
      await this.client()
        .from("job_requests")
        .select("*")
        .eq("status", "pending_provider")
        .is("dispatch_started_at", null)
        .not("pending_since", "is", null)
        .lt("pending_since", cutoff),
    ) as JobRequest[];
    const expired = [];
    for (const job of candidates) {
      const fallback = (
        unwrap(
          await this.client()
            .from("service_provider_profiles")
            .select("id")
            .eq("category_id", job.category_id)
            .eq("verified", true)
            .eq("is_suspended", false)
            .eq("current_status", "available")
            .neq("user_id", job.provider_id || "")
            .limit(1),
        ) as any[]
      )[0];
      unwrap(
        await this.client()
          .from("job_requests")
          .update({
            status: "cancelled",
            expired_at: new Date().toISOString(),
            fallback_provider_id: fallback?.id ?? null,
          })
          .eq("id", job.id),
      );
      expired.push({ job_id: job.id, fallback_provider_id: fallback?.id ?? null });
    }
    return { expired, count: expired.length };
  }

  async predictPrice(input: {
    lat: number;
    lng: number;
    categoryId?: number;
    category?: string | number;
    categoryName?: string;
    pricePreference?: string;
  }) {
    const category = input.categoryId
      ? await this.resolveCategory(input.categoryId)
      : input.category || input.categoryName
        ? await this.resolveCategory(input.category ?? input.categoryName!)
        : null;
    if (!category) {
      return {
        predicted_price: null,
        confidence: "Low",
        reason: "No matching service category was found.",
      };
    }
    const providers = (
      unwrap(
        await this.client()
          .from("service_provider_profiles")
          .select("*")
          .eq("category_id", category.id)
          .eq("verified", true)
          .eq("is_suspended", false)
          .neq("current_status", "offline"),
      ) as ServiceProviderProfile[]
    ).filter((p) => p.base_lat != null || p.current_lat != null);
    if (!providers.length) {
      return {
        category: category.id,
        category_name: category.name,
        predicted_price: null,
        confidence: "Low",
        reason: `No available providers found for ${category.name}.`,
      };
    }
    const pref = (input.pricePreference || "standard").toLowerCase();
    const predictions = providers.map((p) => {
      const lat = p.current_lat ?? p.base_lat!;
      const lng = p.current_lng ?? p.base_lng!;
      const distance = haversineKm(input.lat, input.lng, lat, lng);
      const mid = (Number(p.price_min) + Number(p.price_max)) / 2;
      const base = pref === "budget" ? Number(p.price_min) * 1.08 : pref === "premium" ? mid * 1.25 : mid;
      const predicted = Math.max(
        Number(p.price_min),
        Math.min(base + Math.min(distance * 35, 700), Number(p.price_max)),
      );
      return Math.round(predicted / 50) * 50;
    });
    const average = Math.round(predictions.reduce((a, b) => a + b, 0) / predictions.length / 50) * 50;
    return {
      category: category.id,
      category_name: category.name,
      predicted_price: average,
      confidence: predictions.length >= 5 ? "High" : "Medium",
      reason: `Estimated from ${predictions.length} nearby ${category.name} provider price ranges, distance and rating data.`,
    };
  }

  async getCurrentTerms(audience: "all" | "customer" | "provider" = "all") {
    const row = unwrap(
      await this.client()
        .from("terms_versions")
        .select("*")
        .eq("is_current", true)
        .in("audience", audience === "all" ? ["all"] : ["all", audience])
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ) as any;
    return row;
  }

  async acceptTerms(userId: string, role: string, versionId?: number, clientMeta: Record<string, unknown> = {}) {
    let terms = versionId
      ? unwrap(await this.client().from("terms_versions").select("*").eq("id", versionId).maybeSingle())
      : await this.getCurrentTerms(role === "provider" ? "provider" : role === "customer" ? "customer" : "all");
    if (!terms) fail("No current terms version found", 404);
    const row = unwrap(
      await this.client()
        .from("user_terms_acceptances")
        .upsert(
          {
            user_id: userId,
            terms_version_id: terms.id,
            role,
            accepted_at: new Date().toISOString(),
            client_meta: clientMeta,
          },
          { onConflict: "user_id,terms_version_id" },
        )
        .select()
        .single(),
    ) as any;
    if (role === "provider") {
      await this.client()
        .from("service_provider_profiles")
        .update({ terms_accepted_at: row.accepted_at })
        .eq("user_id", userId);
    }
    return { acceptance: row, terms };
  }

  async createComplaint(input: {
    reporter_id: string;
    reporter_role: string;
    job_id?: number | null;
    against_user_id?: string | null;
    category?: string;
    body: string;
  }) {
    if (!(input.body || "").trim()) fail("Complaint body is required", 400);
    const row = unwrap(
      await this.client()
        .from("complaints")
        .insert({
          reporter_id: input.reporter_id,
          reporter_role: input.reporter_role,
          job_id: input.job_id ?? null,
          against_user_id: input.against_user_id ?? null,
          category: input.category || "general",
          body: input.body.trim(),
          status: "open",
        })
        .select()
        .single(),
    ) as any;
    return row;
  }

  async listComplaints(user: Profile) {
    let query = this.client().from("complaints").select("*").order("created_at", { ascending: false });
    if (user.role !== "admin" && user.role !== "operations") query = query.eq("reporter_id", user.id);
    return unwrap(await query) as any[];
  }

  async updateComplaint(
    id: number,
    patch: { status?: string; resolution_notes?: string },
    adminUserId: string,
  ) {
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.status) update.status = patch.status;
    if (patch.resolution_notes != null) update.resolution_notes = patch.resolution_notes;
    if (patch.status === "resolved" || patch.status === "dismissed") {
      update.resolved_at = new Date().toISOString();
      update.resolved_by = adminUserId;
    }
    const row = unwrap(
      await this.client().from("complaints").update(update).eq("id", id).select().single(),
    ) as any;
    return row;
  }

  spellAssist(text: string) {
    const dictionary: Record<string, string> = {
      plumbering: "plumbing",
      plumming: "plumbing",
      electical: "electrical",
      electrition: "electrician",
      cleaninig: "cleaning",
      salon: "salon",
      carpentary: "carpentry",
      mechaninc: "mechanic",
      pestcontrol: "pest control",
      paintting: "painting",
      laundary: "laundry",
      appilance: "appliance",
      repar: "repair",
      servce: "service",
      urgnet: "urgent",
      leack: "leak",
      leake: "leak",
      blockd: "blocked",
      cloged: "clogged",
    };
    const original = text || "";
    let corrected = original;
    const suggestions: string[] = [];
    for (const [wrong, right] of Object.entries(dictionary)) {
      const re = new RegExp(`\\b${wrong}\\b`, "ig");
      if (re.test(corrected)) {
        corrected = corrected.replace(re, right);
        suggestions.push(`${wrong} → ${right}`);
      }
    }
    return {
      original,
      corrected,
      changed: corrected !== original,
      suggestions,
    };
  }
}

export const supabaseStore = new SupabaseStore();