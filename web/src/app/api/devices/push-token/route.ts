import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireUser, requireRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";

const schema = z.object({
  token: z.string().min(20),
  platform: z.enum(["android", "ios"]).default("android"),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    requireRole(user, ["provider"]);
    const body = schema.parse(await readJson(req));
    const client = createServiceClient();
    const { error } = await client.from("provider_device_tokens").upsert(
      {
        user_id: user.id,
        token: body.token,
        platform: body.platform,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    if (error) throw error;
    return json({ registered: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    requireRole(user, ["provider"]);
    const body = schema.parse(await readJson(req));
    const client = createServiceClient();
    const { error } = await client
      .from("provider_device_tokens")
      .delete()
      .eq("user_id", user.id)
      .eq("token", body.token);
    if (error) throw error;
    return json({ removed: true });
  } catch (error) {
    return handleApiError(error);
  }
}
