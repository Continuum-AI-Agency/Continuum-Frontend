import {
  type CustomFieldFilter,
  DEFAULT_LIBRARY_SORT,
  librarySortSchema,
  mediaKindSchema,
  mediaReviewStatusSchema,
  mediaSourceSchema,
} from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseFieldFiltersParam } from '@/lib/library/customFields';
import { resolveFieldFilterAssetIds } from '@/lib/library/customFields.server';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import {
  buildCarousel,
  carouselSignablePaths,
  EXCLUDE_CAROUSEL_SLIDES_FILTER,
} from '@/lib/media/carousel';
import {
  getLibrarySortOrder,
  kindMatchOrFilter,
  paginateByMembership,
  parseTagsParam,
} from '@/lib/media/filters';
import { rowToSignedMediaAsset } from '@/lib/media/mapper';
import {
  buildAssetPreview,
  loadAssetRenditions,
  renditionSignablePaths,
} from '@/lib/media/renditions';
import { MEDIA_ASSET_SELECT, type MediaAssetRow } from '@/lib/media/schema';
import { assetSignablePaths, mintSignedUrls } from '@/lib/media/signed-urls';
import { resolveSmartQueryFilter } from '@/lib/media/smart-collections';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const PAGE_SIZE = 48;

const querySchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid().optional(),
  collectionId: z.string().uuid().optional(),
  source: mediaSourceSchema.optional(),
  kind: mediaKindSchema.optional(),
  tags: z.string().optional(),
  reviewStatus: mediaReviewStatusSchema.optional(),
  sort: librarySortSchema.default(DEFAULT_LIBRARY_SORT),
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
    assetId: url.searchParams.get('assetId') ?? undefined,
    collectionId: url.searchParams.get('collectionId') ?? undefined,
    source: url.searchParams.get('source') ?? undefined,
    kind: url.searchParams.get('kind') ?? undefined,
    tags: url.searchParams.get('tags') ?? undefined,
    reviewStatus: url.searchParams.get('reviewStatus') ?? undefined,
    sort: url.searchParams.get('sort') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetId, collectionId, source, kind, reviewStatus, sort, offset, limit } =
    parsed.data;
  const tags = parseTagsParam(parsed.data.tags);

  // A malformed filter must fail loudly: dropping it would widen the result set,
  // and a filter UI that quietly shows MORE than you asked for is worse than one
  // that errors.
  const fieldFilterParse = parseFieldFiltersParam(url.searchParams.get('fieldFilters'));
  if (!fieldFilterParse.ok) {
    return NextResponse.json({ error: fieldFilterParse.reason }, { status: 422 });
  }

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
  let effectiveFieldFilters: CustomFieldFilter[] = fieldFilterParse.filters;
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
      // The collection's saved field filters NARROW further with the chips the
      // user has on — they compose (AND), they do not replace each other.
      effectiveFieldFilters = [...(smart.fieldFilters ?? []), ...fieldFilterParse.filters];
    } else {
      // Full membership id list (position-ordered): pagination happens AFTER
      // the asset-level filters below, so excluded rows (deleted, carousel
      // slides) can never under-fill a page or desync the offset math.
      const { data: items, error: itemsError } = await mediaSchema(supabase)
        .from('collection_items')
        .select('asset_id')
        .eq('collection_id', collectionId)
        .order('position', { ascending: true });
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

  // Custom-field filters resolve to an asset-id constraint, because the values
  // live in their own table. `restrictIds` is a candidate set to intersect;
  // `excludeIds` only appears for is_empty-only filters, where there is nothing
  // positive to enumerate and the constraint is a complement.
  let restrictIds: string[] | null = null;
  let excludeIds: string[] = [];

  if (effectiveFieldFilters.length > 0) {
    let resolution: Awaited<ReturnType<typeof resolveFieldFilterAssetIds>>;
    try {
      resolution = await resolveFieldFilterAssetIds(supabase, brandId, effectiveFieldFilters);
    } catch {
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }
    if (resolution.kind === 'ids') restrictIds = resolution.ids;
    if (resolution.kind === 'exclude') excludeIds = resolution.ids;
  }

  // A manual collection already gives a finite candidate list, so both field
  // constraints fold into it in memory — no second id list on the wire.
  if (assetIds && restrictIds) {
    const allowed = new Set(restrictIds);
    assetIds = assetIds.filter((id) => allowed.has(id));
    restrictIds = null;
  }
  if (assetIds && excludeIds.length > 0) {
    const denied = new Set(excludeIds);
    assetIds = assetIds.filter((id) => !denied.has(id));
    excludeIds = [];
  }
  if ((assetIds && assetIds.length === 0) || restrictIds?.length === 0) {
    return NextResponse.json({ items: [], nextOffset: null });
  }

  // Hide non-cover carousel slides everywhere (flat grid AND collections) — a
  // saved carousel shows as one cover tile carrying its slides.
  let query = mediaSchema(supabase)
    .from('assets')
    .select(MEDIA_ASSET_SELECT)
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .not('tags', 'cs', EXCLUDE_CAROUSEL_SLIDES_FILTER);

  if (restrictIds) query = query.in('id', restrictIds);
  if (assetId) query = query.eq('id', assetId);
  if (excludeIds.length > 0) query = query.not('id', 'in', `(${excludeIds.join(',')})`);
  if (effectiveSource) query = query.eq('source', effectiveSource);
  // Kind matches the row itself OR a slide inside a cover row's origin_ref, so
  // mixed carousels (video slide behind an image cover) surface under "Videos".
  if (effectiveKind) query = query.or(kindMatchOrFilter(effectiveKind));
  if (tags.length > 0) query = query.contains('tags', tags);
  if (reviewStatus) query = query.eq('review_status', reviewStatus);

  let rows: MediaAssetRow[];
  let nextOffset: number | null;

  if (assetIds) {
    const { data, error } = await query.in('id', assetIds);
    if (error) {
      console.error('[library/assets] assets query failed', error);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }
    const members = (data ?? []) as unknown as MediaAssetRow[];
    const paged = paginateByMembership(members, assetIds, offset, limit);
    rows = paged.page;
    nextOffset = paged.nextOffset;
  } else {
    const order = getLibrarySortOrder(sort);
    const { data, error } = await query
      .order(order.column, { ascending: order.ascending })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) {
      console.error('[library/assets] assets query failed', error);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }
    rows = (data ?? []) as unknown as MediaAssetRow[];
    nextOffset = rows.length === limit ? offset + limit : null;
  }

  const renditions = await loadAssetRenditions(
    supabase,
    rows.flatMap((row) => (row.head_version_id ? [row.head_version_id] : [])),
  );
  const signedUrlMap = await mintSignedUrls([
    ...assetSignablePaths(rows),
    ...carouselSignablePaths(rows),
    ...renditionSignablePaths(renditions),
  ]);

  const items = rows.map((row) => {
    const preview = buildAssetPreview(row, renditions, signedUrlMap);
    const asset = rowToSignedMediaAsset(row, signedUrlMap, preview);
    const carousel = buildCarousel(row, signedUrlMap);
    return carousel ? { ...asset, carousel } : asset;
  });

  return NextResponse.json({ items, nextOffset });
}
