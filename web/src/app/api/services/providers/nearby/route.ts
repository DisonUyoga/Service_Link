import { detail, handleApiError, json } from "@/lib/api";
import { db } from "@/lib/store";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    if (lat == null || lng == null) {
      return detail("lat and lng are required", 400);
    }
    const category = searchParams.get("category") || undefined;
    const results = await db.nearbyProviders(Number(lat), Number(lng), category);
    return json(results);
  } catch (e) {
    return handleApiError(e);
  }
}
