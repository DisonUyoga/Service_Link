import { handleApiError, json } from "@/lib/api";
import { db } from "@/lib/store";

export async function GET() {
  try {
    return json(await db.getAppConfig());
  } catch (e) {
    return handleApiError(e);
  }
}
