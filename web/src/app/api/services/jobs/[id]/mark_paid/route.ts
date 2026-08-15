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
    // Customer or admin can mark paid (dev / Flutter fallback)
    const job = await db.getJob(Number(id));
    if (user.role !== "admin" && user.id !== job.customer_id) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    return json(await db.markPaid(Number(id)));
  } catch (e) {
    return handleApiError(e);
  }
}
