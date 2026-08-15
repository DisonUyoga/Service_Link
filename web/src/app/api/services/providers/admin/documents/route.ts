import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireUser, requireOperationsAccess } from "@/lib/auth";
import { db } from "@/lib/store";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    requireOperationsAccess(user);
    const url = new URL(req.url);
    const profileId = Number(url.searchParams.get("profile_id") || 0);
    if (!profileId) return json({ detail: "profile_id required" }, 400);
    return json(await db.listProviderDocuments(profileId));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser(req);
    requireOperationsAccess(user);
    const body = z
      .object({
        document_id: z.coerce.number(),
        review_status: z.enum(["approved", "rejected"]),
        review_notes: z.string().optional(),
      })
      .parse(await readJson(req));
    return json(
      await db.reviewDocument(body.document_id, user.id, {
        review_status: body.review_status,
        review_notes: body.review_notes,
      }),
    );
  } catch (e) {
    return handleApiError(e);
  }
}
