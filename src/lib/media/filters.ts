// Shared media-library filter vocabulary + query builder. Used by the library
// page filter chips, the useMediaLibrary pagination hook, and the ai-studio
// "Library" tab so every surface speaks the same source/type filter language.

import {
  AUDIO_CODEC_FAMILIES,
  type CustomField,
  DEFAULT_LIBRARY_SORT,
  formatLibraryThenBy,
  HDR_DYNAMIC_RANGES,
  HIDDEN_LIBRARY_TAGS,
  LIBRARY_FORMAT_GROUP_LABELS,
  type LibraryBrowseQuery,
  type LibraryDateRange,
  type LibraryMediaType,
  type LibraryNumericRange,
  type LibraryRangeFilters,
  type LibrarySort,
  type LibrarySortKey,
  type LibraryTechnicalFilters,
  type MediaKind,
  type MediaReviewStatus,
  type MediaSearchFilters,
  type MediaSource,
  parseLibraryThenBy,
  VIDEO_CODEC_FAMILIES,
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
  { value: 'figma', label: 'Figma' },
  { value: 'forge', label: 'Forge renders' },
  { value: 'goal_artifact', label: 'Goal artifacts' },
];

export const SOURCE_FILTERS: FilterOption<SourceFilterValue>[] = [
  { value: 'all', label: 'All' },
  ...MEDIA_SOURCES,
];

// Sources describe how an asset entered or was created in Continuum. They are
// deliberately an advanced facet, not top-level folders: a Reel is still a
// video and a HyperFrame may be an image or video.
export const CREATION_METHOD_GROUPS: FilterOption<MediaSource>[] = [
  { value: 'upload', label: 'Upload' },
  { value: 'ai_generated', label: 'AI generated' },
  { value: 'canvas', label: 'Canvas' },
  { value: 'inspiration', label: 'Inspiration' },
  { value: 'meta_ad', label: 'Ad import' },
  { value: 'hyperframe', label: 'HyperFrame' },
  { value: 'chat_upload', label: 'Chat upload' },
  { value: 'clip', label: 'Clip' },
  { value: 'reel', label: 'Reel' },
  { value: 'backfill', label: 'Imported' },
  { value: 'figma', label: 'Figma' },
  { value: 'forge', label: 'Forge' },
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
  { value: 'file', label: 'Project files' },
  { value: 'audio', label: 'Audio' },
];

export const LIBRARY_SORT_OPTIONS: FilterOption<LibrarySort>[] = [
  { value: 'created_desc', label: 'Recently added' },
  { value: 'created_asc', label: 'Oldest first' },
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'size_desc', label: 'Largest first' },
  { value: 'size_asc', label: 'Smallest first' },
  { value: 'duration_desc', label: 'Longest first' },
  { value: 'duration_asc', label: 'Shortest first' },
  { value: 'resolution_desc', label: 'Highest resolution' },
  { value: 'frame_rate_desc', label: 'Highest frame rate' },
  { value: 'bit_rate_desc', label: 'Highest bit rate' },
  { value: 'most_used', label: 'Most used' },
  { value: 'best_performing', label: 'Best performing' },
  { value: 'manual', label: 'Manual collection order' },
];

/** Secondary sort choices ("then by"), each in either direction. */
export const LIBRARY_THEN_BY_KEYS: FilterOption<LibrarySortKey>[] = [
  { value: 'created', label: 'Date added' },
  { value: 'updated', label: 'Date updated' },
  { value: 'name', label: 'Name' },
  { value: 'size', label: 'File size' },
  { value: 'duration', label: 'Duration' },
  { value: 'resolution', label: 'Resolution' },
  { value: 'frame_rate', label: 'Frame rate' },
  { value: 'bit_rate', label: 'Bit rate' },
  { value: 'page_count', label: 'Pages' },
  { value: 'format', label: 'Format' },
  { value: 'review', label: 'Review status' },
  { value: 'comments', label: 'Comments' },
];

