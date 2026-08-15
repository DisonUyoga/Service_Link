import { handleApiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/store";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    return json(await db.cancelJob(Number(id), user));
  } catch (e) {
    return handleApiError(e);
  }
}
