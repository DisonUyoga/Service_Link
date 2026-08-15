import { handleApiError, json, detail } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/store";
import { z } from "zod";
import { readJson } from "@/lib/api";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const ad = await db.getAd(Number(id));
    if (!ad) return detail("Not found", 404);
    if (user.role !== "admin" && ad.sponsor_id !== user.id) return detail("Forbidden", 403);
    return json(ad);
  } catch (e) {
    return handleApiError(e);
  }
}

const patchSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(["pending_review", "active", "paused"]).optional(),
  target_country: z.string().optional(),
  target_city: z.string().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const body = patchSchema.parse(await readJson(req));
    const isAdmin = user.role === "admin";
    if (!isAdmin && body.status === "active") {
      return detail("Only admin can activate ads", 403);
    }
    return json(await db.updateAd(Number(id), user.id, body, isAdmin));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const ad = await db.getAd(Number(id));
    if (!ad) return detail("Not found", 404);
    if (user.role !== "admin" && ad.sponsor_id !== user.id) {
      return detail("Forbidden", 403);
    }
    await db.deleteAd(Number(id));
    return json({ detail: "Deleted" });
  } catch (e) {
    return handleApiError(e);
  }
}
