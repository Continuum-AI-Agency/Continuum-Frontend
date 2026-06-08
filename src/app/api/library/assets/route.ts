import { NextResponse } from "next/server";
import { z } from "zod";
import { mediaKindSchema, mediaSourceSchema } from "@continuum/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { callerHasBrandAccess } from "@/lib/media/brand-access.server";
import { mediaSchema } from "@/lib/media/supabase-media";
import { rowToMediaAsset } from "@/lib/media/mapper";
import { mintSignedUrls } from "@/lib/media/signed-urls";
import { MEDIA_ASSET_SELECT, type MediaAssetRow } from "@/lib/media/schema";

export const runtime = "nodejs";

const PAGE_SIZE = 48;

const querySchema = z.object({
  brandId: z.string().uuid(),
  collectionId: z.string().uuid().optional(),
  source: mediaSourceSchema.optional(),
  kind: mediaKindSchema.optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(96).default(PAGE_SIZE),
});

// Paginated, brand-scoped asset list backing the library's infinite scroll.
// Page 0 is also seeded server-side by the RSC; this endpoint serves page N>0.
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    brandId: url.searchParams.get("brandId"),
    collectionId: url.searchParams.get("collectionId") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
    kind: url.searchParams.get("kind") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, collectionId, source, kind, offset, limit } = parsed.data;

  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();

  let assetIds: string[] | null = null;
  if (collectionId) {
    const { data: items, error: itemsError } = await mediaSchema(admin)
      .from("collection_items")
      .select("asset_id")
      .eq("collection_id", collectionId)
      .order("position", { ascending: true })
      .range(offset, offset + limit - 1);
    if (itemsError) {
      console.error("[library/assets] collection_items query failed", itemsError);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }
    assetIds = (items ?? []).map((r: { asset_id: string }) => r.asset_id);
    if (assetIds.length === 0) {
      return NextResponse.json({ items: [], nextOffset: null });
    }
  }

  let query = mediaSchema(admin)
    .from("assets")
    .select(MEDIA_ASSET_SELECT)
    .eq("brand_id", brandId)
    .is("deleted_at", null);

  if (source) query = query.eq("source", source);
  if (kind) query = query.eq("kind", kind);

  if (assetIds) {
    query = query.in("id", assetIds);
  } else {
    query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[library/assets] assets query failed", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as MediaAssetRow[];
  const signedUrlMap = await mintSignedUrls(
    rows.map((r) => ({ path: r.storage_path, bucket: r.bucket })),
  );

  const items = rows.map((row) =>
    rowToMediaAsset(row, signedUrlMap.get(row.storage_path) ?? null),
  );

  const nextOffset = rows.length === limit ? offset + limit : null;
  return NextResponse.json({ items, nextOffset });
}
