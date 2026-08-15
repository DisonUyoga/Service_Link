import { handleApiError, json } from "@/lib/api";
import { db } from "@/lib/store";

export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get("q") || "";
    return json(await db.autocompleteServices(q));
  } catch (e) {
    return handleApiError(e);
  }
}
