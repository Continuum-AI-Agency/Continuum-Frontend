import { libraryBrowseQuerySchema } from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { fetchLibraryBrowsePage } from '@/lib/media/browse.server';
import { parseTagsParam } from '@/lib/media/filters';
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
    usageRights: parseTagsParam(url.searchParams.get('usageRights')),
    collectionId: url.searchParams.get('collection') ?? url.searchParams.get('collectionId'),
    used: optionalBoolean(url.searchParams.get('used')),
    shared: optionalBoolean(url.searchParams.get('shared')),
    leadingOnly: optionalBoolean(url.searchParams.get('leadingOnly')) ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    sort: url.searchParams.get('sort') ?? undefined,
    performanceWindow: url.searchParams.get('performanceWindow') ?? undefined,
    layout: url.searchParams.get('layout') ?? undefined,
    cursor: url.searchParams.get('cursor'),
    limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  if (!(await callerHasBrandAccess(supabase, parsed.data.brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    return NextResponse.json(await fetchLibraryBrowsePage(supabase, parsed.data));
  } catch (error) {
    console.error('[library/browse] query failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
