import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireUser, requireRole } from "@/lib/auth";
import { db } from "@/lib/store";

const schema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req);
    requireRole(user, ["provider"]);
    const { id } = await ctx.params;
    const body = schema.parse(await readJson(req));
    return json(await db.updateLocation(Number(id), user.id, body.lat, body.lng));
  } catch (e) {
    return handleApiError(e);
  }
}
