import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export type RankedCandidate = {
  id: number;
  distance_km: number;
  rating_avg: number;
  tier: string;
  price_min?: number;
  price_max?: number;
  score?: number;
};

const resultSchema = z.object({
  ordered_ids: z.array(z.number()),
  reason: z.string().max(300),
});

/** Gemini refines ordering of server-approved candidates; it never adds providers. */
export async function rankProvidersWithGemini(
  description: string,
  candidates: RankedCandidate[],
) {
  const fallback = [...candidates]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((candidate) => candidate.id);
  if (!env.GEMINI_API_KEY || candidates.length < 2) {
    return {
      orderedIds: fallback,
      reason: "Distance, availability and ratings ranked locally.",
      usedAi: false,
    };
  }

  try {
    const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
    const { object } = await generateObject({
      model: google("gemini-2.0-flash"),
      schema: resultSchema,
      prompt: `Rank ONLY these already eligible Kenyan service providers. Prioritize distance, rating, tier, and sensible price fit. Never invent a provider.
Job: ${description.slice(0, 2000)}
Candidates: ${JSON.stringify(candidates)}`,
    });
    const allowed = new Set(fallback);
    const valid = object.ordered_ids.filter((id) => allowed.has(id));
    return {
      orderedIds: [...valid, ...fallback.filter((id) => !valid.includes(id))],
      reason: object.reason,
      usedAi: true,
    };
  } catch (error) {
    logger.warn("ai.dispatch_ranking_fallback", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return {
      orderedIds: fallback,
      reason: "Distance, availability and ratings ranked locally.",
      usedAi: false,
    };
  }
}
