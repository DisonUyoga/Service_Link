import { handleApiError, json } from "@/lib/api";
import { requireUser, requireRole } from "@/lib/auth";
import { db } from "@/lib/store";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    requireRole(user, ["provider"]);
    return json(await db.providerAnalytics(user.id));
  } catch (e) {
    return handleApiError(e);
  }
}
