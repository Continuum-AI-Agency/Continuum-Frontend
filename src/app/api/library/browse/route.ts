import { libraryBrowseQuerySchema } from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseFieldFiltersParam } from '@/lib/library/customFields';
import { resolveFieldFilterAssetIds } from '@/lib/library/customFields.server';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { fetchLibraryBrowsePage, fetchNarrowedLibraryBrowsePage } from '@/lib/media/browse.server';
import { isNarrowed, type LibraryBrowseNarrowing } from '@/lib/media/browse-args';
import { parseTagsParam } from '@/lib/media/filters';
import { resolveSmartQueryFilter } from '@/lib/media/smart-collections';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function optionalBoolean(value: string | null): boolean | null | undefined {
  if (value === null) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const parsed = libraryBrowseQuerySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    mediaType: url.searchParams.get('mediaType') ?? undefined,
    createdWith: parseTagsParam(url.searchParams.get('createdWith')),
    placements: parseTagsParam(url.searchParams.get('placements')),
    tags: parseTagsParam(url.searchParams.get('tags')),
    reviewStatuses: parseTagsParam(url.searchParams.get('reviewStatuses')),
    ownerIds: parseTagsParam(url.searchParams.get('ownerIds')),
    campaignIds: parseTagsParam(url.searchParams.get('campaignIds')),
    projectIds: parseTagsParam(url.searchParams.get('projectIds')),
    usageRights: parseTagsParam(url.searchParams.get('usageRights')),
    destination: url.searchParams.get('destination') ?? undefined,
    aspectRatios: parseTagsParam(url.searchParams.get('aspectRatios')),
    previewFrame: url.searchParams.get('frame') ?? undefined,
    collectionId: url.searchParams.get('collection') ?? url.searchParams.get('collectionId'),
    used: optionalBoolean(url.searchParams.get('used')),
    shared: optionalBoolean(url.searchParams.get('shared')),
    leadingOnly: optionalBoolean(url.searchParams.get('leadingOnly')) ?? undefined,
    templateOnly: optionalBoolean(url.searchParams.get('templateOnly')) ?? undefined,
    ratios: parseTagsParam(url.searchParams.get('ratios')),
    fonts: parseTagsParam(url.searchParams.get('fonts')),
    search: url.searchParams.get('search') ?? undefined,
    sort: url.searchParams.get('sort') ?? undefined,
    performanceWindow: url.searchParams.get('performanceWindow') ?? undefined,
    layout: url.searchParams.get('layout') ?? undefined,
    sortFieldId: url.searchParams.get('sortField') ?? undefined,
    cursor: url.searchParams.get('cursor'),
    limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  // Custom review states and custom-field filters narrow the ranked browse (every other
  // filter still applies). A malformed one fails loudly: dropping it would widen the result.
  const reviewStateParse = z
    .array(z.string().uuid())
    .max(50)
    .safeParse(parseTagsParam(url.searchParams.get('reviewStateIds')));
  if (!reviewStateParse.success) {
    return NextResponse.json({ error: 'reviewStateIds must be review state ids' }, { status: 422 });
  }
  const fieldFilterParse = parseFieldFiltersParam(url.searchParams.get('fieldFilters'));
  if (!fieldFilterParse.ok) {
    return NextResponse.json({ error: fieldFilterParse.reason }, { status: 422 });
  }
  if (!(await callerHasBrandAccess(supabase, parsed.data.brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const narrowing: LibraryBrowseNarrowing = {
      reviewStateIds: reviewStateParse.data,
      fieldConstraint: { kind: 'unfiltered' },
    };
    let fieldFilters = fieldFilterParse.filters;
    if (fieldFilters.length > 0 || narrowing.reviewStateIds.length > 0) {
      // A smart collection's saved field filters compose (AND) with the chips.
      if (parsed.data.collectionId) {
        const { data: collection } = await mediaSchema(supabase)
          .from('collections')
          .select('kind, smart_query')
          .eq('id', parsed.data.collectionId)
          .eq('brand_id', parsed.data.brandId)
          .maybeSingle();
        const col = collection as { kind: string; smart_query: unknown } | null;
        if (col?.kind === 'smart') {
          const saved = resolveSmartQueryFilter(col.smart_query as Record<string, unknown> | null);
          fieldFilters = [...(saved.fieldFilters ?? []), ...fieldFilters];
        }
      }
      narrowing.fieldConstraint = await resolveFieldFilterAssetIds(
        supabase,
        parsed.data.brandId,
        fieldFilters,
      );
    }
    if (isNarrowed(narrowing)) {
      return NextResponse.json(
        await fetchNarrowedLibraryBrowsePage(supabase, parsed.data, narrowing),
      );
    }
    return NextResponse.json(await fetchLibraryBrowsePage(supabase, parsed.data));
  } catch (error) {
    console.error('[library/browse] query failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
