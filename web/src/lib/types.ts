export type Role = "customer" | "provider" | "admin" | "operations";
export type ProviderTier = "bronze" | "silver" | "gold" | "platinum";
export type ProviderStatus = "available" | "busy" | "offline";
export type JobStatus =
  | "pending_provider"
  | "accepted"
  | "in_progress"
  | "completed"
  | "cancelled";
export type PaymentStatus = "initiated" | "pending" | "success" | "failed";
export type DiscoveryPaymentStatus = "pending" | "success" | "failed" | "expired";
export type AdStatus = "pending_review" | "active" | "paused";
export type ProviderDocumentType = "national_id_or_passport" | "good_conduct" | "other";
export type ProviderDocumentReviewStatus = "pending" | "approved" | "rejected";
export type ComplaintStatus = "open" | "in_review" | "resolved" | "dismissed";

export interface Profile {
  id: string;
  username: string;
  email: string;
  role: Role;
  full_name: string;
  phone: string;
  password_hash?: string;
  firebase_uid?: string;
  created_at: string;
}

export interface ServiceCategory {
  id: number;
  name: string;
  icon: string;
}

export interface ServiceProviderProfile {
  id: number;
  user_id: string;
  category_id: number | null;
  bio: string;
  base_lat: number | null;
  base_lng: number | null;
  current_lat: number | null;
  current_lng: number | null;
  last_seen_at: string | null;
  service_radius_km: number;
  tier: ProviderTier;
  rating_avg: number;
  rating_count: number;
  total_jobs_completed: number;
  verified: boolean;
  is_suspended: boolean;
  suspended_reason: string;
  current_status: ProviderStatus;
  mpesa_till_or_paybill: string;
  price_min: number;
  price_max: number;
  average_response_minutes: number;
  next_available_at: string | null;
  id_document_number: string;
  id_document_kind: string;
  area_place_id: string;
  area_formatted_address: string;
  profile_complete: boolean;
  terms_accepted_at: string | null;
}

export interface JobRequest {
  id: number;
  customer_id: string;
  provider_id: string | null;
  category_id: number;
  description: string;
  location_lat: number;
  location_lng: number;
  address_text: string;
  recipient_name: string;
  recipient_phone: string;
  access_notes: string;
  place_id: string;
  formatted_address: string;
  status: JobStatus;
  is_paid: boolean;
  provider_access_otp: string;
  provider_access_token: string;
  ai_match_reason: string;
  client_price_preference: string;
  quoted_price: number | null;
  requested_radius_km: number | null;
  pending_since: string | null;
  request_sms_sent_at: string | null;
  arrival_sms_sent_at: string | null;
  expired_at: string | null;
  fallback_provider_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderLocation {
  id: number;
  provider_id: string;
  job_id: number;
  lat: number;
  lng: number;
  recorded_at: string;
}

export interface Rating {
  id: number;
  job_id: number;
  customer_id: string;
  provider_id: string;
  score: number;
  comment: string;
  created_at: string;
}

export interface Payment {
  id: number;
  job_id: number;
  provider_id: string;
  amount: number;
  currency: string;
  mpesa_reference: string;
  checkout_request_id: string;
  merchant_request_id: string;
  phone_number: string;
  result_code: string;
  result_desc: string;
  status: PaymentStatus;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryPayment {
  id: number;
  customer_id: string;
  amount: number;
  currency: string;
  phone_number: string;
  category_id: number | null;
  lat: number | null;
  lng: number | null;
  query: string;
  provider_count: number;
  checkout_request_id: string;
  merchant_request_id: string;
  mpesa_reference: string;
  result_code: string;
  result_desc: string;
  status: DiscoveryPaymentStatus;
  consumed_at: string | null;
  consumed_job_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface AdPlacement {
  id: number;
  sponsor_id: string;
  title: string;
  description: string;
  category: string;
  target_country: string;
  target_city: string;
  store_lat: number | null;
  store_lng: number | null;
  status: AdStatus;
  amount_paid: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface LegalDocument {
  id: number;
  profile_id: number;
  title: string;
  file: string;
  document_type: ProviderDocumentType;
  review_status: ProviderDocumentReviewStatus;
  review_notes: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  uploaded_at: string;
}

export interface TermsVersion {
  id: number;
  version: string;
  title: string;
  body: string;
  audience: "all" | "customer" | "provider";
  published_at: string;
  is_current: boolean;
}

export interface TermsAcceptance {
  id: number;
  user_id: string;
  terms_version_id: number;
  role: string;
  accepted_at: string;
  client_meta: Record<string, unknown>;
}

export interface Complaint {
  id: number;
  reporter_id: string;
  reporter_role: Role;
  job_id: number | null;
  against_user_id: string | null;
  category: string;
  body: string;
  status: ComplaintStatus;
  resolution_notes: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: Role;
  full_name?: string;
  name?: string;
}

/** Shared defaults for new provider rows (memory + seed). */
export const PROVIDER_DEFAULTS = {
  current_lat: null as number | null,
  current_lng: null as number | null,
  last_seen_at: null as string | null,
  price_min: 500,
  price_max: 2500,
  average_response_minutes: 15,
  next_available_at: null as string | null,
  id_document_number: "",
  id_document_kind: "",
  area_place_id: "",
  area_formatted_address: "",
  profile_complete: false,
  terms_accepted_at: null as string | null,
};

export const JOB_DEFAULTS = {
  provider_access_otp: "",
  provider_access_token: "",
  ai_match_reason: "",
  client_price_preference: "",
  quoted_price: null as number | null,
  requested_radius_km: null as number | null,
  pending_since: null as string | null,
  request_sms_sent_at: null as string | null,
  arrival_sms_sent_at: null as string | null,
  expired_at: null as string | null,
  fallback_provider_id: null as number | null,
  recipient_name: "",
  recipient_phone: "",
  access_notes: "",
  place_id: "",
  formatted_address: "",
};

export const LEGAL_DOCUMENT_DEFAULTS = {
  document_type: "other" as ProviderDocumentType,
  review_status: "pending" as ProviderDocumentReviewStatus,
  review_notes: "",
  reviewed_at: null as string | null,
  reviewed_by: null as string | null,
};

export const PAYMENT_DEFAULTS = {
  checkout_request_id: "",
  merchant_request_id: "",
  phone_number: "",
  result_code: "",
  result_desc: "",
};
