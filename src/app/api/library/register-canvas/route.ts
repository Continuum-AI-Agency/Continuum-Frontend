import { NextResponse } from "next/server";
import { registerCanvasAssetRequestSchema } from "@continuum/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { callerHasBrandAccess } from "@/lib/media/brand-access.server";
import { mediaSchema } from "@/lib/media/supabase-media";
import { buildCanvasAssetRow, shouldAnalyzeCanvasAsset } from "@/lib/media/canvas-register";

export const runtime = "nodejs";

// Kill switch (defaults ON). Set CANVAS_AUTO_REGISTER_ENABLED=false to stop
// auto-registering canvas creations into the media library.
function autoRegisterEnabled(): boolean {
  return process.env.CANVAS_AUTO_REGISTER_ENABLED !== "false";
}

// Register-in-place: the canvas generator already uploaded the bytes to its own
// bucket (brand-profile-assets); we only record a media.assets row pointing at
// that object. No byte copy. Cross-bucket signing already works everywhere the
// library is read.
export async function POST(request: Request) {
  if (!autoRegisterEnabled()) {
    return NextResponse.json({ assetId: null });
  }

  const json = await request.json().catch(() => null);
  const parsed = registerCanvasAssetRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await callerHasBrandAccess(supabase, input.brandProfileId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const row = buildCanvasAssetRow(input, user.id);

  // Idempotent on (bucket, storage_path): a canvas re-run that reuses the same
  // storage object will not create a duplicate. With ignoreDuplicates the insert
  // is skipped on conflict and select returns [].
  const { data: inserted, error } = await mediaSchema(admin)
    .from("assets")
    .upsert(row, { onConflict: "bucket,storage_path", ignoreDuplicates: true })
    .select("id");

  if (error) {
    console.warn("[register-canvas] upsert failed", {
      storagePath: input.storagePath,
      error: error.message,
    });
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const insertedRow = (inserted ?? [])[0] as { id: string } | undefined;

  if (insertedRow) {
    if (shouldAnalyzeCanvasAsset(input.kind)) {
      enqueueAnalyze({
        brandId: input.brandProfileId,
        assetId: insertedRow.id,
        storagePath: input.storagePath,
        bucket: input.bucket,
        mimeType: input.mimeType,
        fileName: input.fileName,
      });
    }
    return NextResponse.json({ assetId: insertedRow.id });
  }

  // Conflict: the asset was already registered. Recover its id; do not re-analyze.
  const { data: existing } = await mediaSchema(admin)
    .from("assets")
    .select("id")
    .eq("bucket", input.bucket)
    .eq("storage_path", input.storagePath)
    .eq("brand_id", input.brandProfileId)
    .maybeSingle();
  const existingId = (existing as { id: string } | null)?.id ?? null;
  return NextResponse.json({ assetId: existingId });
}

// Tier-gated inside the edge function. Fire-and-forget; never blocks the response.
function enqueueAnalyze(params: {
  brandId: string;
  assetId: string;
  storagePath: string;
  bucket: string;
  mimeType: string;
  fileName: string;
}): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;
  fetch(`${supabaseUrl}/functions/v1/analyze_media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(params),
  }).catch((err) => {
    console.warn("[register-canvas] analyze_media enqueue failed", {
      assetId: params.assetId,
      error: String(err),
    });
  });
}
