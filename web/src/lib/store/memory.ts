import { randomBytes, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { hashPassword, verifyPassword } from "@/lib/password";
import type {
  AdPlacement,
  Complaint,
  DiscoveryPayment,
  JobRequest,
  LegalDocument,
  Payment,
  Profile,
  ProviderDocumentType,
  ProviderLocation,
  Rating,
  ServiceCategory,
  ServiceProviderProfile,
  TermsAcceptance,
  TermsVersion,
} from "@/lib/types";
import { JOB_DEFAULTS, LEGAL_DOCUMENT_DEFAULTS, PAYMENT_DEFAULTS, PROVIDER_DEFAULTS } from "@/lib/types";

function now() {
  return new Date().toISOString();
}

const HEARTBEAT_TTL_MS = 5 * 60 * 1000;

function isFresh(timestamp: string | null | undefined, ttlMs = HEARTBEAT_TTL_MS) {
  return !!timestamp && Date.now() - new Date(timestamp).getTime() <= ttlMs;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeTier(jobs: number, avg: number) {
  if (jobs >= 150 && avg >= 4.8) return "platinum" as const;
  if (jobs >= 60 && avg >= 4.5) return "gold" as const;
  if (jobs >= 20 && avg >= 4.2) return "silver" as const;
  return "bronze" as const;
}

class MemoryStore {
  profiles = new Map<string, Profile>();
  categories: ServiceCategory[] = [];
  providers = new Map<number, ServiceProviderProfile>();
  jobs = new Map<number, JobRequest>();
  locations: ProviderLocation[] = [];
  ratings = new Map<number, Rating>();
  payments = new Map<number, Payment>();
  discoveryPayments = new Map<number, DiscoveryPayment>();
  ads = new Map<number, AdPlacement>();
  documents: LegalDocument[] = [];
  termsVersions: TermsVersion[] = [];
  termsAcceptances: TermsAcceptance[] = [];
  complaints: Complaint[] = [];

  private seq = {
    category: 1,
    provider: 1,
    job: 1,
    location: 1,
    rating: 1,
    payment: 1,
    discovery: 1,
    ad: 1,
    document: 1,
    terms: 1,
    acceptance: 1,
    complaint: 1,
  };

  constructor() {
    this.seed();
  }

  private seed() {
    const cats = [
      { name: "Plumber", icon: "plumbing" },
      { name: "Electrician", icon: "bolt" },
      { name: "Cleaner", icon: "cleaning_services" },
      { name: "Mechanic", icon: "car_repair" },
      { name: "Painter", icon: "format_paint" },
      { name: "Carpenter", icon: "carpenter" },
    ];
    for (const c of cats) {
      this.categories.push({ id: this.seq.category++, name: c.name, icon: c.icon });
    }

    const customerId = randomUUID();
    const providerId = randomUUID();
    const adminId = randomUUID();
    const hash = bcrypt.hashSync("password123", 10);

    this.profiles.set(customerId, {
      id: customerId,
      username: "customer1",
      email: "customer@slink.test",
      role: "customer",
      full_name: "Demo Customer",
      phone: "254712345678",
      password_hash: hash,
      created_at: now(),
    });

    this.profiles.set(providerId, {
      id: providerId,
      username: "provider1",
      email: "provider@slink.test",
      role: "provider",
      full_name: "Jane Provider",
      phone: "254700000001",
      password_hash: hash,
      created_at: now(),
    });

    this.profiles.set(adminId, {
      id: adminId,
      username: "admin",
      email: "admin@slink.test",
      role: "admin",
      full_name: "S-Link Admin",
      phone: "254711111111",
      password_hash: hash,
      created_at: now(),
    });

    this.termsVersions.push({
      id: this.seq.terms++,
      version: "2026-08-v1",
      title: "S-Link Terms of Service",
      body: "S-Link Terms of Service (v2026-08-v1). Platform connects customers with providers. Remote pins must be accurate. No fingerprint biometric storage.",
      audience: "all",
      published_at: now(),
      is_current: true,
    });

    const plumber = this.categories.find((c) => c.name === "Plumber")!;
    this.providers.set(this.seq.provider, {
      id: this.seq.provider++,
      user_id: providerId,
      category_id: plumber.id,
      bio: "Licensed plumber covering Nairobi CBD and Westlands.",
      base_lat: -1.286389,
      base_lng: 36.817223,
      service_radius_km: 15,
      tier: "silver",
      rating_avg: 4.7,
      rating_count: 14,
      total_jobs_completed: 22,
      verified: true,
      is_suspended: false,
      suspended_reason: "",
      current_status: "available",
      mpesa_till_or_paybill: "123456",
      ...PROVIDER_DEFAULTS,
    });

    // Extra demo providers near Nairobi
    const extras = [
      { username: "sparky", name: "Sam Electric", cat: "Electrician", lat: -1.28, lng: 36.82 },
      { username: "cleankeen", name: "Clean Keen", cat: "Cleaner", lat: -1.29, lng: 36.81 },
      { username: "fixemaster", name: "Fix Master", cat: "Mechanic", lat: -1.275, lng: 36.825 },
    ];
    for (const e of extras) {
      const id = randomUUID();
      this.profiles.set(id, {
        id,
        username: e.username,
        email: `${e.username}@slink.test`,
        role: "provider",
        full_name: e.name,
        phone: "254700000000",
        password_hash: hash,
        created_at: now(),
      });
      const cat = this.categories.find((c) => c.name === e.cat)!;
      this.providers.set(this.seq.provider, {
        id: this.seq.provider++,
        user_id: id,
        category_id: cat.id,
        bio: `${e.name} — reliable ${e.cat.toLowerCase()} services.`,
        base_lat: e.lat,
        base_lng: e.lng,
        service_radius_km: 12,
        tier: "bronze",
        rating_avg: 4.3,
        rating_count: 5,
        total_jobs_completed: 8,
        verified: true,
        is_suspended: false,
        suspended_reason: "",
        current_status: "available",
        mpesa_till_or_paybill: "",
        ...PROVIDER_DEFAULTS,
      });
    }
  }

  findProfileByUsername(username: string) {
    return [...this.profiles.values()].find((p) => p.username === username);
  }

  findProfileByEmail(email: string) {
    return [...this.profiles.values()].find(
      (p) => p.email.toLowerCase() === email.toLowerCase(),
    );
  }

  getProfile(id: string) {
    return this.profiles.get(id);
  }

  updateProfile(id: string, patch: Partial<Profile>) {
    const found = this.getProfile(id);
    if (!found) throw Object.assign(new Error("Profile not found"), { status: 404 });
    Object.assign(found, patch);
    return found;
  }

  async register(input: {
    username: string;
    email: string;
    password: string;
    role: Profile["role"];
    phone?: string;
    full_name?: string;
  }) {
    if (this.findProfileByUsername(input.username)) {
      throw Object.assign(new Error("Username already taken"), { status: 400 });
    }
    if (this.findProfileByEmail(input.email)) {
      throw Object.assign(new Error("Email already registered"), { status: 400 });
    }
    const id = randomUUID();
    const profile: Profile = {
      id,
      username: input.username,
      email: input.email.toLowerCase(),
      role: input.role,
      full_name: input.full_name || input.username,
      phone: input.phone || "",
      password_hash: await hashPassword(input.password),
      created_at: now(),
    };
    this.profiles.set(id, profile);
    // Django creates ServiceProviderProfile on first onboarding GET/PUT, not register.
    return profile;
  }

  async authenticate(username: string, password: string) {
    const login = username.trim();
    let profile = this.findProfileByUsername(login);
    if (!profile && login.includes("@")) {
      profile = this.findProfileByEmail(login.toLowerCase());
    }
    if (!profile?.password_hash) {
      throw Object.assign(new Error("No active account found with the given credentials"), {
        status: 401,
      });
    }
    const ok = await verifyPassword(password, profile.password_hash);
    if (!ok) {
      throw Object.assign(new Error("No active account found with the given credentials"), {
        status: 401,
      });
    }
    return profile;
  }

  async googleLogin(
    email: string,
    name?: string,
    opts?: { firebase_uid?: string; role?: Profile["role"] },
  ) {
    let profile = this.findProfileByEmail(email);
    if (!profile && opts?.firebase_uid) {
      profile = [...this.profiles.values()].find((p) => p.firebase_uid === opts.firebase_uid);
    }
    let created = false;
    if (!profile) {
      const username = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30) || "user";
      let unique = username;
      let i = 1;
      while (this.findProfileByUsername(unique)) {
        unique = `${username}${i++}`;
      }
      const role =
        opts?.role === "admin"
          ? "admin"
          : opts?.role === "operations"
            ? "operations"
            : opts?.role === "provider"
              ? "provider"
              : "customer";
      if (role === "admin" || role === "operations") {
        const id = randomUUID();
        profile = {
          id,
          username: unique,
          email,
          role,
          full_name: name || unique,
          phone: "",
          password_hash: await hashPassword(randomUUID()),
          firebase_uid: opts?.firebase_uid,
          created_at: now(),
        };
        this.profiles.set(id, profile);
      } else {
        profile = await this.register({
          username: unique,
          email,
          password: randomUUID(),
          role,
        });
        profile.full_name = name || profile.full_name;
        if (opts?.firebase_uid) profile.firebase_uid = opts.firebase_uid;
      }
      created = true;
    } else {
      if (name && (!profile.full_name || profile.full_name === profile.username)) {
        profile.full_name = name;
      }
      if (opts?.role === "admin" || opts?.role === "operations") {
        profile.role = opts.role;
      }
      if (opts?.firebase_uid) {
        profile.firebase_uid = opts.firebase_uid;
      }
    }
    return { profile, created };
  }

  listCategories() {
    return this.categories;
  }

  resolveCategory(value: string | number) {
    if (typeof value === "number" || /^\d+$/.test(String(value))) {
      const id = Number(value);
      return this.categories.find((c) => c.id === id) ?? null;
    }
    const needle = String(value).trim().toLowerCase();
    return (
      this.categories.find((c) => c.name.toLowerCase() === needle) ??
      this.categories.find((c) => c.name.toLowerCase().includes(needle) || needle.includes(c.name.toLowerCase())) ??
      null
    );
  }

  inferCategory(opts?: {
    categoryId?: number;
    category?: string | number;
    categoryName?: string;
    description?: string;
  }) {
    if (opts?.categoryId != null) {
      const byId = this.resolveCategory(opts.categoryId);
      if (byId) return byId;
    }
    for (const candidate of [opts?.category, opts?.categoryName]) {
      if (candidate == null || candidate === "") continue;
      const resolved = this.resolveCategory(candidate);
      if (resolved) return resolved;
    }
    const haystack = `${opts?.categoryName || ""} ${opts?.description || ""}`.toLowerCase();
    if (!haystack.trim()) return null;
    return (
      this.categories.find((category) => {
        const name = category.name.toLowerCase();
        return haystack.includes(name) || name.split(/\s+/).some((part) => part.length > 3 && haystack.includes(part));
      }) ?? null
    );
  }

  getProviderByUser(userId: string) {
    return [...this.providers.values()].find((p) => p.user_id === userId);
  }

  getProviderById(id: number) {
    return this.providers.get(id);
  }

  nearbyProviders(lat: number, lng: number, category?: string) {
    const cat = category ? this.resolveCategory(category) : null;
    return [...this.providers.values()]
      .filter((p) => p.verified && !p.is_suspended && p.current_status === "available")
      .filter((p) => (isFresh(p.last_seen_at) && p.current_lat != null && p.current_lng != null) || (p.base_lat != null && p.base_lng != null))
      .filter((p) => !cat || p.category_id === cat.id)
      .map((p) => {
        const user = this.profiles.get(p.user_id)!;
        const live = isFresh(p.last_seen_at) && p.current_lat != null && p.current_lng != null;
        const pointLat = live ? p.current_lat! : p.base_lat!;
        const pointLng = live ? p.current_lng! : p.base_lng!;
        const distance = haversineKm(lat, lng, pointLat, pointLng);
        return {
          id: p.id,
          user_id: p.id,
          user_name: user.username,
          category: p.category_id,
          bio: p.bio,
          base_lat: p.base_lat,
          base_lng: p.base_lng,
          current_lat: p.current_lat,
          current_lng: p.current_lng,
          last_seen_at: p.last_seen_at,
          location_source: live ? "heartbeat" : "base",
          price_min: p.price_min,
          price_max: p.price_max,
          average_response_minutes: p.average_response_minutes,
          current_status: p.current_status,
          service_radius_km: p.service_radius_km,
          tier: p.tier,
          rating_avg: p.rating_avg,
          rating_count: p.rating_count,
          total_jobs_completed: p.total_jobs_completed,
          distance_km: Math.round(distance * 100) / 100,
          _user_id: p.user_id,
        };
      })
      .filter((p) => {
        // Soft area metadata retained; no hard radius geofence
        return true;
      })
      .sort((a, b) => a.distance_km - b.distance_km)
      .map(({ _user_id, ...rest }) => rest);
  }

  upsertProviderMe(
    userId: string,
    data: Partial<{
      category_id: number;
      bio: string;
      base_lat: number;
      base_lng: number;
      service_radius_km: number;
      mpesa_till_or_paybill: string;
      current_status: ServiceProviderProfile["current_status"];
      price_min: number;
      price_max: number;
      average_response_minutes: number;
      id_document_number: string;
      id_document_kind: string;
      area_place_id: string;
      area_formatted_address: string;
      profile_complete: boolean;
      terms_accepted_at: string | null;
    }>,
  ) {
    let provider = this.getProviderByUser(userId);
    if (!provider) {
      provider = {
        id: this.seq.provider++,
        user_id: userId,
        category_id: data.category_id ?? this.categories[0]?.id ?? null,
        bio: "",
        base_lat: null,
        base_lng: null,
        service_radius_km: 10,
        tier: "bronze",
        rating_avg: 0,
        rating_count: 0,
        total_jobs_completed: 0,
        verified: false,
        is_suspended: false,
        suspended_reason: "",
        current_status: "offline",
        mpesa_till_or_paybill: "",
        ...PROVIDER_DEFAULTS,
      };
      this.providers.set(provider.id, provider);
    }
    Object.assign(provider, {
      ...data,
      category_id: data.category_id ?? provider.category_id,
    });
    const user = this.getProfile(userId);
    const category = provider.category_id ? this.categories.find((item) => item.id === provider.category_id) : null;
    return {
      id: provider.id,
      user_id: provider.id,
      user_name: user?.username || "",
      user_email: user?.email || "",
      category: category ? { id: category.id, name: category.name } : null,
      bio: provider.bio,
      base_lat: provider.base_lat,
      base_lng: provider.base_lng,
      service_radius_km: provider.service_radius_km,
      mpesa_till_or_paybill: provider.mpesa_till_or_paybill,
      verified: provider.verified,
      price_min: provider.price_min,
      price_max: provider.price_max,
      average_response_minutes: provider.average_response_minutes,
      current_status: provider.current_status,
      id_document_number: provider.id_document_number || "",
      id_document_kind: provider.id_document_kind || "",
      area_place_id: provider.area_place_id || "",
      area_formatted_address: provider.area_formatted_address || "",
      terms_accepted_at: provider.terms_accepted_at,
      profile_complete: this.isProviderProfileComplete(provider),
    };
  }

  listProviderDocuments(profileId: number) {
    return this.documents.filter((d) => d.profile_id === profileId);
  }

  isProviderProfileComplete(provider: ServiceProviderProfile) {
    if (!(provider.category_id && provider.bio && provider.base_lat != null && provider.base_lng != null && provider.price_min != null && provider.price_max != null)) {
      return false;
    }
    if (!(provider.id_document_number || "").trim()) return false;
    return this.documents.some(
      (d) => d.profile_id === provider.id && d.document_type === "national_id_or_passport",
    );
  }

  providerAnalytics(userIdOrProfileId: string | number) {
    let provider: ServiceProviderProfile | undefined;
    if (typeof userIdOrProfileId === "number" || /^\d+$/.test(String(userIdOrProfileId))) {
      provider = this.providers.get(Number(userIdOrProfileId));
    } else {
      provider = this.getProviderByUser(String(userIdOrProfileId));
    }
    if (!provider) {
      throw Object.assign(new Error("Provider not found"), { status: 404 });
    }
    const user = this.profiles.get(provider.user_id)!;
    return {
      id: provider.id,
      user_name: user.username,
      tier: provider.tier,
      rating_avg: provider.rating_avg,
      rating_count: provider.rating_count,
      total_jobs_completed: provider.total_jobs_completed,
      service_radius_km: provider.service_radius_km,
      // Additive fields used by admin console / map (safe for Flutter)
      base_lat: provider.base_lat,
      base_lng: provider.base_lng,
      current_lat: provider.current_lat,
      current_lng: provider.current_lng,
      last_seen_at: provider.last_seen_at,
      verified: provider.verified,
      is_suspended: provider.is_suspended,
      current_status: provider.current_status,
    };
  }

  listAdminProviders() {
    return [...this.providers.values()].map((p) => this.providerAnalytics(p.id));
  }

  getAdminProviderDetail(profileId: number) {
    const provider = this.getProviderById(profileId);
    if (!provider) throw Object.assign(new Error("Provider not found"), { status: 404 });
    const user = this.getProfile(provider.user_id);
    const category = provider.category_id ? this.resolveCategory(provider.category_id) : null;
    const documents = this.listProviderDocuments(provider.id);

    return {
      id: provider.id,
      user_id: provider.user_id,
      user_name: user?.username || "",
      user_email: user?.email || "",
      user_phone: user?.phone || "",
      category: category ? { id: category.id, name: category.name } : null,
      bio: provider.bio || "",
      tier: provider.tier,
      rating_avg: provider.rating_avg,
      rating_count: provider.rating_count,
      total_jobs_completed: provider.total_jobs_completed,
      price_min: provider.price_min,
      price_max: provider.price_max,
      average_response_minutes: provider.average_response_minutes,
      service_radius_km: provider.service_radius_km,
      area_formatted_address: provider.area_formatted_address || "",
      base_lat: provider.base_lat,
      base_lng: provider.base_lng,
      current_lat: provider.current_lat,
      current_lng: provider.current_lng,
      last_seen_at: provider.last_seen_at,
      current_status: provider.current_status,
      verified: provider.verified,
      is_suspended: provider.is_suspended,
      suspended_reason: provider.suspended_reason || "",
      profile_complete: this.isProviderProfileComplete(provider),
      id_document_kind: provider.id_document_kind || "",
      id_document_number: provider.id_document_number || "",
      terms_accepted_at: provider.terms_accepted_at,
      documents,
    };
  }

  addDocument(
    userId: string,
    title: string,
    fileUrl: string,
    opts?: { document_type?: string },
  ) {
    const provider = this.getProviderByUser(userId);
    if (!provider) throw Object.assign(new Error("Provider profile missing"), { status: 400 });
    const doc: LegalDocument = {
      id: this.seq.document++,
      profile_id: provider.id,
      title,
      file: fileUrl,
      ...LEGAL_DOCUMENT_DEFAULTS,
      document_type: (opts?.document_type as ProviderDocumentType) || "other",
      uploaded_at: now(),
    };
    this.documents.push(doc);
    return {
      id: doc.id,
      title: doc.title,
      file: doc.file,
      document_type: doc.document_type,
      review_status: doc.review_status,
      review_notes: doc.review_notes,
      uploaded_at: doc.uploaded_at,
    };
  }

  reviewDocument(
    documentId: number,
    adminUserId: string,
    patch: { review_status: "approved" | "rejected"; review_notes?: string },
  ) {
    const doc = this.documents.find((d) => d.id === documentId);
    if (!doc) throw Object.assign(new Error("Document not found"), { status: 404 });
    doc.review_status = patch.review_status;
    doc.review_notes = patch.review_notes || "";
    doc.reviewed_at = now();
    doc.reviewed_by = adminUserId;
    return {
      id: doc.id,
      title: doc.title,
      file: doc.file,
      document_type: doc.document_type,
      review_status: doc.review_status,
      review_notes: doc.review_notes,
      reviewed_at: doc.reviewed_at,
      uploaded_at: doc.uploaded_at,
    };
  }

  resolveProviderUserId(providerField: string | number) {
    // Flutter sends nearby provider id = provider profile id
    if (typeof providerField === "number" || /^\d+$/.test(String(providerField))) {
      const profile = this.providers.get(Number(providerField));
      return profile?.user_id ?? null;
    }
    if (this.profiles.has(String(providerField))) return String(providerField);
    return null;
  }

  serializeJob(job: JobRequest, viewer?: Profile | null) {
    const latest = [...this.locations]
      .filter((l) => l.job_id === job.id)
      .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0];
    // Django JobRequestSerializer: category = FK id; provider = profile id for Flutter int cast
    let providerOut: number | null = null;
    if (job.provider_id) {
      const pp = this.getProviderByUser(job.provider_id);
      providerOut = pp?.id ?? null;
    }
    const category = this.categories.find((item) => item.id === job.category_id);
    const customer = this.profiles.get(job.customer_id);
    const providerUser = job.provider_id ? this.profiles.get(job.provider_id) : null;
    const revealPhone =
      viewer?.role === "admin" ||
      viewer?.role === "operations" ||
      viewer?.id === job.customer_id ||
      (job.provider_id != null && viewer?.id === job.provider_id && job.status !== "pending_provider") ||
      job.status !== "pending_provider";
    return {
      id: job.id,
      customer: job.customer_id,
      provider: providerOut,
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
      latest_location: latest
        ? { lat: latest.lat, lng: latest.lng, recorded_at: latest.recorded_at }
        : null,
    };
  }

  listJobs(user: Profile) {
    const all = [...this.jobs.values()];
    let filtered: JobRequest[];
    if (user.role === "admin" || user.role === "operations") filtered = all;
    else if (user.role === "provider") {
      filtered = all.filter((j) => j.provider_id === user.id);
    } else {
      filtered = all.filter((j) => j.customer_id === user.id);
    }
    return filtered
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((j) => this.serializeJob(j, user));
  }

  getJob(id: number) {
    const job = this.jobs.get(id);
    if (!job) throw Object.assign(new Error("Job not found"), { status: 404 });
    return job;
  }

  canProviderAccessDispatchedJob(jobId: number, providerUserId: string) {
    const job = this.getJob(jobId);
    return job.provider_id === providerUserId;
  }

  createJob(
    customerId: string,
    data: {
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
    },
  ) {
    if (!(data.description || "").trim()) {
      throw Object.assign(new Error("Please describe the problem before creating a job."), { status: 400 });
    }
    if (data.location_lat == null || data.location_lng == null) {
      throw Object.assign(new Error("A job location pin is required."), { status: 400 });
    }
    const category = this.resolveCategory(data.category);
    if (!category) throw Object.assign(new Error("Invalid category"), { status: 400 });
    const providerId = data.provider != null ? this.resolveProviderUserId(data.provider) : null;
    if (data.provider != null && !providerId) {
      throw Object.assign(new Error("Invalid provider"), { status: 400 });
    }
    const createdAt = now();
    const formatted = data.formatted_address || data.address_text || "";
    const job: JobRequest = {
      id: this.seq.job++,
      customer_id: customerId,
      provider_id: providerId,
      category_id: category.id,
      description: data.description,
      location_lat: data.location_lat,
      location_lng: data.location_lng,
      address_text: formatted || data.address_text,
      status: "pending_provider",
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
      created_at: createdAt,
      updated_at: createdAt,
    };
    this.jobs.set(job.id, job);
    if (data.discovery_payment_id && this.consumeDiscoveryPayment(data.discovery_payment_id, customerId, job.id)) {
      job.is_paid = true;
    }
    return this.serializeJob(job);
  }

  updateJob(id: number, patch: Partial<JobRequest>) {
    const job = this.getJob(id);
    Object.assign(job, patch, { updated_at: now() });
    return this.serializeJob(job);
  }

  acceptJob(jobId: number, providerUserId: string) {
    const job = this.getJob(jobId);
    const provider = this.getProviderByUser(providerUserId);
    if (!provider) throw Object.assign(new Error("Only providers can accept jobs."), { status: 403 });
    if (provider.is_suspended) {
      throw Object.assign(new Error("Account suspended. You cannot accept new jobs."), {
        status: 403,
      });
    }
    if (job.provider_id && job.provider_id !== providerUserId) {
      throw Object.assign(new Error("Job assigned to another provider"), { status: 403 });
    }
    if (job.status !== "pending_provider") {
      throw Object.assign(new Error("Job not available."), { status: 400 });
    }
    const open = [...this.jobs.values()].find(
      (j) =>
        j.provider_id === providerUserId &&
        ["accepted", "in_progress"].includes(j.status) &&
        j.id !== jobId,
    );
    if (open) {
      throw Object.assign(new Error("Finish your current job before accepting a new one."), {
        status: 409,
      });
    }
    // Django sets accepted; if already paid (Flutter pays before accept), move to in_progress
    // so the provider can complete without a separate mark_paid call.
    job.provider_id = providerUserId;
    if (job.is_paid) {
      job.status = "in_progress";
      provider.current_status = "busy";
      job.updated_at = now();
      return { detail: "Job accepted, awaiting payment." };
    }
    job.status = "accepted";
    job.updated_at = now();
    return { detail: "Job accepted, awaiting payment." };
  }

  markPaid(jobId: number) {
    const job = this.getJob(jobId);
    if (job.status !== "accepted") {
      throw Object.assign(new Error("Job must be accepted first."), { status: 400 });
    }
    job.is_paid = true;
    job.status = "in_progress";
    job.updated_at = now();
    const provider = job.provider_id ? this.getProviderByUser(job.provider_id) : null;
    if (provider) provider.current_status = "busy";
    return { detail: "Payment recorded, job in progress." };
  }

  startTrip(jobId: number, providerUserId: string) {
    const job = this.getJob(jobId);
    if (job.provider_id !== providerUserId) {
      throw Object.assign(new Error("Only the assigned provider can start this trip."), { status: 403 });
    }
    if (!["accepted", "in_progress"].includes(job.status)) {
      throw Object.assign(new Error("Only accepted jobs can start live tracking."), { status: 400 });
    }
    if (job.status === "accepted") job.status = "in_progress";
    job.updated_at = now();
    const provider = this.getProviderByUser(providerUserId);
    if (provider) provider.current_status = "busy";
    return { detail: "Live tracking started." };
  }

  declineJob(jobId: number, providerUserId: string) {
    const job = this.getJob(jobId);
    if (!this.getProviderByUser(providerUserId)) {
      throw Object.assign(new Error("Only providers can decline jobs."), { status: 403 });
    }
    if (job.status !== "pending_provider") {
      throw Object.assign(new Error("Only pending jobs can be declined."), { status: 400 });
    }
    if (job.provider_id && job.provider_id !== providerUserId) {
      throw Object.assign(new Error("This job is reserved for another provider."), { status: 403 });
    }
    const fallback = [...this.providers.values()].find((provider) =>
      provider.user_id !== providerUserId && provider.verified && !provider.is_suspended &&
      provider.current_status === "available" && provider.category_id === job.category_id,
    );
    job.status = "cancelled";
    job.expired_at = now();
    job.fallback_provider_id = fallback?.id ?? null;
    job.updated_at = now();
    return { detail: "Job declined.", fallback_provider_id: job.fallback_provider_id };
  }

  completeJob(jobId: number, providerUserId: string) {
    const job = this.getJob(jobId);
    if (job.provider_id !== providerUserId) {
      throw Object.assign(new Error("Not your job"), { status: 403 });
    }
    if (job.status !== "in_progress") {
      throw Object.assign(new Error("Job must be in progress to complete."), { status: 400 });
    }
    job.status = "completed";
    job.updated_at = now();
    const provider = this.getProviderByUser(providerUserId);
    if (provider) {
      provider.total_jobs_completed += 1;
      provider.tier = computeTier(provider.total_jobs_completed, provider.rating_avg);
      provider.current_status = "available";
    }
    return { detail: "Job marked as completed." };
  }

  cancelJob(jobId: number, user: Profile) {
    const job = this.getJob(jobId);
    if (user.role !== "admin" && user.id !== job.customer_id && user.id !== job.provider_id) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    if (["completed", "cancelled"].includes(job.status)) {
      throw Object.assign(new Error("Job already finished"), { status: 400 });
    }
    job.status = "cancelled";
    job.updated_at = now();
    if (job.provider_id) {
      const provider = this.getProviderByUser(job.provider_id);
      if (provider) provider.current_status = "available";
    }
    return { detail: "Job cancelled", job: this.serializeJob(job) };
  }

  updateLocation(jobId: number, providerUserId: string, lat: number, lng: number) {
    const job = this.getJob(jobId);
    if (job.provider_id !== providerUserId) {
      throw Object.assign(new Error("Not your job"), { status: 403 });
    }
    if (!["accepted", "in_progress"].includes(job.status)) {
      throw Object.assign(new Error("Location updates not allowed"), { status: 400 });
    }
    const loc: ProviderLocation = {
      id: this.seq.location++,
      provider_id: providerUserId,
      job_id: jobId,
      lat,
      lng,
      recorded_at: now(),
    };
    this.locations.push(loc);
    return { detail: "Location updated." };
  }

  providerHeartbeat(userId: string, input: { lat: number; lng: number; status?: ServiceProviderProfile["current_status"] }) {
    const provider = this.getProviderByUser(userId);
    if (!provider) throw Object.assign(new Error("Provider profile missing"), { status: 404 });
    provider.current_lat = input.lat;
    provider.current_lng = input.lng;
    provider.last_seen_at = now();
    if (input.status) provider.current_status = input.status;
    const active = [...this.jobs.values()].find((job) =>
      job.provider_id === userId && ["accepted", "in_progress"].includes(job.status),
    );
    if (active) this.locations.push({ id: this.seq.location++, provider_id: userId, job_id: active.id, lat: input.lat, lng: input.lng, recorded_at: provider.last_seen_at });
    return { detail: "Heartbeat received.", current_lat: provider.current_lat, current_lng: provider.current_lng, last_seen_at: provider.last_seen_at, active_job_id: active?.id ?? null, arrival_sms_sent: false };
  }

  providerHeartbeatStatus(userId: string) {
    const provider = this.getProviderByUser(userId);
    if (!provider) throw Object.assign(new Error("Provider profile missing"), { status: 404 });
    const user = this.profiles.get(userId);
    const category = this.categories.find((item) => item.id === provider.category_id);
    const recent = this.locations.filter((item) => item.provider_id === userId).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at)).slice(0, 10);
    const seconds = provider.last_seen_at ? Math.max(0, Math.floor((Date.now() - new Date(provider.last_seen_at).getTime()) / 1000)) : null;
    return { username: user?.username || "", category: category?.name || null, current_status: provider.current_status, current_lat: provider.current_lat, current_lng: provider.current_lng, last_seen_at: provider.last_seen_at, seconds_since_last_heartbeat: seconds, is_live: isFresh(provider.last_seen_at), ttl_minutes: 5, recent_job_locations: recent };
  }

  latestLocation(jobId: number) {
    this.getJob(jobId);
    const latest = [...this.locations]
      .filter((l) => l.job_id === jobId)
      .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0];
    return {
      latest: latest
        ? { lat: latest.lat, lng: latest.lng, recorded_at: latest.recorded_at }
        : null,
    };
  }

  createRating(customerId: string, data: { job: number; score: number; comment?: string }) {
    const job = this.getJob(data.job);
    if (job.customer_id !== customerId) {
      throw Object.assign(new Error("Only the customer can rate this job"), { status: 403 });
    }
    if (job.status !== "completed") {
      throw Object.assign(new Error("Job must be completed"), { status: 400 });
    }
    if ([...this.ratings.values()].some((r) => r.job_id === job.id)) {
      throw Object.assign(new Error("Job already rated"), { status: 400 });
    }
    if (!job.provider_id) throw Object.assign(new Error("No provider on job"), { status: 400 });
    if (data.score < 1 || data.score > 5) {
      throw Object.assign(new Error("Score must be 1-5"), { status: 400 });
    }
    const rating: Rating = {
      id: this.seq.rating++,
      job_id: job.id,
      customer_id: customerId,
      provider_id: job.provider_id,
      score: data.score,
      comment: data.comment || "",
      created_at: now(),
    };
    this.ratings.set(rating.id, rating);
    const provider = this.getProviderByUser(job.provider_id);
    if (provider) {
      const total = provider.rating_avg * provider.rating_count + data.score;
      provider.rating_count += 1;
      provider.rating_avg = Math.round((total / provider.rating_count) * 100) / 100;
      provider.tier = computeTier(provider.total_jobs_completed, provider.rating_avg);
    }
    return rating;
  }

  listRatings() {
    return [...this.ratings.values()];
  }

  initiatePayment(jobId: number, customerId: string, opts?: { phone_number?: string }) {
    const job = this.getJob(jobId);
    if (job.customer_id !== customerId) {
      throw Object.assign(new Error("Not your job"), { status: 403 });
    }
    if (!job.provider_id) {
      // Flutter creates job with provider — should exist
      throw Object.assign(new Error("Job has no provider"), { status: 400 });
    }
    let payment = [...this.payments.values()].find((p) => p.job_id === jobId);
    if (!payment) {
      payment = {
        id: this.seq.payment++,
        job_id: jobId,
        provider_id: job.provider_id,
        amount: 50,
        currency: "KES",
        mpesa_reference: "",
        status: "initiated",
        ...PAYMENT_DEFAULTS,
        phone_number: opts?.phone_number ?? "",
        created_at: now(),
        updated_at: now(),
      };
      this.payments.set(payment.id, payment);
    }
    payment.status = "pending";
    payment.updated_at = now();

    // Demo: auto-succeed payment for local assessment (Flutter expects initiate to succeed)
    if (process.env.MPESA_AUTO_SUCCESS !== "false") {
      payment.status = "success";
      payment.mpesa_reference = `DEMO-${Date.now()}`;
      // Django callback sets is_paid + in_progress; for demo do the same when already accepted,
      // otherwise only mark paid so accept → mark_paid flow still works.
      job.is_paid = true;
      if (job.status === "accepted") {
        job.status = "in_progress";
        if (job.provider_id) {
          const p = this.getProviderByUser(job.provider_id);
          if (p) p.current_status = "busy";
        }
      }
      job.updated_at = now();
    }
    return {
      id: payment.id,
      job: payment.job_id,
      provider: payment.provider_id,
      amount: payment.amount,
      currency: payment.currency,
      mpesa_reference: payment.mpesa_reference,
      status: payment.status,
      created_at: payment.created_at,
      updated_at: payment.updated_at,
      checkout_request_id: payment.checkout_request_id,
      merchant_request_id: payment.merchant_request_id,
      phone_number: payment.phone_number,
      result_code: payment.result_code,
      result_desc: payment.result_desc,
    };
  }

  paymentCallback(input: {
    job_id: number;
    result_code: string;
    mpesa_reference?: string;
  }) {
    const job = this.getJob(input.job_id);
    let payment = [...this.payments.values()].find((p) => p.job_id === input.job_id);
    if (!payment) {
      payment = {
        id: this.seq.payment++,
        job_id: input.job_id,
        provider_id: job.provider_id || "",
        amount: 50,
        currency: "KES",
        mpesa_reference: "",
        status: "pending",
        ...PAYMENT_DEFAULTS,
        created_at: now(),
        updated_at: now(),
      };
      this.payments.set(payment.id, payment);
    }
    if (String(input.result_code) === "0") {
      payment.status = "success";
      payment.mpesa_reference = input.mpesa_reference || payment.mpesa_reference;
      // Django callback: is_paid + status in_progress
      job.is_paid = true;
      job.status = "in_progress";
      if (job.provider_id) {
        const p = this.getProviderByUser(job.provider_id);
        if (p) p.current_status = "busy";
      }
      job.updated_at = now();
    } else {
      payment.status = "failed";
    }
    payment.updated_at = now();
    return { detail: "Callback processed." };
  }

  listPayments() {
    return [...this.payments.values()].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  }

  queryPayment(jobId: number, customerId: string) {
    const job = this.getJob(jobId);
    if (job.customer_id !== customerId) throw Object.assign(new Error("Not your job"), { status: 403 });
    const payment = [...this.payments.values()].find((item) => item.job_id === jobId);
    if (payment?.status === "pending" && process.env.MPESA_AUTO_SUCCESS !== "false") {
      payment.status = "success";
      payment.mpesa_reference ||= `DEMO-${Date.now()}`;
      job.is_paid = true;
      job.updated_at = now();
    }
    return {
      status: payment?.status ?? "initiated",
      result_code: payment?.result_code ?? "",
      result_desc: payment?.result_desc ?? "",
      is_paid: job.is_paid,
      raw: null,
    };
  }

  initiateDiscoveryPayment(customerId: string, data: { phone_number: string; amount?: number; category_id?: number; lat?: number; lng?: number; query?: string; provider_count?: number }) {
    const createdAt = now();
    const feeEnabled = process.env.CONNECTION_FEE_ENABLED === "true";
    if (!feeEnabled) {
      const payment: DiscoveryPayment = {
        id: this.seq.discovery++,
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
        consumed_at: null,
        consumed_job_id: null,
        created_at: createdAt,
        updated_at: createdAt,
      };
      this.discoveryPayments.set(payment.id, payment);
      return {
        ...payment,
        customer: customerId,
        is_paid: true,
        fee_enabled: false,
        customer_message: "Connection fee is currently waived.",
      };
    }
    const amount = Math.max(50, data.amount ?? 50);
    const payment: DiscoveryPayment = {
      id: this.seq.discovery++, customer_id: customerId, amount, currency: "KES",
      phone_number: data.phone_number, category_id: data.category_id ?? null, lat: data.lat ?? null, lng: data.lng ?? null,
      query: data.query ?? "", provider_count: data.provider_count ?? 0, checkout_request_id: "", merchant_request_id: "",
      mpesa_reference: "", result_code: "", result_desc: "", status: "pending", consumed_at: null, consumed_job_id: null,
      created_at: createdAt, updated_at: createdAt,
    };
    if (process.env.MPESA_AUTO_SUCCESS !== "false") {
      payment.status = "success"; payment.mpesa_reference = `DEMO-${Date.now()}`; payment.result_code = "0";
    }
    this.discoveryPayments.set(payment.id, payment);
    return {
      ...payment,
      customer: customerId,
      is_paid: payment.status === "success",
      fee_enabled: true,
      customer_message: payment.status === "success" ? "Payment recorded." : "STK push sent.",
    };
  }

  getDiscoveryPayment(id: number, customerId: string) {
    const payment = this.discoveryPayments.get(id);
    if (!payment || payment.customer_id !== customerId) throw Object.assign(new Error("Discovery payment not found"), { status: 404 });
    if (payment.status === "pending" && process.env.MPESA_AUTO_SUCCESS !== "false") {
      payment.status = "success"; payment.mpesa_reference = `DEMO-${Date.now()}`; payment.result_code = "0"; payment.updated_at = now();
    }
    return { ...payment, customer: customerId, is_paid: payment.status === "success" };
  }

  consumeDiscoveryPayment(id: number, customerId: string, jobId: number) {
    const payment = this.discoveryPayments.get(id);
    if (!payment || payment.customer_id !== customerId || payment.status !== "success" || payment.consumed_at) return false;
    payment.consumed_at = now(); payment.consumed_job_id = jobId; payment.updated_at = payment.consumed_at;
    return true;
  }

  autocompleteServices(q: string) {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return [...new Set([
      ...this.categories.map((item) => item.name),
      ...[...this.providers.values()].flatMap((item) => {
        const user = this.profiles.get(item.user_id);
        return [item.bio, user?.username || ""];
      }),
    ].filter((item) => item.toLowerCase().includes(needle)))].slice(0, 10);
  }

  listLiveProviders(staleAfterMin = 10) {
    const generated_at = now();
    const staleMs = staleAfterMin * 60_000;
    const providers = [...this.providers.values()].flatMap((provider) => {
      const user = this.profiles.get(provider.user_id);
      const active = [...this.jobs.values()].find((job) => job.provider_id === provider.user_id && ["accepted", "in_progress"].includes(job.status));
      const trail = active ? this.locations.filter((item) => item.job_id === active.id).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0] : null;
      const seen = trail?.recorded_at ?? provider.last_seen_at;
      const lat = trail?.lat ?? provider.current_lat ?? provider.base_lat;
      const lng = trail?.lng ?? provider.current_lng ?? provider.base_lng;
      if (!seen || Date.now() - new Date(seen).getTime() > staleMs || lat == null || lng == null) return [];
      return [{ provider_id: provider.id, profile_id: provider.id, name: user?.full_name || user?.username || "", username: user?.username || "", category: this.categories.find((item) => item.id === provider.category_id)?.name || null, status: provider.current_status, tier: provider.tier, rating_avg: provider.rating_avg, verified: provider.verified, lat, lng, last_seen: seen, minutes_since_seen: Math.max(0, Math.round((Date.now() - new Date(seen).getTime()) / 60000 * 10) / 10), location_source: trail ? "job_trail" : isFresh(provider.last_seen_at, staleMs) ? "heartbeat" : "base", active_job: active ? { id: active.id, status: active.status } : null }];
    });
    return { generated_at, count: providers.length, stale_after_min: staleAfterMin, excluded_stale: this.providers.size - providers.length, providers };
  }

  getAppConfig() {
    return { connection_fee_enabled: process.env.CONNECTION_FEE_ENABLED === "true", connection_fee_kes: Number(process.env.CONNECTION_FEE_KES || 50), geofence_default_radius_km: 10, geofence_max_radius_km: 30, arrival_notification_meters: 500, provider_response_timeout_min: 5 };
  }

  listMyAds(userId: string) {
    return [...this.ads.values()].filter((a) => a.sponsor_id === userId);
  }

  listAllAds() {
    return [...this.ads.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  getAd(id: number) {
    return this.ads.get(id);
  }

  deleteAd(id: number) {
    return this.ads.delete(id);
  }

  listPublicAds(filters: { category?: string; country?: string; city?: string }) {
    return [...this.ads.values()]
      .filter((a) => a.status === "active")
      .filter((a) => !filters.category || a.category.toLowerCase() === filters.category.toLowerCase())
      .filter(
        (a) =>
          !filters.country ||
          a.target_country.toLowerCase() === filters.country.toLowerCase(),
      )
      .filter(
        (a) => !filters.city || a.target_city.toLowerCase() === filters.city.toLowerCase(),
      )
      .map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        category: a.category,
        store_lat: a.store_lat,
        store_lng: a.store_lng,
      }));
  }

  createAd(userId: string, data: Partial<AdPlacement>) {
    const ad: AdPlacement = {
      id: this.seq.ad++,
      sponsor_id: userId,
      title: data.title || "",
      description: data.description || "",
      category: data.category || "",
      target_country: data.target_country || "",
      target_city: data.target_city || "",
      store_lat: data.store_lat ?? null,
      store_lng: data.store_lng ?? null,
      status: "pending_review",
      amount_paid: data.amount_paid ?? 0,
      starts_at: data.starts_at ?? null,
      ends_at: data.ends_at ?? null,
      created_at: now(),
    };
    this.ads.set(ad.id, ad);
    return ad;
  }

  updateAd(id: number, userId: string | null, data: Partial<AdPlacement>, isAdmin = false) {
    const ad = this.ads.get(id);
    if (!ad) throw Object.assign(new Error("Ad not found"), { status: 404 });
    if (!isAdmin && ad.sponsor_id !== userId) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    Object.assign(ad, data);
    if (!isAdmin) ad.status = ad.status; // sponsors can't self-activate unless admin path
    return ad;
  }

  setProviderAdmin(
    providerId: number,
    patch: Partial<Pick<ServiceProviderProfile, "verified" | "is_suspended" | "suspended_reason" | "current_status">>,
  ) {
    const p = this.providers.get(providerId);
    if (!p) throw Object.assign(new Error("Provider not found"), { status: 404 });
    Object.assign(p, patch);
    return this.providerAnalytics(providerId);
  }

  matchProviders(lat: number, lng: number, opts?: { categoryId?: number; category?: string | number; categoryName?: string; description?: string; pricePreference?: string; urgency?: string; budgetMin?: number; budgetMax?: number; radiusKm?: number; priority?: string } | number, legacyDescription?: string) {
    const input = typeof opts === "number" ? { categoryId: opts, description: legacyDescription } : opts;
    const category = this.inferCategory({
      categoryId: input?.categoryId,
      category: input?.category,
      categoryName: input?.categoryName,
      description: input?.description,
    });
    const desc = (input?.description || "").toLowerCase();
    const nearby = this.nearbyProviders(lat, lng, category ? String(category.id) : undefined);
    const options = nearby
      .map((p) => {
        let score = (5 - Math.min(p.distance_km, 20) / 4) + p.rating_avg;
        if (p.tier === "platinum") score += 2;
        if (p.tier === "gold") score += 1.5;
        if (p.tier === "silver") score += 1;
        if (desc && String(p.category).toLowerCase().includes(desc.split(" ")[0] || "")) score += 1;
        if (desc && p.bio.toLowerCase().includes(desc.slice(0, 12))) score += 0.5;
        if (input?.budgetMax != null && p.price_min <= input.budgetMax) score += 1;
        const predicted = Math.round((p.price_min + p.price_max) / 2 + p.distance_km * 25);
        return { score: Math.round(score * 100) / 100, id: p.id, user_id: p.id, user_name: p.user_name, category: p.category, category_name: this.categories.find((item) => item.id === p.category)?.name ?? null, tier: p.tier, rating_avg: p.rating_avg, rating_count: p.rating_count, total_jobs_completed: p.total_jobs_completed, current_status: p.current_status, distance_km: p.distance_km, location_source: p.location_source, last_seen_at: p.last_seen_at, price_min: p.price_min, price_max: p.price_max, predicted_price: predicted, price_prediction_confidence: p.rating_count >= 10 ? "High" : "Medium", ai_reason: `Nearest-ranked ${p.tier} provider${input?.urgency ? ` for ${input.urgency} request` : ""} (${p.distance_km} km from job pin).` };
      })
      .sort((a, b) => b.score - a.score);
    return {
      category: category?.id ?? null,
      category_name: category?.name ?? null,
      options,
      message: options.length
        ? null
        : "No verified providers are currently available near this pin. Providers must be verified and set to Available.",
      budget_fit: input?.budgetMax == null ? null : options.some((item) => item.price_min <= input.budgetMax!),
      client_budget_min: input?.budgetMin ?? null,
      client_budget_max: input?.budgetMax ?? null,
      priority: input?.priority ?? input?.urgency ?? null,
      radius_km: null,
      ranking: "nearest_to_pin",
    };
  }

  feedbackSummary(providerId: number) {
    const provider = this.providers.get(providerId);
    if (!provider) throw Object.assign(new Error("Provider not found"), { status: 404 });
    const reviews = [...this.ratings.values()].filter((r) => r.provider_id === provider.user_id);
    const comments = reviews.map((r) => r.comment).filter(Boolean);
    const summary =
      comments.length === 0
        ? "No customer reviews yet."
        : `Customers highlight reliability and service quality. Average score ${provider.rating_avg}/5 across ${reviews.length} reviews. Themes: ${comments.slice(0, 3).join("; ") || "general satisfaction"}.`;
    return {
      provider_id: providerId,
      review_count: reviews.length,
      summary,
    };
  }

  getJobByAccessToken(token: string, otp: string) {
    const job = [...this.jobs.values()].find(
      (item) => item.provider_access_token === token && item.provider_access_otp === otp,
    );
    if (!job) throw Object.assign(new Error("Invalid session token or OTP"), { status: 404 });
    return this.serializeJob(job);
  }

  expirePendingJobs(timeoutMin = 5) {
    const cutoff = Date.now() - timeoutMin * 60_000;
    const expired = [];
    for (const job of this.jobs.values()) {
      if (job.status !== "pending_provider" || !job.pending_since) continue;
      if (new Date(job.pending_since).getTime() >= cutoff) continue;
      const fallback = [...this.providers.values()].find(
        (provider) =>
          provider.user_id !== job.provider_id &&
          provider.verified &&
          !provider.is_suspended &&
          provider.current_status === "available" &&
          provider.category_id === job.category_id,
      );
      job.status = "cancelled";
      job.expired_at = now();
      job.fallback_provider_id = fallback?.id ?? null;
      job.updated_at = job.expired_at;
      expired.push({ job_id: job.id, fallback_provider_id: job.fallback_provider_id });
    }
    return { expired, count: expired.length };
  }

  predictPrice(input: {
    lat: number;
    lng: number;
    categoryId?: number;
    category?: string | number;
    categoryName?: string;
    pricePreference?: string;
  }) {
    const category = input.categoryId
      ? this.resolveCategory(input.categoryId)
      : input.category || input.categoryName
        ? this.resolveCategory(input.category ?? input.categoryName!)
        : null;
    if (!category) {
      return {
        predicted_price: null,
        confidence: "Low",
        reason: "No matching service category was found.",
      };
    }
    const providers = [...this.providers.values()].filter(
      (p) =>
        p.category_id === category.id &&
        p.verified &&
        !p.is_suspended &&
        p.current_status !== "offline" &&
        (p.base_lat != null || p.current_lat != null),
    );
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
      const mid = (p.price_min + p.price_max) / 2;
      const base = pref === "budget" ? p.price_min * 1.08 : pref === "premium" ? mid * 1.25 : mid;
      const predicted = Math.max(p.price_min, Math.min(base + Math.min(distance * 35, 700), p.price_max));
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

  getCurrentTerms(audience: "all" | "customer" | "provider" = "all") {
    const match = this.termsVersions
      .filter((t) => t.is_current && (t.audience === "all" || t.audience === audience))
      .sort((a, b) => b.published_at.localeCompare(a.published_at))[0];
    return match ?? null;
  }

  acceptTerms(userId: string, role: string, versionId?: number, clientMeta: Record<string, unknown> = {}) {
    const terms = versionId
      ? this.termsVersions.find((t) => t.id === versionId)
      : this.getCurrentTerms(role === "provider" ? "provider" : role === "customer" ? "customer" : "all");
    if (!terms) throw Object.assign(new Error("No current terms version found"), { status: 404 });
    let acceptance = this.termsAcceptances.find(
      (a) => a.user_id === userId && a.terms_version_id === terms.id,
    );
    if (!acceptance) {
      acceptance = {
        id: this.seq.acceptance++,
        user_id: userId,
        terms_version_id: terms.id,
        role,
        accepted_at: now(),
        client_meta: clientMeta,
      };
      this.termsAcceptances.push(acceptance);
    } else {
      acceptance.accepted_at = now();
      acceptance.client_meta = clientMeta;
      acceptance.role = role;
    }
    if (role === "provider") {
      const p = this.getProviderByUser(userId);
      if (p) p.terms_accepted_at = acceptance.accepted_at;
    }
    return { acceptance, terms };
  }

  createComplaint(input: {
    reporter_id: string;
    reporter_role: string;
    job_id?: number | null;
    against_user_id?: string | null;
    category?: string;
    body: string;
  }) {
    if (!(input.body || "").trim()) {
      throw Object.assign(new Error("Complaint body is required"), { status: 400 });
    }
    const row: Complaint = {
      id: this.seq.complaint++,
      reporter_id: input.reporter_id,
      reporter_role: input.reporter_role as Complaint["reporter_role"],
      job_id: input.job_id ?? null,
      against_user_id: input.against_user_id ?? null,
      category: input.category || "general",
      body: input.body.trim(),
      status: "open",
      resolution_notes: "",
      resolved_at: null,
      resolved_by: null,
      created_at: now(),
      updated_at: now(),
    };
    this.complaints.push(row);
    return row;
  }

  listComplaints(user: Profile) {
    if (user.role === "admin" || user.role === "operations") {
      return [...this.complaints].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return this.complaints
      .filter((c) => c.reporter_id === user.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  updateComplaint(id: number, patch: { status?: string; resolution_notes?: string }, adminUserId: string) {
    const row = this.complaints.find((c) => c.id === id);
    if (!row) throw Object.assign(new Error("Complaint not found"), { status: 404 });
    if (patch.status) row.status = patch.status as Complaint["status"];
    if (patch.resolution_notes != null) row.resolution_notes = patch.resolution_notes;
    if (patch.status === "resolved" || patch.status === "dismissed") {
      row.resolved_at = now();
      row.resolved_by = adminUserId;
    }
    row.updated_at = now();
    return row;
  }

  spellAssist(text: string) {
    const dictionary: Record<string, string> = {
      plumbering: "plumbing",
      plumming: "plumbing",
      electical: "electrical",
      electrition: "electrician",
      cleaninig: "cleaning",
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
    return { original, corrected, changed: corrected !== original, suggestions };
  }
}

const globalForStore = globalThis as unknown as { __slinkStore?: MemoryStore };

export const memoryStore = globalForStore.__slinkStore ?? new MemoryStore();
if (process.env.NODE_ENV !== "production") {
  globalForStore.__slinkStore = memoryStore;
}
