import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { db } from "@/lib/store";

const schema = z.object({
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  category: z.coerce.number().optional(),
  category_id: z.coerce.number().optional(),
  category_name: z.string().optional(),
  price_preference: z.string().optional(),
  description: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await readJson(req));
    return json(
      await db.predictPrice({
        lat: body.lat ?? -1.286389,
        lng: body.lng ?? 36.817223,
        categoryId: body.category_id ?? body.category,
        category: body.category,
        categoryName: body.category_name,
        pricePreference: body.price_preference,
      }),
    );
  } catch (e) {
    return handleApiError(e);
  }
}
