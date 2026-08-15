import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireUser, requireOperationsAccess } from "@/lib/auth";
import { db } from "@/lib/store";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    requireOperationsAccess(user);
    const providerId = Number(new URL(req.url).searchParams.get("provider_id") || 0);
    if (providerId) return json(await db.getAdminProviderDetail(providerId));
    return json(await db.listAdminProviders());
  } catch (e) {
    return handleApiError(e);
  }
}

const patchSchema = z.object({
  provider_id: z.coerce.number(),
  verified: z.boolean().optional(),
  is_suspended: z.boolean().optional(),
  suspended_reason: z.string().optional(),
  current_status: z.enum(["available", "busy", "offline"]).optional(),
});

export async function PATCH(req: Request) {
  try {
    const user = await requireUser(req);
    requireOperationsAccess(user);
    const body = patchSchema.parse(await readJson(req));
    const { provider_id, ...patch } = body;
    return json(await db.setProviderAdmin(provider_id, patch));
  } catch (e) {
    return handleApiError(e);
  }
}
