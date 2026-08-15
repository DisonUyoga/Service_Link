import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/store";

const schema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  status: z.enum(["available", "busy", "offline"]).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    requireRole(user, ["provider"]);
    const body = schema.parse(await readJson(req));
    return json(await db.providerHeartbeat(user.id, body));
  } catch (e) {
    return handleApiError(e);
  }
}
