import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/store";
import { startAiDispatch } from "@/lib/dispatch";

const createSchema = z.object({
  provider: z.union([z.string(), z.number()]).optional().nullable(),
  category: z.union([z.string(), z.number()]),
  description: z.string().min(1),
  location_lat: z.coerce.number(),
  location_lng: z.coerce.number(),
  address_text: z.string().default("Customer location"),
  discovery_payment_id: z.coerce.number().optional(),
  quoted_price: z.coerce.number().optional(),
  client_price_preference: z.string().optional(),
  radius_km: z.coerce.number().optional(),
  requested_radius_km: z.coerce.number().optional(),
  ai_match_reason: z.string().optional(),
  budget_min: z.coerce.number().optional(),
  budget_max: z.coerce.number().optional(),
  client_priority: z.string().optional(),
  urgency: z.string().optional(),
  recipient_name: z.string().optional(),
  recipient_phone: z.string().optional(),
  access_notes: z.string().optional(),
  place_id: z.string().optional(),
  formatted_address: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return json(await db.listJobs(user));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = createSchema.parse(await readJson(req));
    const job = await db.createJob(user.id, {
      provider: body.provider,
      category: body.category,
      description: body.description,
      location_lat: body.location_lat,
      location_lng: body.location_lng,
      address_text: body.formatted_address || body.address_text,
      discovery_payment_id: body.discovery_payment_id,
      quoted_price: body.quoted_price,
      client_price_preference: body.client_price_preference,
      radius_km: body.radius_km ?? body.requested_radius_km,
      requested_radius_km: body.requested_radius_km ?? body.radius_km,
      ai_match_reason: body.ai_match_reason,
      recipient_name: body.recipient_name,
      recipient_phone: body.recipient_phone,
      access_notes: body.access_notes,
      place_id: body.place_id,
      formatted_address: body.formatted_address,
    });
    // The server owns dispatch: Gemini ranks only eligible candidates, then
    // rank #1 is notified. Others remain queued for the timeout broadcast.
    const candidates = await db.matchProviders(body.location_lat, body.location_lng, {
      category: body.category,
      description: body.description,
      budgetMin: body.budget_min,
      budgetMax: body.budget_max,
      priority: body.client_priority ?? body.urgency,
    });
    const dispatch = await startAiDispatch(job, candidates.options || []);
    return json({ ...job, dispatch }, 201);
  } catch (e) {
    return handleApiError(e);
  }
}
