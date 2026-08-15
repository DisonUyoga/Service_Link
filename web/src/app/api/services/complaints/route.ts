import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireUser, requireRole } from "@/lib/auth";
import { db } from "@/lib/store";

const createSchema = z.object({
  job_id: z.coerce.number().optional().nullable(),
  against_user_id: z.string().optional().nullable(),
  category: z.string().default("general"),
  body: z.string().min(3),
});

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return json(await db.listComplaints(user));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = createSchema.parse(await readJson(req));
    const row = await db.createComplaint({
      reporter_id: user.id,
      reporter_role: user.role,
      job_id: body.job_id,
      against_user_id: body.against_user_id,
      category: body.category,
      body: body.body,
    });
    return json(row, 201);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser(req);
    requireRole(user, ["admin"]);
    const body = z
      .object({
        id: z.coerce.number(),
        status: z.enum(["open", "in_review", "resolved", "dismissed"]).optional(),
        resolution_notes: z.string().optional(),
      })
      .parse(await readJson(req));
    return json(await db.updateComplaint(body.id, body, user.id));
  } catch (e) {
    return handleApiError(e);
  }
}
