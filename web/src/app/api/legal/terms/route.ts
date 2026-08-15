import { handleApiError, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/store";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const audience = (url.searchParams.get("audience") || "all") as
      | "all"
      | "customer"
      | "provider";
    const terms = await db.getCurrentTerms(audience);
    if (!terms) return json({ detail: "No terms published" }, 404);
    return json(terms);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = (await readJson(req)) as {
      terms_version_id?: number;
      client_meta?: Record<string, unknown>;
    };
    const result = await db.acceptTerms(
      user.id,
      user.role,
      body.terms_version_id,
      body.client_meta || {},
    );
    return json(result, 201);
  } catch (e) {
    return handleApiError(e);
  }
}
