import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";

const emailSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  role: z.enum(["admin", "operations"]).default("admin"),
});

const removeSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
});

export async function GET(req: Request) {
  try {
    await requireAdmin(await requireUser(req));
    const { data, error } = await createServiceClient()
      .from("admin_allowlist")
      .select("email, added_at, role")
      .order("added_at", { ascending: true });
    if (error) throw error;
    return json(
      (data ?? []).map((row) => ({
        email: row.email,
        added_at: row.added_at,
        role: row.role === "operations" ? "operations" : "admin",
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    requireAdmin(user);
    const { email, role } = emailSchema.parse(await readJson(req));
    const { data, error } = await createServiceClient()
      .from("admin_allowlist")
      .upsert({ email, role, added_by: user.id }, { onConflict: "email" })
      .select("email, added_at, role")
      .single();
    if (error) throw error;
    return json(
      {
        email: data.email,
        added_at: data.added_at,
        role: data.role === "operations" ? "operations" : "admin",
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin(await requireUser(req));
    const { email } = removeSchema.parse(await readJson(req));
    const normalized = email.toLowerCase();
    const { data: all, error: listError } = await createServiceClient()
      .from("admin_allowlist")
      .select("email, role");
    if (listError) throw listError;
    const admins = (all ?? []).filter((row) => row.role !== "operations");
    if (admins.length <= 1 && admins[0]?.email === normalized) {
      return json({ detail: "Keep at least one administrator allowed." }, 400);
    }
    const { error } = await createServiceClient()
      .from("admin_allowlist")
      .delete()
      .eq("email", normalized);
    if (error) throw error;
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
