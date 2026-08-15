import { handleApiError, json } from "@/lib/api";
import { db } from "@/lib/store";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ad = await db.getAd(Number(id));
    if (!ad || ad.status !== "active") {
      return json({ detail: "Not found" }, 404);
    }
    const sponsor = await db.getProfile(ad.sponsor_id);
    return json({
      id: ad.id,
      title: ad.title,
      description: ad.description,
      category: ad.category,
      target_country: ad.target_country,
      target_city: ad.target_city,
      store_lat: ad.store_lat,
      store_lng: ad.store_lng,
      starts_at: ad.starts_at,
      ends_at: ad.ends_at,
      sponsor_name: sponsor?.full_name || sponsor?.username || "",
    });
  } catch (e) {
    return handleApiError(e);
  }
}
