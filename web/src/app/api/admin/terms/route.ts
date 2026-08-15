import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  version: z.string().trim().min(1).max(80),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(30).max(50_000),
  audience: z.enum(["all", "customer", "provider"]).default("all"),
  publish: z.boolean().default(true),
});

async function requireTermsAdmin(req: Request) {
  const user = await requireUser(req);
  requireAdmin(user);
  return user;
}

export async function GET(req: Request) {
  try {
    await requireTermsAdmin(req);
    const { data, error } = await createServiceClient()
      .from("terms_versions")
      .select("id, version, title, body, audience, published_at, is_current")
      .order("published_at", { ascending: false });
    if (error) throw error;
    return json(data ?? []);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireTermsAdmin(req);
    const body = createSchema.parse(await readJson(req));
    const client = createServiceClient();
    if (body.publish) {
      const { error } = await client
        .from("terms_versions")
        .update({ is_current: false })
        .eq("audience", body.audience);
      if (error) throw error;
    }
    const { data, error } = await client
      .from("terms_versions")
      .insert({
        version: body.version,
        title: body.title,
        body: body.body,
        audience: body.audience,
        is_current: body.publish,
        published_at: new Date().toISOString(),
      })
      .select("id, version, title, body, audience, published_at, is_current")
      .single();
    if (error) throw error;
    return json(data, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireTermsAdmin(req);
    const body = z.object({ id: z.number().int().positive(), publish: z.literal(true) }).parse(await readJson(req));
    const client = createServiceClient();
    const { data: target, error: targetError } = await client
      .from("terms_versions")
      .select("id, audience")
      .eq("id", body.id)
      .single();
    if (targetError) throw targetError;
    const { error: unpublishError } = await client
      .from("terms_versions")
      .update({ is_current: false })
      .eq("audience", target.audience);
    if (unpublishError) throw unpublishError;
    const { data, error } = await client
      .from("terms_versions")
      .update({ is_current: true, published_at: new Date().toISOString() })
      .eq("id", body.id)
      .select("id, version, title, body, audience, published_at, is_current")
      .single();
    if (error) throw error;
    return json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
