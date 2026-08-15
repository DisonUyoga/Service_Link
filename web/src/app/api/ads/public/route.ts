import { handleApiError, json } from "@/lib/api";
import { db } from "@/lib/store";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    return json(
      await db.listPublicAds({
        category: searchParams.get("category") || undefined,
        country: searchParams.get("country") || undefined,
        city: searchParams.get("city") || undefined,
      }),
    );
  } catch (e) {
    return handleApiError(e);
  }
}
