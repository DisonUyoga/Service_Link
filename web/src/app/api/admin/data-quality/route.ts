import { handleApiError, json } from "@/lib/api";
import { requireAdmin, requireUser } from "@/lib/auth";
import { auditOutsideKenyaProviders } from "@/lib/admin/kenya-cleanup";

export async function GET(req: Request) {
  try {
    requireAdmin(await requireUser(req));
    const audit = await auditOutsideKenyaProviders();
    return json({
      ...audit,
      summary: { ...audit.summary, last_deleted: null },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
