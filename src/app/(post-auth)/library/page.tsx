import {
  libraryBrowseQuerySchema,
  libraryLayoutSchema,
  libraryMediaTypeSchema,
  libraryPerformanceWindowSchema,
  libraryPlacementSchema,
  librarySortSchema,
  mediaKindSchema,
  mediaReviewStatusSchema,
  mediaSourceSchema,
} from '@continuum/contracts';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LibraryViewer } from '@/components/library/LibraryViewer';
import { fetchBrandStyle } from '@/lib/ai-studio/brandStyle.server';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { buildCaptionStyle } from '@/lib/clips/clipCaptionStyle';
import { fetchLibraryBrowsePage } from '@/lib/media/browse.server';
import { fetchMediaCollections, fetchStorageUsedBytes } from '@/lib/media/fetchers.server';
import { kindToMediaType, parseTagsParam } from '@/lib/media/filters';
import { fetchLibrarySavedViews } from '@/lib/media/saved-views.server';
import { isPaidTier } from '@/lib/media/tier';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Media Library | Continuum AI',
  description: 'Semantically-understood media library for your brand assets.',
};

function LibrarySkeleton() {
  return (
    <div className="flex h-full gap-4 p-4">
      <div className="w-56 shrink-0 animate-pulse rounded-xl bg-muted/70" />
      <div className="flex flex-1 flex-col gap-4">
        <div className="h-9 w-full animate-pulse rounded-lg bg-muted/70" />
        <div className="grid grid-cols-3 gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted/70" />
          ))}
        </div>
      </div>
    </div>
  );
}

type LibrarySearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function enumList<T extends string>(
  value: string | string[] | undefined,
  accepts: (candidate: string) => candidate is T,
): T[] {
  return parseTagsParam(first(value)).filter(accepts);
}

function optionalBoolean(value: string | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function isUuid(value: string | undefined): value is string {
  return (
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function parseBrowseQuery(brandId: string, params: LibrarySearchParams) {
  const legacySource = mediaSourceSchema.safeParse(first(params.source));
  const legacyKind = mediaKindSchema.safeParse(first(params.kind));
  const mediaType = libraryMediaTypeSchema.safeParse(first(params.mediaType));
  const sort = librarySortSchema.safeParse(first(params.sort));
  const performanceWindow = libraryPerformanceWindowSchema.safeParse(
    first(params.performanceWindow),
  );
  const layout = libraryLayoutSchema.safeParse(first(params.layout));
  const collection = first(params.collection);

  return libraryBrowseQuerySchema.parse({
    brandId,
    mediaType: mediaType.success
      ? mediaType.data
      : kindToMediaType(legacyKind.success ? legacyKind.data : undefined),
    createdWith: enumList(
      params.createdWith,
      (candidate): candidate is (typeof mediaSourceSchema)['_output'] =>
        mediaSourceSchema.safeParse(candidate).success,
    ).concat(legacySource.success ? [legacySource.data] : []),
    placements: enumList(
      params.placements,
      (candidate): candidate is (typeof libraryPlacementSchema)['_output'] =>
        libraryPlacementSchema.safeParse(candidate).success,
    ),
    tags: parseTagsParam(first(params.tags)),
    reviewStatuses: enumList(
      params.reviewStatuses,
      (candidate): candidate is (typeof mediaReviewStatusSchema)['_output'] =>
        mediaReviewStatusSchema.safeParse(candidate).success,
    ),
    ownerIds: parseTagsParam(first(params.ownerIds)).filter(isUuid),
    campaignIds: parseTagsParam(first(params.campaignIds)),
    usageRights: parseTagsParam(first(params.usageRights)).filter((value) =>
      ['owned', 'licensed', 'restricted', 'expired'].includes(value),
    ),
    collectionId: isUuid(collection) ? collection : undefined,
    used: optionalBoolean(first(params.used)),
    shared: optionalBoolean(first(params.shared)),
    leadingOnly: optionalBoolean(first(params.leadingOnly)),
    search: first(params.search),
    sort: sort.success ? sort.data : undefined,
    performanceWindow: performanceWindow.success ? performanceWindow.data : undefined,
    layout: layout.success ? layout.data : undefined,
    boardGroupBy: first(params.boardGroupBy),
  });
}

async function LibraryContent({ searchParams }: { searchParams: LibrarySearchParams }) {
  const { activeBrandId, activeBrandTier } = await getActiveBrandContext();

  if (!activeBrandId) {
    redirect('/onboarding');
  }

  const browseQuery = parseBrowseQuery(activeBrandId, searchParams);
  const supabase = await createSupabaseServerClient();
  const [page, collections, savedViews, storageUsedBytes, brandStyle] = await Promise.all([
    fetchLibraryBrowsePage(supabase, browseQuery),
    fetchMediaCollections(activeBrandId),
    fetchLibrarySavedViews(supabase, activeBrandId),
    fetchStorageUsedBytes(activeBrandId),
    fetchBrandStyle(activeBrandId),
  ]);

  return (
    <LibraryViewer
      brandId={activeBrandId}
      isPaid={isPaidTier(activeBrandTier)}
      initialAssets={page.items}
      initialNextCursor={page.nextCursor}
      initialCollections={collections}
      initialSavedViews={savedViews}
      storageUsedBytes={storageUsedBytes}
      captionStyle={buildCaptionStyle(brandStyle)}
      initialBrowseQuery={browseQuery}
    />
  );
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<LibrarySearchParams>;
}) {
  return (
    <div className="h-[var(--app-content-h)] min-h-[var(--workspace-min-height,600px)] w-full min-w-0 overflow-hidden">
      {/* Stable Suspense boundary (no per-filter key): filter/collection changes
          are soft navigations, so React keeps the current grid mounted during the
          refetch instead of tearing it down to the skeleton. The skeleton shows
          only on the first load of the route. */}
      <Suspense fallback={<LibrarySkeleton />}>
        <LibraryContent searchParams={await searchParams} />
      </Suspense>
    </div>
  );
}
