import { handleApiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/store";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(req);
    const { id } = await ctx.params;
    return json(await db.providerAnalytics(Number(id)));
  } catch (e) {
    return handleApiError(e);
  }
}