/** A sort's label, including the ones only a List column header sets (`frame_rate_asc`). */
export function librarySortLabel(sort: LibrarySort): string {
  const named = LIBRARY_SORT_OPTIONS.find((option) => option.value === sort);
  if (named) return named.label;
  const key = sort.slice(0, sort.lastIndexOf('_'));
  const words = key.replaceAll('_', ' ');
  const label =
    LIBRARY_THEN_BY_KEYS.find((option) => option.value === key)?.label ??
    words.charAt(0).toUpperCase() + words.slice(1);
  return `${label} ${sort.endsWith('_asc') ? '↑' : '↓'}`;
}

/** Short-edge presets, so a portrait 4K clip counts as 4K too. */
export const LIBRARY_RESOLUTION_PRESETS = [
  { min: 720, label: '720p+' },
  { min: 1080, label: '1080p+' },
  { min: 2160, label: '4K+' },
] as const;

/** The object-valued filters: format groups, row ranges, technical predicates, field ranges. */
export type StructuredLibraryFilters = Pick<
  MediaSearchFilters,
  'families' | 'ranges' | 'technical' | 'fieldRanges'
>;

/**
 * The brand's Rating field: a `rating` field first, else a select or status named "Rating" —
 * the seeded ★ select, whose 1-based option position is its star count.
 */
export function libraryRatingField(
  fields: readonly CustomField[] | null | undefined,
): CustomField | null {
  return (
    fields?.find((field) => field.type === 'rating') ??
    fields?.find(
      (field) =>
        (field.type === 'single_select' || field.type === 'status') &&
        field.name.trim().toLowerCase() === 'rating',
    ) ??
    null
  );
}

/** Drops unset and emptied keys, and answers undefined when nothing is left: an empty filter object must never reach a URL. */
export function compactFilters<T extends object>(value: T | undefined): T | undefined {
  if (!value) return undefined;
  const entries = Object.entries(value).filter(
    ([, entry]) => entry !== undefined && !(Array.isArray(entry) && entry.length === 0),
  );
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}

const decimal = (value: number) => String(Math.round(value * 100) / 100);

type NumericRangeKey = Exclude<keyof LibraryRangeFilters, 'createdAt' | 'updatedAt'>;

const RANGE_UNITS: Readonly<Record<NumericRangeKey, (value: number) => string>> = {
  durationMs: (value) => `${decimal(value / 1000)} s`,
  resolution: (value) => `${decimal(value)}p`,
  frameRate: (value) => `${decimal(value)} fps`,
  bitRate: (value) => `${decimal(value / 1e6)} Mb/s`,
  sizeBytes: (value) => `${decimal(value / 1e6)} MB`,
  pageCount: (value) => `${decimal(value)} pages`,
  audioSampleRate: (value) => `${decimal(value / 1000)} kHz`,
  audioChannels: (value) => `${decimal(value)} ch`,
  bitDepth: (value) => `${decimal(value)}-bit`,
};

function rangeText<V>(range: { min?: V; max?: V }, format: (value: V) => string): string {
  if (range.min !== undefined && range.max !== undefined) {
    return `${format(range.min)}–${format(range.max)}`;
  }
  return range.min !== undefined ? `≥ ${format(range.min)}` : `≤ ${format(range.max as V)}`;
}

function dateRangeText(verb: string, range: LibraryDateRange): string {
  const day = (ms: number) =>
    new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  // `before` is exclusive, so the last day shown is the one before it.
  const from = range.after ? day(Date.parse(range.after)) : null;
  const to = range.before ? day(Date.parse(range.before) - 1) : null;
  if (from && to) return `${verb} ${from} – ${to}`;
  return from ? `${verb} since ${from}` : `${verb} through ${to}`;
}

function codecLabel(families: Record<string, { label: string }>, codec: string): string {
  return families[codec]?.label ?? codec;
}

/**
 * One removable chip per active structured filter. The id names exactly what
 * withoutStructuredFilter removes: `families:video`, `ranges:durationMs`,
 * `technical:videoCodecs:prores`, `technical:hasAlpha`, `fieldRanges:<field id>`.
 */
