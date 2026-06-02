import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mediaSearchRequestSchema } from "@continuum/contracts";
import { mediaSchema } from "@/lib/media/supabase-media";
import { rowToMediaAsset } from "@/lib/media/mapper";
import { mintSignedUrls } from "@/lib/media/signed-urls";
import { MEDIA_ASSET_SELECT, type MediaAssetRow, type MatchAssetRow } from "@/lib/media/schema";
import type { MediaSearchResponse } from "@continuum/contracts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = mediaSearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }

  const req = parsed.data;

  // Verify the caller belongs to the brand before using the admin client
  // (which bypasses RLS). has_brand_access is SECURITY DEFINER and reads
  // auth.uid(), so it must run on the user-scoped client.
  const { data: hasAccess, error: accessError } = await supabase
    .schema("brand_profiles")
    .rpc("has_brand_access", { brand_id: req.brandId });
  if (accessError || !hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();

  try {
    if (req.mode === "text") {
      // Field-priority lexical ranking: title > tags > description.
      const { data: matchRows, error: matchError } = await mediaSchema(admin)
        .rpc("search_assets_ranked", {
          filter_brand_id: req.brandId,
          q: req.query!,
          match_count: req.limit,
        });

      if (matchError) {
        console.error("[library/search] search_assets_ranked failed", matchError);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
      }

      const matchList = (matchRows ?? []) as MatchAssetRow[];
      const ids = matchList.map((r) => r.id);
      if (ids.length === 0) {
        const result: MediaSearchResponse = { mode: "text", items: [] };
        return NextResponse.json(result);
      }

      const { data: assetRows, error: assetError } = await mediaSchema(admin)
        .from("assets")
        .select(MEDIA_ASSET_SELECT)
        .in("id", ids);

      if (assetError) {
        console.error("[library/search] asset hydration failed", assetError);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
      }

      const rows = (assetRows ?? []) as unknown as MediaAssetRow[];
      const rowMap = new Map(rows.map((r) => [r.id, r]));
      const signedUrlMap = await mintSignedUrls(
        rows.map((r) => ({ path: r.storage_path, bucket: r.bucket })),
      );

      const result: MediaSearchResponse = {
        mode: "text",
        items: matchList.flatMap((match) => {
          const row = rowMap.get(match.id);
          if (!row) return [];
          return [
            {
              asset: rowToMediaAsset(
                row,
                signedUrlMap.get(row.storage_path) ?? null,
              ),
              similarity: match.similarity,
            },
          ];
        }),
      };

      return NextResponse.json(result);
    }

    // similar mode
    const { data: refRow, error: refError } = await mediaSchema(admin)
      .from("assets")
      .select("embedding_image, brand_id")
      .eq("id", req.similarToAssetId!)
      .single()
      .returns<{ embedding_image: unknown; brand_id: string }>();

    if (refError || !refRow) {
      console.error("[library/search] reference asset not found", refError);
      return NextResponse.json({ error: "Reference asset not found" }, { status: 404 });
    }

    // The reference asset must belong to the brand the caller is authorized for,
    // so a foreign asset id cannot be used to seed a similarity query.
    if (refRow.brand_id !== req.brandId) {
      return NextResponse.json({ error: "Reference asset not found" }, { status: 404 });
    }

    const { data: matchRows, error: matchError } = await mediaSchema(admin)
      .rpc("match_similar_assets", {
        query_embedding: refRow.embedding_image,
        match_threshold: req.threshold,
        match_count: req.limit,
        filter_brand_id: req.brandId,
        exclude_asset_id: req.similarToAssetId,
      });

    if (matchError) {
      console.error("[library/search] match_similar_assets failed", matchError);
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }

    const matchList = (matchRows ?? []) as MatchAssetRow[];
    const ids = matchList.map((r) => r.id);
    if (ids.length === 0) {
      const result: MediaSearchResponse = { mode: "similar", items: [] };
      return NextResponse.json(result);
    }

    const { data: assetRows, error: assetError } = await mediaSchema(admin)
      .from("assets")
      .select(MEDIA_ASSET_SELECT)
      .in("id", ids);

    if (assetError) {
      console.error("[library/search] similar asset hydration failed", assetError);
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }

    const rows = (assetRows ?? []) as unknown as MediaAssetRow[];
    const rowMap = new Map(rows.map((r) => [r.id, r]));
    const signedUrlMap = await mintSignedUrls(
      rows.map((r) => ({ path: r.storage_path, bucket: r.bucket })),
    );

    const result: MediaSearchResponse = {
      mode: "similar",
      items: matchList.flatMap((match) => {
        const row = rowMap.get(match.id);
        if (!row) return [];
        return [
          {
            asset: rowToMediaAsset(row, signedUrlMap.get(row.storage_path) ?? null),
            similarity: match.similarity,
          },
        ];
      }),
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[library/search] unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Allow preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
