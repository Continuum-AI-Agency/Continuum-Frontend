import { mediaKindSchema, mediaSourceSchema } from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import {
  buildCarousel,
  carouselSignablePaths,
  EXCLUDE_CAROUSEL_SLIDES_FILTER,
} from '@/lib/media/carousel';
import { rowToMediaAsset } from '@/lib/media/mapper';
import { MEDIA_ASSET_SELECT, type MediaAssetRow } from '@/lib/media/schema';
import { mintSignedUrls } from '@/lib/media/signed-urls';
import { resolveSmartQueryFilter } from '@/lib/media/smart-collections';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    collectionId: url.searchParams.get('collectionId') ?? undefined,
    source: url.searchParams.get('source') ?? undefined,
    kind: url.searchParams.get('kind') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, collectionId, source, kind, offset, limit } = parsed.data;

  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Read with the user-scoped client: the media.assets RLS policy
  // (has_brand_access(brand_id)) already scopes rows to the caller's brands, so
  // no service-role bypass is needed. Mirrors fetchMediaAssets (the RSC seed).
  //
  // Effective source/kind start from the explicit chip filters; a smart
  // collection can override/augment them via its smart_query (the scaffolding
  // for derived folders). Manual collections instead constrain by membership.
  let effectiveSource = source;
  let effectiveKind = kind;
  let assetIds: string[] | null = null;

  if (collectionId) {
    const { data: collection, error: collectionError } = await mediaSchema(supabase)
      .from('collections')
      .select('kind, smart_query')
      .eq('id', collectionId)
      .eq('brand_id', brandId)
      .maybeSingle();
    if (collectionError) {
      console.error('[library/assets] collection query failed', collectionError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }
    const col = collection as { kind: string; smart_query: Record<string, unknown> | null } | null;

    if (col?.kind === 'smart') {
      const smart = resolveSmartQueryFilter(col.smart_query);
      effectiveSource = smart.source ?? source;
      effectiveKind = smart.kind ?? kind;
    } else {
      const { data: items, error: itemsError } = await mediaSchema(supabase)
        .from('collection_items')
        .select('asset_id')
        .eq('collection_id', collectionId)
        .order('position', { ascending: true })
        .range(offset, offset + limit - 1);
      if (itemsError) {
        console.error('[library/assets] collection_items query failed', itemsError);
        return NextResponse.json({ error: 'Query failed' }, { status: 500 });
      }
      assetIds = (items ?? []).map((r: { asset_id: string }) => r.asset_id);
      if (assetIds.length === 0) {
        return NextResponse.json({ items: [], nextOffset: null });
      }
    }
  }

  let query = mediaSchema(supabase)
    .from('assets')
    .select(MEDIA_ASSET_SELECT)
    .eq('brand_id', brandId)
    .is('deleted_at', null);

  if (effectiveSource) query = query.eq('source', effectiveSource);
  if (effectiveKind) query = query.eq('kind', effectiveKind);

  if (assetIds) {
    query = query.in('id', assetIds);
  } else {
    // Hide non-cover carousel slides from the flat grid — a saved carousel shows
    // as one cover tile (its slides ride along on the cover's `carousel` field).
    query = query
      .not('tags', 'cs', EXCLUDE_CAROUSEL_SLIDES_FILTER)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[library/assets] assets query failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as MediaAssetRow[];
  const signedUrlMap = await mintSignedUrls([
    ...rows.map((r) => ({ path: r.storage_path, bucket: r.bucket })),
    ...carouselSignablePaths(rows),
  ]);

  const items = rows.map((row) => {
    const asset = rowToMediaAsset(row, signedUrlMap.get(row.storage_path) ?? null);
    const carousel = buildCarousel(row, signedUrlMap);
    return carousel ? { ...asset, carousel } : asset;
  });

  const nextOffset = rows.length === limit ? offset + limit : null;
  return NextResponse.json({ items, nextOffset });
}
