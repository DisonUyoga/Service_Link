import { handleApiError, json, detail } from "@/lib/api";
import { requireUser, requireRole } from "@/lib/auth";
import { db } from "@/lib/store";
import { env } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    requireRole(user, ["provider"]);
    const me = await db.upsertProviderMe(user.id, {});
    return json(await db.listProviderDocuments(me.id));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    requireRole(user, ["provider"]);
    const form = await req.formData();
    const title = String(form.get("title") || "");
    const documentType = String(form.get("document_type") || "other");
    const file = form.get("file");
    if (!title) return detail("title is required", 400);
    if (!file || typeof file === "string") return detail("file is required", 400);

    const upload = file as File;
    const safeName = upload.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "document.bin";
    const objectPath = `${user.id}/${Date.now()}-${safeName}`;

    let fileUrl = `/media/provider_docs/${objectPath}`;

    if (!env.demoMode) {
      const supabase = createServiceClient();
      const bytes = Buffer.from(await upload.arrayBuffer());
      const { error } = await supabase.storage
        .from("provider_docs")
        .upload(objectPath, bytes, {
          contentType: upload.type || "application/octet-stream",
          upsert: false,
        });
      if (error) {
        throw Object.assign(new Error(error.message || "Upload failed"), { status: 500 });
      }
      const { data } = supabase.storage.from("provider_docs").getPublicUrl(objectPath);
      // Bucket is private — store storage path; clients use signed URLs later if needed
      fileUrl = data?.publicUrl || `provider_docs/${objectPath}`;
    }

    const doc = await db.addDocument(user.id, title, fileUrl, {
      document_type: documentType,
    });
    return json(
      {
        id: doc.id,
        title: doc.title,
        file: doc.file,
        document_type: doc.document_type,
        review_status: doc.review_status,
        uploaded_at: doc.uploaded_at,
      },
      201,
    );
  } catch (e) {
    return handleApiError(e);
  }
}
