import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/store";

const createSchema = z.object({
  job: z.coerce.number(),
  score: z.coerce.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    await requireUser(req);
    return json(await db.listRatings());
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = createSchema.parse(await readJson(req));
    const rating = await db.createRating(user.id, body);
    return json(rating, 201);
  } catch (e) {
    return handleApiError(e);
  }
}
