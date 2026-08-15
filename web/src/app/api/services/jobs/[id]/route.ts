import { z } from "zod";
import { detail, handleApiError, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/store";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const job = await db.getJob(Number(id));
    if (
      user.role !== "admin" &&
      user.id !== job.customer_id &&
      user.id !== job.provider_id
    ) {
      const visibleViaDispatch = await db.canProviderAccessDispatchedJob(
        Number(id),
        user.id,
      );
      if (!visibleViaDispatch) {
        return detail("Not found", 404);
      }
    }
    return json(await db.serializeJob(job));
  } catch (e) {
    return handleApiError(e);
  }
}

const patchSchema = z.object({
  description: z.string().optional(),
  address_text: z.string().optional(),
  location_lat: z.coerce.number().optional(),
  location_lng: z.coerce.number().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const job = await db.getJob(Number(id));
    if (user.id !== job.customer_id && user.role !== "admin") {
      return detail("Forbidden", 403);
    }
    const body = patchSchema.parse(await readJson(req));
    return json(await db.updateJob(Number(id), body));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return PATCH(req, ctx);
}

export async function DELETE(
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
