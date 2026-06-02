import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sanitizeStorageFileName } from "@/lib/storage/sanitize";
import { mediaSchema } from "@/lib/media/supabase-media";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

const ACCEPTED_MIME_PREFIXES = ["image/", "video/"];

function isAcceptedMime(mime: string): boolean {
  return ACCEPTED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

function deriveKind(mime: string): "image" | "video" {
  return mime.startsWith("video/") ? "video" : "image";
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const brandId = formData.get("brandId");
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!brandId || typeof brandId !== "string") {
    return NextResponse.json({ error: "Missing brandId" }, { status: 400 });
  }

  // Verify the caller belongs to the brand before any admin-client work.
  // has_brand_access is SECURITY DEFINER and reads auth.uid(), so it must run
  // on the user-scoped client (the admin client would resolve no auth.uid()).
  const { data: hasAccess, error: accessError } = await supabase
    .schema("brand_profiles")
    .rpc("has_brand_access", { brand_id: brandId });
  if (accessError || !hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB limit` },
      { status: 413 },
    );
  }
  if (!isAcceptedMime(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type || "unknown"}` },
      { status: 415 },
    );
  }

  const assetId = randomUUID();
  const sanitizedName = sanitizeStorageFileName(file.name);
  const storagePath = `${brandId}/${assetId}/${sanitizedName}`;
  const kind = deriveKind(file.type);

  // Use admin for storage upload to bypass RLS on the bucket
  const admin = createSupabaseAdminClient();

  const { data: uploadData, error: uploadError } = await admin.storage
    .from("media-library")
    .upload(storagePath, file, { contentType: file.type });

  if (uploadError) {
    console.error("[library/upload] Storage upload failed", uploadError);
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const finalPath = uploadData?.path ?? storagePath;

  const { error: insertError } = await mediaSchema(admin)
    .from("assets")
    .insert({
      id: assetId,
      brand_id: brandId,
      created_by: user.id,
      kind,
      bucket: "media-library",
      storage_path: finalPath,
      file_name: sanitizedName,
      mime_type: file.type,
      size_bytes: file.size,
      source: "upload",
      status: "stored",
    });

  if (insertError) {
    console.error("[library/upload] DB insert failed", insertError);
    // Best-effort: clean up the orphaned storage object
    await admin.storage.from("media-library").remove([finalPath]);
    return NextResponse.json(
      { error: `DB insert failed: ${insertError.message}` },
      { status: 500 },
    );
  }

  // Kick off analysis asynchronously; failure here doesn't fail the upload
  supabase.functions
    .invoke("analyze_media", {
      body: {
        brandId,
        assetId,
        storagePath: finalPath,
        bucket: "media-library",
        mimeType: file.type,
        fileName: sanitizedName,
      },
    })
    .catch((err: unknown) => {
      console.error("[library/upload] analyze_media invoke failed", err);
    });

  return NextResponse.json({ assetId, storagePath: finalPath }, { status: 201 });
}
