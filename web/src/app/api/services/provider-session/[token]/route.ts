import { handleApiError, json } from "@/lib/api";
import { db } from "@/lib/store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const otp = new URL(req.url).searchParams.get("otp") || "";
    return json(await db.getJobByAccessToken(token, otp));
  } catch (e) {
    return handleApiError(e);
  }
}
