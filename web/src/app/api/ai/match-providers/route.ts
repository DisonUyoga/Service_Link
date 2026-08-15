import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { db } from "@/lib/store";
import { rankProvidersWithGemini } from "@/lib/ai/provider-ranking";

const schema = z.object({
  description: z.string().optional(),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  category: z.coerce.number().optional(),
  category_id: z.coerce.number().optional(),
  category_name: z.string().optional(),
  price_preference: z.string().optional(),
  urgency: z.string().optional(),
  budget_min: z.coerce.number().optional(),
  budget_max: z.coerce.number().optional(),
  budget_amount: z.coerce.number().optional(),
  priority: z.string().optional(),
  radius_km: z.coerce.number().optional(),
  exclude_user_ids: z.array(z.coerce.number()).optional(),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await readJson(req));
    const match = await db.matchProviders(body.lat, body.lng, {
      categoryId: body.category_id ?? body.category,
      category: body.category,
      categoryName: body.category_name,
      description: body.description,
      pricePreference: body.price_preference,
      urgency: body.urgency,
      budgetMin: body.budget_min,
      budgetMax: body.budget_max ?? body.budget_amount,
      radiusKm: body.radius_km,
      priority: body.priority,
    });
    const ranking = await rankProvidersWithGemini(body.description || "", match.options || []);
    const optionById = new Map((match.options || []).map((option: { id: number }) => [option.id, option]));
    return json({
      ...match,
      options: ranking.orderedIds
        .map((id) => optionById.get(id))
        .filter(Boolean),
      ai_ranking_reason: ranking.reason,
      ai_ranking_used: ranking.usedAi,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
