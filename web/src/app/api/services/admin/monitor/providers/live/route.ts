import { handleApiError, json } from "@/lib/api";
import { db } from "@/lib/store";

/** Open like Django AllowAny for ops demos — lock down before public prod. */
export async function GET(req: Request) {
  try {
    const stale = Number(new URL(req.url).searchParams.get("stale_after") || 10);
    return json(await db.listLiveProviders(Number.isFinite(stale) ? stale : 10));
  } catch (e) {
    return handleApiError(e);
  }
}
