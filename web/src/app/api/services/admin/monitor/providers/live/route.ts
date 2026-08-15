import { handleApiError, json } from "@/lib/api";
import { requireOperationsAccess, requireUser } from "@/lib/auth";
import { db } from "@/lib/store";

/** Live provider positions for portal/ops monitoring — staff only. */
export async function GET(req: Request) {
  try {
    requireOperationsAccess(await requireUser(req));
    const stale = Number(new URL(req.url).searchParams.get("stale_after") || 10);
    return json(await db.listLiveProviders(Number.isFinite(stale) ? stale : 10));
  } catch (e) {
    return handleApiError(e);
  }
}
