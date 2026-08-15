import { handleApiError, json } from "@/lib/api";
import { requireRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/store";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req);
    requireRole(user, ["provider"]);
    const { id } = await params;
    return json(await db.declineJob(Number(id), user.id));
  } catch (e) {
    return handleApiError(e);
  }
}
