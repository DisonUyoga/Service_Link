import { handleApiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    return json(await db.getDiscoveryPayment(Number(id), user.id));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return GET(req, { params });
}
