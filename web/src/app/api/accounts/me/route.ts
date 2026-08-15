import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { normalizeMsisdn } from "@/lib/phone";
import { db } from "@/lib/store";

function mePayload(user: {
  id: string;
  username: string;
  email: string;
  role: string;
  full_name: string;
  phone: string;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    phone: user.phone,
    phone_number: user.phone,
  };
}

const patchSchema = z.object({
  phone_number: z.string().optional(),
  phone: z.string().optional(),
  full_name: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return json(mePayload(user));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser(req);
    const body = patchSchema.parse(await readJson(req));
    const patch: { phone?: string; full_name?: string } = {};
    const rawPhone = body.phone_number ?? body.phone;
    if (rawPhone !== undefined) {
      patch.phone = rawPhone ? normalizeMsisdn(rawPhone) : "";
    }
    if (body.full_name !== undefined) {
      patch.full_name = body.full_name;
    } else if (body.first_name !== undefined || body.last_name !== undefined) {
      patch.full_name = [body.first_name, body.last_name].filter(Boolean).join(" ").trim();
    }
    const updated = await db.updateProfile(user.id, patch);
    return json(mePayload(updated));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: Request) {
  return PATCH(req);
}