export function structuredFilterChips(
  filters: StructuredLibraryFilters,
  fields: readonly CustomField[] = [],
): { id: string; label: string }[] {
  const chips: { id: string; label: string }[] = [];
  for (const family of filters.families ?? []) {
    chips.push({ id: `families:${family}`, label: LIBRARY_FORMAT_GROUP_LABELS[family] });
  }
  const ranges = filters.ranges ?? {};
  for (const key of Object.keys(RANGE_UNITS) as NumericRangeKey[]) {
    const range: LibraryNumericRange | undefined = ranges[key];
    if (!range) continue;
    const preset =
      key === 'resolution' && range.max === undefined
        ? LIBRARY_RESOLUTION_PRESETS.find((option) => option.min === range.min)
        : undefined;
    chips.push({ id: `ranges:${key}`, label: preset?.label ?? rangeText(range, RANGE_UNITS[key]) });
  }
  if (ranges.createdAt) {
    chips.push({ id: 'ranges:createdAt', label: dateRangeText('Added', ranges.createdAt) });
  }
  if (ranges.updatedAt) {
    chips.push({ id: 'ranges:updatedAt', label: dateRangeText('Updated', ranges.updatedAt) });
  }
  const technical = filters.technical ?? {};
  for (const codec of technical.videoCodecs ?? []) {
    chips.push({
      id: `technical:videoCodecs:${codec}`,
      label: codecLabel(VIDEO_CODEC_FAMILIES, codec),
    });
  }
  for (const codec of technical.audioCodecs ?? []) {
    chips.push({
      id: `technical:audioCodecs:${codec}`,
      label: codecLabel(AUDIO_CODEC_FAMILIES, codec),
    });
  }
  const dynamicRanges = technical.dynamicRanges ?? [];
  if (dynamicRanges.length > 0) {
    const allHdr =
      dynamicRanges.length === HDR_DYNAMIC_RANGES.length &&
      HDR_DYNAMIC_RANGES.every((range) => dynamicRanges.includes(range));
    chips.push({
      id: 'technical:dynamicRanges',
      label: allHdr
        ? 'HDR'
        : dynamicRanges.map((range) => range.replaceAll('_', ' ').toUpperCase()).join(' / '),
    });
  }
  if (technical.hasAlpha !== undefined) {
    chips.push({
      id: 'technical:hasAlpha',
      label: technical.hasAlpha ? 'Transparency' : 'No transparency',
    });
  }
  if (technical.hasLocation !== undefined) {
    chips.push({
      id: 'technical:hasLocation',
      label: technical.hasLocation ? 'Has location' : 'No location',
    });
  }
  const ratingFieldId = libraryRatingField(fields)?.id;
  for (const range of filters.fieldRanges ?? []) {
    const label =
      range.fieldId === ratingFieldId
        ? range.max === undefined
          ? `★ ${range.min}+`
          : `★ ${rangeText(range, String)}`
        : `${fields.find((field) => field.id === range.fieldId)?.name ?? 'Field'} ${rangeText(range, String)}`;
    chips.push({ id: `fieldRanges:${range.fieldId}`, label });
  }
  return chips;
}

/** The filters without the one a structuredFilterChips id names; emptied keys are dropped. */
export function withoutStructuredFilter<T extends StructuredLibraryFilters>(
  filters: T,
  id: string,
): T {
  const [group, key, value] = id.split(':');
  const next: T = { ...filters };
  if (group === 'families') {
    next.families = filters.families?.filter((family) => family !== key);
  } else if (group === 'ranges') {
    const ranges: LibraryRangeFilters = { ...filters.ranges };
    delete ranges[key as keyof LibraryRangeFilters];
    next.ranges = compactFilters(ranges);
  } else if (group === 'technical') {
    const technical: LibraryTechnicalFilters = { ...filters.technical };
    if (key === 'videoCodecs' || key === 'audioCodecs') {
      technical[key] = technical[key]?.filter((codec) => codec !== value);
    } else {
      delete technical[key as keyof LibraryTechnicalFilters];
    }
    next.technical = compactFilters(technical);
  } else if (group === 'fieldRanges') {
    next.fieldRanges = filters.fieldRanges?.filter((range) => range.fieldId !== key);
  }
  for (const name of ['families', 'ranges', 'technical', 'fieldRanges'] as const) {
    const entry = next[name];
    if (entry === undefined || (Array.isArray(entry) && entry.length === 0)) delete next[name];
  }
  return next;
}

export type LibrarySortOrder = {
  column: 'created_at' | 'updated_at' | 'file_name' | 'size_bytes' | 'duration_ms';
  ascending: boolean;
};

