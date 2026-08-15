import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { db } from "@/lib/store";
import { env } from "@/lib/env";

const schema = z.object({
  provider_id: z.coerce.number(),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await readJson(req));
    const base = await db.feedbackSummary(body.provider_id);

    if (env.GEMINI_API_KEY) {
      try {
        const provider = await db.getProviderById(body.provider_id);
        const reviews = (await db.listRatings())
          .filter((r: { provider_id: string }) => r.provider_id === provider?.user_id)
          .map((r: { score: number; comment: string }) => `(${r.score}/5) ${r.comment}`)
          .join("\n");
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `Summarize these service provider reviews in 2 short sentences for customers:\n${reviews || "No reviews"}`,
                    },
                  ],
                },
              ],
            }),
          },
        );
        if (res.ok) {
          const data = (await res.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (summary) return json({ ...base, summary });
        }
      } catch {
        // fall through to heuristic summary
      }
    }

    return json(base);
  } catch (e) {
    return handleApiError(e);
  }
}
