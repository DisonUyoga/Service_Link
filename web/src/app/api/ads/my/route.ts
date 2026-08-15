import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/store";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  target_country: z.string().optional(),
  target_city: z.string().optional(),
  store_lat: z.coerce.number().optional().nullable(),
  store_lng: z.coerce.number().optional().nullable(),
  amount_paid: z.coerce.number().optional(),
});

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return json(await db.listMyAds(user.id));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = createSchema.parse(await readJson(req));
    return json(await db.createAd(user.id, body), 201);
  } catch (e) {
    return handleApiError(e);
  }
}