const SORT_ORDER_COLUMNS: Partial<Record<string, LibrarySortOrder['column']>> = {
  created: 'created_at',
  updated: 'updated_at',
  name: 'file_name',
  size: 'size_bytes',
  duration: 'duration_ms',
};

/** A plain PostgREST order for the sorts a single column answers; the rest need the RPC. */
export function getLibrarySortOrder(sort: LibrarySort): LibrarySortOrder {
  const cut = sort.lastIndexOf('_');
  const column = SORT_ORDER_COLUMNS[sort.slice(0, cut)];
  if (!column) throw new Error(`${sort} is available only through the cursor browse read model`);
  return { column, ascending: sort.slice(cut + 1) === 'asc' };
}

export type LibraryQueryInput = {
  brandId: string;
  collectionId?: string | null;
  source?: SourceFilterValue | null;
  kind?: KindFilterValue | null;
  tags?: readonly string[] | null;
  sort?: LibrarySort | null;
  offset?: number;
  limit?: number;
};

export function mediaTypeToKind(mediaType: LibraryMediaType): MediaKind | null {
  if (mediaType === 'image' || mediaType === 'video' || mediaType === 'audio') return mediaType;
  if (mediaType === 'project_file') return 'file';
  return null;
}

export function kindToMediaType(kind: MediaKind | null | undefined): LibraryMediaType {
  if (kind === 'image' || kind === 'video' || kind === 'audio') return kind;
  if (kind === 'file') return 'project_file';
  return 'all';
}

function setList(params: URLSearchParams, key: string, values: readonly string[]): void {
  if (values.length > 0) params.set(key, values.join(','));
}

function setJson(params: URLSearchParams, key: string, value: object | undefined): void {
  if (value && Object.keys(value).length > 0) params.set(key, JSON.stringify(value));
}

function jsonParam(value: string | null): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    // Handed on as-is so the schema refuses it by name instead of it silently widening a view.
    return value;
  }
}

/**
 * The structured browse fields as they come back off a URL, ready for
 * libraryBrowseQuerySchema — shared by the page, the browse route and the facets route so
 * the three can never read one filter three ways.
 */
export function libraryBrowseExtrasFromParams(get: (key: string) => string | null) {
  return {
    families: parseTagsParam(get('families')),
    ranges: jsonParam(get('ranges')),
    technical: jsonParam(get('technical')),
    fieldRanges: jsonParam(get('fieldRanges')) ?? [],
    thenBy: parseLibraryThenBy(get('thenBy')),
  };
}

/** Canonical URL/API representation shared by grid, board, and saved views. */
export function buildLibraryBrowseParams(
  query: LibraryBrowseQuery,
  options: { includeBrandId?: boolean; cursor?: string | null } = {},
): URLSearchParams {
  const params = new URLSearchParams();
  if (options.includeBrandId !== false) params.set('brandId', query.brandId);
  if (query.mediaType !== 'all') params.set('mediaType', query.mediaType);
  setList(params, 'createdWith', query.createdWith);
  setList(params, 'placements', query.placements);
  setList(params, 'tags', query.tags);
  setList(params, 'reviewStatuses', query.reviewStatuses);
  setList(params, 'ownerIds', query.ownerIds);
  setList(params, 'campaignIds', query.campaignIds);
  setList(params, 'projectIds', query.projectIds);
  setList(params, 'usageRights', query.usageRights);
  if (query.collectionId) params.set('collection', query.collectionId);
  if (query.used !== undefined && query.used !== null) params.set('used', String(query.used));
  if (query.shared !== undefined && query.shared !== null) {
    params.set('shared', String(query.shared));
  }
  if (query.leadingOnly) params.set('leadingOnly', 'true');
  if (query.templateOnly) params.set('templateOnly', 'true');
  if (query.destination) params.set('destination', query.destination);
  setList(params, 'aspectRatios', query.aspectRatios);
  if (query.previewFrame && query.previewFrame !== 'native') {
    params.set('frame', query.previewFrame);
  }
  setList(params, 'ratios', query.ratios);
  setList(params, 'fonts', query.fonts);
  if (query.search) params.set('search', query.search);
  setList(params, 'families', query.families);
  setJson(params, 'ranges', query.ranges);
  setJson(params, 'technical', query.technical);
  if (query.fieldRanges.length > 0) setJson(params, 'fieldRanges', query.fieldRanges);
  if (query.sort !== DEFAULT_LIBRARY_SORT) params.set('sort', query.sort);
  if (query.thenBy.length > 0) params.set('thenBy', formatLibraryThenBy(query.thenBy));
  if (query.sortFieldId) params.set('sortField', query.sortFieldId);
  if (query.performanceWindow !== 'd30') {
    params.set('performanceWindow', query.performanceWindow);
  }
  if (query.layout !== 'grid') params.set('layout', query.layout);
  if (query.boardGroupBy !== 'review_status') params.set('boardGroupBy', query.boardGroupBy);
  const cursor = options.cursor === undefined ? query.cursor : options.cursor;
  if (cursor) params.set('cursor', cursor);
  if (query.limit !== 48) params.set('limit', String(query.limit));
  return params;
}

