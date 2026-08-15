import { handleApiError, json } from "@/lib/api";
import { requireUser, requireOperationsAccess } from "@/lib/auth";
import { db } from "@/lib/store";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    requireOperationsAccess(user);
    return json({
      jobs: await db.listJobs(user),
      payments: await db.listPayments(),
      providers: await db.listAdminProviders(),
      ads: user.role === "admin" ? await db.listAllAds() : [],
      categories: await db.listCategories(),
      role: user.role,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
