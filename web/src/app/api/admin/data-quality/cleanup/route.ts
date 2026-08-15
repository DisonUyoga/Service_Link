import { handleApiError, json } from "@/lib/api";
import { requireAdmin, requireUser } from "@/lib/auth";
import {
  auditOutsideKenyaProviders,
  backupOutsideKenyaRows,
  deleteOutsideKenyaProvider,
} from "@/lib/admin/kenya-cleanup";

export async function POST(req: Request) {
  try {
    requireAdmin(await requireUser(req));
    const body = (await req.json().catch(() => ({}))) as { confirm?: boolean };
    if (!body.confirm) {
      return json({ detail: "Pass { confirm: true } to delete outside-Kenya providers." }, 400);
    }

    const audit = await auditOutsideKenyaProviders();
    const backup = await backupOutsideKenyaRows(audit.candidates);

    let deleted = 0;
    for (const candidate of audit.candidates) {
      await deleteOutsideKenyaProvider(candidate);
      deleted += 1;
    }

    return json({
      ...audit.summary,
      deleted_count: deleted,
      backup,
      candidates: audit.candidates,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
