import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { normalizeMsisdn } from "@/lib/phone";
import { db } from "@/lib/store";

const schema = z.object({
  phone_number: z.string().min(9),
  amount: z.coerce.number().optional(),
  category_id: z.coerce.number().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  query: z.string().optional(),
  provider_count: z.coerce.number().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = schema.parse(await readJson(req));
    const phone = normalizeMsisdn(body.phone_number);
    const payment = await db.initiateDiscoveryPayment(user.id, {
      ...body,
      phone_number: phone,
    });
    return json(payment, 201);
  } catch (e) {
    return handleApiError(e);
  }
}
