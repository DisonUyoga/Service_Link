import { handleApiError, json } from "@/lib/api";
import { requireUser, requireRole } from "@/lib/auth";
import { db } from "@/lib/store";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req);
    requireRole(user, ["provider"]);
    const { id } = await ctx.params;
    return json(await db.completeJob(Number(id), user.id));
  } catch (e) {
    return handleApiError(e);
  }
}
