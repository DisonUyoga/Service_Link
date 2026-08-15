import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { db } from "@/lib/store";

const schema = z.object({
  text: z.string().default(""),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await readJson(req));
    return json(db.spellAssist(body.text));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function GET(req: Request) {
  try {
    const text = new URL(req.url).searchParams.get("text") || "";
    return json(db.spellAssist(text));
  } catch (e) {
    return handleApiError(e);
  }
}