// Build the query string for GET /api/library/assets. "all"/empty filters are
// omitted so the endpoint treats them as unset (no .eq applied server-side).
export function buildLibraryQuery(input: LibraryQueryInput): URLSearchParams {
  const params = new URLSearchParams({ brandId: input.brandId });
  if (input.collectionId) params.set('collectionId', input.collectionId);
  if (input.source && input.source !== 'all') params.set('source', input.source);
  if (input.kind && input.kind !== 'all') params.set('kind', input.kind);
  if (input.tags && input.tags.length > 0) params.set('tags', input.tags.join(','));
  if (input.sort && input.sort !== DEFAULT_LIBRARY_SORT) params.set('sort', input.sort);
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

/**
 * The search's review filter. The filter-bar statuses, a status typed into the query and the
 * chosen custom states are ONE choice, OR'd — the grid's semantics (reviewFilterOptions): a
 * base status matches its custom states too, a state only itself. A single status stays a
 * ranking-RPC argument; anything wider is a PostgREST `or` the route resolves to asset ids
 * (a new RPC argument would be an overload). Statuses are enum-checked and states are uuids,
 * so nothing user-typed reaches the filter string.
 */
export function searchReviewFilter(filters: MediaSearchFilters | undefined): {
  rpcStatus: MediaReviewStatus | null;
  orFilter: string | null;
} {
  const statuses = [
    ...new Set([
      ...(filters?.reviewStatuses ?? []),
      ...(filters?.reviewStatus ? [filters.reviewStatus] : []),
    ]),
  ];
  const states = filters?.reviewStateIds ?? [];
  if (states.length === 0 && statuses.length <= 1) {
    return { rpcStatus: statuses[0] ?? null, orFilter: null };
  }
  const parts = [
    ...(statuses.length > 0 ? [`review_status.in.(${statuses.join(',')})`] : []),
    ...(states.length > 0 ? [`review_state_id.in.(${states.join(',')})`] : []),
  ];
  return { rpcStatus: null, orFilter: parts.join(',') };
}

export function toSearchRpcFilters(filters: MediaSearchFilters | undefined): MediaSearchRpcFilters {
  return {
    filter_source: filters?.source ?? null,
    filter_kind: filters?.kind ?? null,
    filter_tags: filters?.tags && filters.tags.length > 0 ? filters.tags : null,
    filter_exclude_tags: [...HIDDEN_LIBRARY_TAGS],
    filter_collection_id: filters?.collectionId ?? null,
    filter_review_status: searchReviewFilter(filters).rpcStatus,
    // The route resolves fieldFilters against the DB and folds the result in;
    // absent them, both stay null and the RPCs behave exactly as before.
    filter_asset_ids: null,
    filter_exclude_asset_ids: null,
  };
}

export type LibraryTagOption = { tag: string; count: number };

// Distinct tag vocabulary with usage counts for the tag filter chips. Excludes the
// system tags that are hidden from default browse, sorts by count (ties alphabetical),
// caps the row so it stays a compact chip strip.
export function aggregateTagCounts(
  rows: readonly { tags: string[] | null }[],
  cap = 40,
): LibraryTagOption[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.tags ?? []) {
      const trimmed = tag.trim();
      if (!trimmed || HIDDEN_LIBRARY_TAGS.includes(trimmed)) continue;
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
