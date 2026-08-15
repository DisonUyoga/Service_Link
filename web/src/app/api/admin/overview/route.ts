import { handleApiError, json } from "@/lib/api";
import { requireUser, requireRole } from "@/lib/auth";
import { db } from "@/lib/store";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    requireRole(user, ["admin"]);
    return json({
      jobs: await db.listJobs(user),
      payments: await db.listPayments(),
      providers: await db.listAdminProviders(),
      ads: await db.listAllAds(),
      categories: await db.listCategories(),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
