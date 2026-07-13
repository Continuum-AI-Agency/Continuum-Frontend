// Shared media-library filter vocabulary + query builder. Used by the library
// page filter chips, the useMediaLibrary pagination hook, and the ai-studio
// "Library" tab so every surface speaks the same source/type filter language.

import {
  CAROUSEL_SLIDE_TAG,
  type MediaKind,
  type MediaReviewStatus,
  type MediaSearchFilters,
  type MediaSource,
} from '@continuum/contracts';

export type SourceFilterValue = MediaSource | 'all';
export type KindFilterValue = MediaKind | 'all';

export type FilterOption<T extends string> = { value: T; label: string };

// Canonical, ordered creative-source vocabulary — the single source of truth.
// Every library/grabber surface (filter chips, sidebar Browse folders, the
// grabber's source subfolders, badge labels) derives from this list, so adding a
// source (with its contract enum value + migration) lights it up everywhere at
// once. Each value is a delineated folder; the bytes may live in different
// storage buckets but composite into the one media.assets registry.
export const MEDIA_SOURCES: FilterOption<MediaSource>[] = [
  { value: 'upload', label: 'Uploads' },
  { value: 'ai_generated', label: 'AI Creations' },
  { value: 'canvas', label: 'Canvas' },
  { value: 'inspiration', label: 'Inspiration' },
  // Our OWN ad creatives pulled back out of Meta (Creative DNA import), as
  // distinct from `inspiration`, which is a COMPETITOR's ad.
  { value: 'meta_ad', label: 'Ad Creatives' },
  { value: 'hyperframe', label: 'HyperFrames' },
  { value: 'chat_upload', label: 'Chat Uploads' },
  { value: 'clip', label: 'Clips' },
  { value: 'reel', label: 'Reels' },
  { value: 'backfill', label: 'Imported' },
];

export const SOURCE_FILTERS: FilterOption<SourceFilterValue>[] = [
  { value: 'all', label: 'All' },
  ...MEDIA_SOURCES,
];

// Per-source display label keyed by source value. Derived from MEDIA_SOURCES so
// it can never drift out of completeness with the contract enum.
export const SOURCE_LABEL: Record<MediaSource, string> = Object.fromEntries(
  MEDIA_SOURCES.map((s) => [s.value, s.label]),
) as Record<MediaSource, string>;

export const KIND_FILTERS: FilterOption<KindFilterValue>[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
];

export type LibraryQueryInput = {
  brandId: string;
  collectionId?: string | null;
  source?: SourceFilterValue | null;
  kind?: KindFilterValue | null;
  tags?: readonly string[] | null;
  offset?: number;
  limit?: number;
};

// Build the query string for GET /api/library/assets. "all"/empty filters are
// omitted so the endpoint treats them as unset (no .eq applied server-side).
export function buildLibraryQuery(input: LibraryQueryInput): URLSearchParams {
  const params = new URLSearchParams({ brandId: input.brandId });
  if (input.collectionId) params.set('collectionId', input.collectionId);
  if (input.source && input.source !== 'all') params.set('source', input.source);
  if (input.kind && input.kind !== 'all') params.set('kind', input.kind);
  if (input.tags && input.tags.length > 0) params.set('tags', input.tags.join(','));
  if (typeof input.offset === 'number') params.set('offset', String(input.offset));
  if (typeof input.limit === 'number') params.set('limit', String(input.limit));
  return params;
}

// Inverse of the `tags` URL/query param (comma-separated). Trims, drops
// empties, and dedupes so a hand-edited URL still yields a clean filter.
export function parseTagsParam(value: string | null | undefined): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

// Narrow a chip value to the contract source/kind (drops "all"). Used when
// threading filters into the search request body.
export function toContractSource(value?: SourceFilterValue | null): MediaSource | undefined {
  return value && value !== 'all' ? value : undefined;
}

export function toContractKind(value?: KindFilterValue | null): MediaKind | undefined {
  return value && value !== 'all' ? value : undefined;
}

// PostgREST `.or()` clause for a kind filter that also surfaces carousel cover
// rows whose origin_ref.slides contain a slide of that kind — so a
// video-inside-image-cover carousel shows up under "Videos". The JSON value is
// double-quoted with escaped inner quotes per PostgREST logic-tree syntax
// (verified against the local stack).
export function kindMatchOrFilter(kind: MediaKind): string {
  const slideMatch = JSON.stringify([{ kind }]).replaceAll('"', '\\"');
  return `kind.eq.${kind},origin_ref->slides.cs."${slideMatch}"`;
}

// Named RPC filter args shared by the search route's text + similar paths.
// Filters participate in ranking inside the RPC (never post-hoc on the top-K
// id set). Carousel slide rows never rank: the cover row represents the group,
// mirroring the grid's exclusion.
export type MediaSearchRpcFilters = {
  filter_source: MediaSource | null;
  filter_kind: MediaKind | null;
  filter_tags: string[] | null;
  filter_exclude_tags: string[];
  filter_collection_id: string | null;
  filter_review_status: MediaReviewStatus | null;
  // Custom-field filters, pre-resolved to asset ids by the caller (a field value
  // lives in another table, so it cannot be a predicate on media.assets). Pushed
  // INTO the ranking RPCs like every other filter — never applied to a truncated
  // top-K, which is the bug the v2 post-mortem is about. `is_empty` arrives as
  // the exclude list, because "has no row" is not a selectable jsonb predicate.
  filter_asset_ids: string[] | null;
  filter_exclude_asset_ids: string[] | null;
};

export function toSearchRpcFilters(filters: MediaSearchFilters | undefined): MediaSearchRpcFilters {
  return {
    filter_source: filters?.source ?? null,
    filter_kind: filters?.kind ?? null,
    filter_tags: filters?.tags && filters.tags.length > 0 ? filters.tags : null,
    filter_exclude_tags: [CAROUSEL_SLIDE_TAG],
    filter_collection_id: filters?.collectionId ?? null,
    filter_review_status: filters?.reviewStatus ?? null,
    // The route resolves fieldFilters against the DB and folds the result in;
    // absent them, both stay null and the RPCs behave exactly as before.
    filter_asset_ids: null,
    filter_exclude_asset_ids: null,
  };
}

export type LibraryTagOption = { tag: string; count: number };

// Distinct tag vocabulary with usage counts for the tag filter chips. Excludes
// the carousel-slide system tag, sorts by count (ties alphabetical), caps the
// row so it stays a compact chip strip.
export function aggregateTagCounts(
  rows: readonly { tags: string[] | null }[],
  cap = 40,
): LibraryTagOption[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.tags ?? []) {
      const trimmed = tag.trim();
      if (!trimmed || trimmed === CAROUSEL_SLIDE_TAG) continue;
      counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, cap);
}

// Manual-collection pagination: order hydrated (already filtered) asset rows by
// their collection_items.position rank, then slice. Offsets index the filtered,
// position-ordered list — identical math for the RSC seed (offset 0) and the
// API's page N, so the loadMore seam never skips or repeats rows.
export function paginateByMembership<T extends { id: string }>(
  rows: readonly T[],
  orderedIds: readonly string[],
  offset: number,
  limit: number,
): { page: T[]; nextOffset: number | null } {
  const rank = new Map(orderedIds.map((id, index) => [id, index] as const));
  const ordered = rows
    .filter((row) => rank.has(row.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  const page = ordered.slice(offset, offset + limit);
  const nextOffset = offset + limit < ordered.length ? offset + limit : null;
  return { page, nextOffset };
}
