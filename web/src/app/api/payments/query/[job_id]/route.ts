import { handleApiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/store";

async function query(
  req: Request,
  ctx: { params: Promise<{ job_id: string }> },
) {
  const user = await requireUser(req);
  const { job_id } = await ctx.params;
  return json(await db.queryPayment(Number(job_id), user.id));
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ job_id: string }> },
) {
  try {
    return await query(req, ctx);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ job_id: string }> },
) {
  try {
    return await query(req, ctx);
  } catch (e) {
    return handleApiError(e);
  }
}
