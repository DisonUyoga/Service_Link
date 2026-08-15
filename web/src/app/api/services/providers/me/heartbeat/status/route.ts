import { handleApiError, json } from "@/lib/api";
import { requireRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/store";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    requireRole(user, ["provider"]);
    return json(await db.providerHeartbeatStatus(user.id));
  } catch (e) {
    return handleApiError(e);
  }
}
