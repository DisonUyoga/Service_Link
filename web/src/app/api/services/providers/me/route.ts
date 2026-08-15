import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireUser, requireRole } from "@/lib/auth";
import { db } from "@/lib/store";

const schema = z.object({
  category_id: z.coerce.number().optional(),
  bio: z.string().optional(),
  base_lat: z.coerce.number().optional(),
  base_lng: z.coerce.number().optional(),
  service_radius_km: z.coerce.number().optional(),
  mpesa_till_or_paybill: z.string().optional(),
  current_status: z.enum(["available", "busy", "offline"]).optional(),
  price_min: z.coerce.number().optional(),
  price_max: z.coerce.number().optional(),
  average_response_minutes: z.coerce.number().optional(),
  id_document_number: z.string().optional(),
  id_document_kind: z.string().optional(),
  area_place_id: z.string().optional(),
  area_formatted_address: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    requireRole(user, ["provider"]);
    const me = await db.upsertProviderMe(user.id, {});
    const docs = await db.listProviderDocuments(me.id);
    return json({ ...me, documents: docs });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser(req);
    requireRole(user, ["provider"]);
    const body = schema.parse(await readJson(req));
    // Do NOT auto-verify — admin reviews KYC documents first.
    await db.upsertProviderMe(user.id, {
      ...body,
      current_status: body.current_status || "available",
    });
    const me = await db.upsertProviderMe(user.id, {});
    const docs = await db.listProviderDocuments(me.id);
    return json({ ...me, documents: docs, awaiting_admin_review: !me.verified });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: Request) {
  return PUT(req);
}
