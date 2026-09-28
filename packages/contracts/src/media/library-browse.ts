import { z } from 'zod';
import { CAROUSEL_SLIDE_TAG } from '../competitor-spy/saveToLibrary';
import { libraryAspectRatioBinSchema, libraryPreviewFrameSchema } from './aspect-ratio';
import { mediaAssetSchema, mediaKindSchema, mediaReviewStatusSchema, mediaSourceSchema } from './asset';
import { classifyLibraryFileOrGeneric, type LibraryFormatFamily } from './asset-formats';
import { customFieldFilterSchema } from './custom-fields';
import { ELEMENT_REFERENCE_TAG } from './element';
import { dynamicRangeSchema } from './media-info';

/**
 * Keys the Library can order the whole brand by, each in either direction. The SQL
 * (media.library_browse_assets) owns the expression per key; an empty value sorts last
 * whichever way the key runs.
 */
export const LIBRARY_SORT_KEYS = [
  'created',
  'updated',
  'name',
  'size',
  'duration',
  'resolution',
  'frame_rate',
  'bit_rate',
  'video_bit_rate',
  'audio_bit_rate',
  'audio_sample_rate',
  'audio_channels',
  'bit_depth',
  'page_count',
  'format',
  'review',
  'comments',
  'usage',
  'performance',
] as const;
export type LibrarySortKey = (typeof LIBRARY_SORT_KEYS)[number];
export const librarySortDirectionSchema = z.enum(['asc', 'desc']);
export type LibrarySortDirection = z.infer<typeof librarySortDirectionSchema>;
type DirectionalLibrarySort = `${LibrarySortKey}_${LibrarySortDirection}`;

const LEGACY_LIBRARY_SORTS = [
  'most_used',
  'best_performing',
  'manual',
  // Sort by a custom field (`sortFieldId`).
  'field_asc',
  'field_desc',
] as const;

/** Stable URL/API values for ordering the creative library: `<key>_<dir>` plus the named ones. */
export const librarySortSchema = z.enum([
  ...LIBRARY_SORT_KEYS.flatMap((key) => [`${key}_desc`, `${key}_asc`] as const),
  ...LEGACY_LIBRARY_SORTS,
  // flatMap widens the tuple to an array; the values are exactly these literals.
] as unknown as [DirectionalLibrarySort, ...(DirectionalLibrarySort | (typeof LEGACY_LIBRARY_SORTS)[number])[]]);

export type LibrarySort = z.infer<typeof librarySortSchema>;

const FIELD_SORT_KEY_PATTERN =
  /^field:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One ordering key: a built-in, `manual` (collection order) or `field:<custom field id>`. */
export const librarySortSpecSchema = z
  .object({
    key: z.union([
      z.enum([...LIBRARY_SORT_KEYS, 'manual']),
      z.string().regex(FIELD_SORT_KEY_PATTERN),
    ]),
    dir: librarySortDirectionSchema,
  })
  .strict();
export type LibrarySortSpec = z.infer<typeof librarySortSpecSchema>;

/** Secondary keys after `sort`; three keys in all is what a person can still read. */
export const MAX_LIBRARY_THEN_BY = 2;

/**
 * Format groups — the Library's Format filter. Coarser than the registry's families
 * (asset-formats.ts), which exist to pick a preview strategy; a person filters by what
 * a file IS. The SQL twin is media.library_format_group (keep the two in step; the
 * contract test reads the migration to prove it).
 */
export const LIBRARY_FORMAT_GROUPS = [
  'video',
  'image',
  'audio',
  'document',
  'design',
  'model_3d',
  'html',
  'archive',
  'other',
] as const;
export const libraryFormatGroupSchema = z.enum(LIBRARY_FORMAT_GROUPS);
export type LibraryFormatGroup = z.infer<typeof libraryFormatGroupSchema>;

export const LIBRARY_FORMAT_GROUP_LABELS: Readonly<Record<LibraryFormatGroup, string>> = {
  video: 'Video',
  image: 'Image',
  audio: 'Audio',
  document: 'Document',
  design: 'Design',
  model_3d: '3D',
  html: 'HTML',
  archive: 'Archive',
  other: 'Other',
};

const FAMILY_FORMAT_GROUP: Readonly<Record<LibraryFormatFamily, LibraryFormatGroup>> = {
  raster_image: 'image',
  video: 'video',
  broadcast_video: 'video',
  container_video: 'video',
  audio: 'audio',
  document: 'document',
  office_document: 'document',
  design_source: 'design',
  after_effects: 'design',
  after_effects_package: 'design',
  premiere_project: 'design',
  model_3d: 'model_3d',
  html_bundle: 'html',
  font: 'other',
  generic: 'other',
};

/** Compressed containers the registry has no family for; a .zip is decided by its contents. */
export const LIBRARY_ARCHIVE_EXTENSIONS = ['rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'] as const;

/**
 * The group an asset files under. A playable kind is authoritative (a Reel is a video
 * whatever its name); a file goes by the registry. A .zip is Design when it parsed as an
 * After Effects package, HTML when it carries an `html_bundle` rendition, else Archive.
 */
export function libraryFormatGroupOf(asset: {
  kind: z.infer<typeof mediaKindSchema>;
  fileName: string;
  mimeType?: string | null;
  zip?: 'aep_package' | 'html_bundle' | null;
}): LibraryFormatGroup {
  if (asset.kind !== 'file') return asset.kind;
  const extension = asset.fileName.trim().toLowerCase().split('.').pop() ?? '';
  if (extension === 'zip') {
    if (asset.zip === 'html_bundle') return 'html';
    return asset.zip === 'aep_package' ? 'design' : 'archive';
  }
  if ((LIBRARY_ARCHIVE_EXTENSIONS as readonly string[]).includes(extension)) return 'archive';
  return FAMILY_FORMAT_GROUP[classifyLibraryFileOrGeneric(asset).family];
}

const rangeBound = z.number().finite();
/** Inclusive at both ends; either end may be open. */
export const libraryNumericRangeSchema = z
  .object({ min: rangeBound.optional(), max: rangeBound.optional() })
  .strict()
  .refine((range) => range.min !== undefined || range.max !== undefined, {
    message: 'A range needs a min or a max',
  })
  .refine((range) => range.min === undefined || range.max === undefined || range.min <= range.max, {
    message: 'min must not exceed max',
  });
export type LibraryNumericRange = z.infer<typeof libraryNumericRangeSchema>;

/** `after` inclusive, `before` exclusive — the NL parser's createdAfter/createdBefore window. */
export const libraryDateRangeSchema = z
  .object({
    after: z.string().datetime({ offset: true }).optional(),
    before: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((range) => range.after !== undefined || range.before !== undefined, {
    message: 'A date range needs after or before',
  });
export type LibraryDateRange = z.infer<typeof libraryDateRangeSchema>;

/**
 * Ranges over the asset row. `resolution` is the SHORT edge in pixels, so 4K is 2160 and
 * 1080p is 1080 whichever way the frame is held. Units are the columns': ms, bits/s, bytes, Hz.
 */
export const libraryRangeFiltersSchema = z
  .object({
    durationMs: libraryNumericRangeSchema.optional(),
    resolution: libraryNumericRangeSchema.optional(),
    frameRate: libraryNumericRangeSchema.optional(),
    bitRate: libraryNumericRangeSchema.optional(),
    sizeBytes: libraryNumericRangeSchema.optional(),
    pageCount: libraryNumericRangeSchema.optional(),
    audioSampleRate: libraryNumericRangeSchema.optional(),
    audioChannels: libraryNumericRangeSchema.optional(),
    bitDepth: libraryNumericRangeSchema.optional(),
    createdAt: libraryDateRangeSchema.optional(),
    updatedAt: libraryDateRangeSchema.optional(),
  })
  .strict();
export type LibraryRangeFilters = z.infer<typeof libraryRangeFiltersSchema>;

/**
 * Codec families. The prober may name a codec several ways (Mediabunny `avc`, a fourcc
 * `apch`, ffprobe `h264`); the SQL folds each alias to its family before comparing, so a
 * filter names the family. Lists here and in media.library_codec_family must agree.
 */
export const VIDEO_CODEC_FAMILIES = {
  h264: { label: 'H.264', aliases: ['h264', 'avc', 'avc1', 'avc3', 'h.264'] },
  hevc: { label: 'HEVC (H.265)', aliases: ['hevc', 'h265', 'hvc1', 'hev1', 'h.265'] },
  prores: {
    label: 'ProRes',
    aliases: ['prores', 'apch', 'apcn', 'apcs', 'apco', 'ap4h', 'ap4x', 'aprh', 'aprn'],
  },
  av1: { label: 'AV1', aliases: ['av1', 'av01'] },
  vp9: { label: 'VP9', aliases: ['vp9', 'vp09'] },
  vp8: { label: 'VP8', aliases: ['vp8', 'vp08'] },
  dnxhd: { label: 'DNxHD / DNxHR', aliases: ['dnxhd', 'dnxhr', 'avdn', 'avdh'] },
  mpeg2: { label: 'MPEG-2', aliases: ['mpeg2', 'mpeg2video', 'mp2v'] },
  mjpeg: { label: 'Motion JPEG', aliases: ['mjpeg', 'mjpg', 'jpeg'] },
} as const satisfies Record<string, { label: string; aliases: readonly string[] }>;
export type VideoCodecFamily = keyof typeof VIDEO_CODEC_FAMILIES;

export const AUDIO_CODEC_FAMILIES = {
  aac: { label: 'AAC', aliases: ['aac', 'mp4a'] },
  mp3: { label: 'MP3', aliases: ['mp3', 'mpga', 'mp3float'] },
  pcm: {
    label: 'PCM (uncompressed)',
    aliases: ['pcm', 'lpcm', 'sowt', 'twos', 'in24', 'in32', 'fl32', 'fl64'],
  },
  flac: { label: 'FLAC', aliases: ['flac', 'fla'] },
  opus: { label: 'Opus', aliases: ['opus'] },
  vorbis: { label: 'Vorbis', aliases: ['vorbis'] },
  alac: { label: 'ALAC', aliases: ['alac'] },
  ac3: { label: 'Dolby Digital (AC-3)', aliases: ['ac3', 'ac-3'] },
  eac3: { label: 'Dolby Digital Plus (E-AC-3)', aliases: ['eac3', 'e-ac-3', 'ec-3', 'ec3'] },
  dts: { label: 'DTS', aliases: ['dts', 'dca'] },
} as const satisfies Record<string, { label: string; aliases: readonly string[] }>;
export type AudioCodecFamily = keyof typeof AUDIO_CODEC_FAMILIES;

function codecFamily(
  families: Record<string, { aliases: readonly string[] }>,
  raw: string | null | undefined,
): string | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  // `pcm-s16`/`pcm_s24le`, `mp4a.40.2`, `prores_ks`: a prefix names the family.
  const head =
    ['pcm', 'prores'].find((prefix) => value.startsWith(prefix)) ??
    (value.startsWith('mp4a.') ? 'mp4a' : value);
  for (const [family, { aliases }] of Object.entries(families)) {
    if ((aliases as readonly string[]).includes(head)) return family;
  }
  return value;
}

/** The family a stored video codec belongs to, or the raw value lowercased when unknown. */
export const videoCodecFamily = (raw: string | null | undefined) =>
  codecFamily(VIDEO_CODEC_FAMILIES, raw);
/** The family a stored audio codec belongs to, or the raw value lowercased when unknown. */
export const audioCodecFamily = (raw: string | null | undefined) =>
  codecFamily(AUDIO_CODEC_FAMILIES, raw);

/** HDR in one word — every transfer that is not SDR. */
export const HDR_DYNAMIC_RANGES = ['hdr10', 'hlg', 'dolby_vision', 'hdr10plus'] as const;

/** Categorical technical predicates. A codec is named by its family key (or a raw codec). */
export const libraryTechnicalFiltersSchema = z
  .object({
    videoCodecs: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).optional(),
    audioCodecs: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).optional(),
    dynamicRanges: z.array(dynamicRangeSchema).max(6).optional(),
    hasAlpha: z.boolean().optional(),
    hasLocation: z.boolean().optional(),
  })
  .strict();
export type LibraryTechnicalFilters = z.infer<typeof libraryTechnicalFiltersSchema>;

const fieldRangeBound = z.union([z.number().finite(), z.string().trim().min(1).max(40)]);
/**
 * A range over a custom field. Numbers and ratings compare as numbers; a single select or
 * status compares its option's 1-based position (the seeded ★ Rating's "4+" is min 4);
 * a date compares as its ISO text.
 */
export const libraryFieldRangeSchema = z
  .object({
    fieldId: z.string().uuid(),
    min: fieldRangeBound.optional(),
    max: fieldRangeBound.optional(),
  })
  .strict()
  .refine((range) => range.min !== undefined || range.max !== undefined, {
    message: 'A field range needs a min or a max',
  });
export type LibraryFieldRange = z.infer<typeof libraryFieldRangeSchema>;

export const DEFAULT_LIBRARY_SORT: LibrarySort = 'created_desc';

export const libraryMediaTypeSchema = z.enum([
  'all',
  'image',
  'video',
  'carousel',
  'project_file',
  'audio',
]);
export type LibraryMediaType = z.infer<typeof libraryMediaTypeSchema>;

export const libraryPlacementSchema = z.enum(['reel', 'story', 'feed', 'ad', 'other']);
export type LibraryPlacement = z.infer<typeof libraryPlacementSchema>;

export const libraryPerformanceWindowSchema = z.enum(['d7', 'd14', 'd30']);
export type LibraryPerformanceWindow = z.infer<typeof libraryPerformanceWindowSchema>;

// grid = cards, list = sortable metadata table, board = lanes by a status field,
// reel = one asset full-bleed at a time, stepped with the arrow keys.
export const libraryLayoutSchema = z.enum(['grid', 'list', 'board', 'reel']);
export type LibraryLayout = z.infer<typeof libraryLayoutSchema>;

/**
 * Role views. `everything` is the old "All assets" creatives-only dump — not the
 * landing. `jobs` is a tray, not a browse destination.
 */
export const libraryBrowseDestinationSchema = z.enum([
  'home',
  'canvas',
  'elements',
  'sources',
  'templates',
  'review',
  'everything',
  'images',
  'videos',
  'typography',
  'pipelines',
]);
export type LibraryBrowseDestination = z.infer<typeof libraryBrowseDestinationSchema>;

export const libraryBrowseQuerySchema = z
  .object({
    brandId: z.string().uuid(),
    mediaType: libraryMediaTypeSchema.default('all'),
    createdWith: z.array(mediaSourceSchema).default([]),
    placements: z.array(libraryPlacementSchema).default([]),
    tags: z.array(z.string().min(1)).default([]),
    reviewStatuses: z.array(mediaReviewStatusSchema).default([]),
    ownerIds: z.array(z.string().uuid()).default([]),
    campaignIds: z.array(z.string().min(1)).default([]),
    /**
     * Project scope — assets tagged into any of these `brand_profiles.projects`.
     *
     * uuid rather than `min(1)` like `campaignIds`, because the RPC argument is `uuid[]`:
     * a non-uuid reaches Postgres as a cast error rather than an empty result.
     */
    projectIds: z.array(z.string().uuid()).default([]),
    usageRights: z.array(z.enum(['owned', 'licensed', 'restricted', 'expired'])).default([]),
    collectionId: z.string().uuid().nullable().optional(),
    used: z.boolean().nullable().optional(),
    shared: z.boolean().nullable().optional(),
    leadingOnly: z.boolean().default(false),
    /**
     * Restrict to assets we have opened and understood — the Templates section.
     *
     * Not the same as `mediaType: 'project_file'`, and the difference is the point: an .aep
     * whose parse has not landed is still just bytes and belongs in Source files. A template
     * is a project file plus what is inside it.
     */
    templateOnly: z.boolean().default(false),
    /**
     * Role view. Absent means the caller is still on the legacy mediaType/sort
     * URL; the page maps that onto a destination. New navigation sends this.
     */
    destination: libraryBrowseDestinationSchema.optional(),
    /** Home shelves for creatives (not template comps — those stay `ratios`). */
    aspectRatios: z.array(libraryAspectRatioBinSchema).default([]),
    /**
     * Cover-crop the grid into a device frame. Independent of `aspectRatios`
     * (native-size filter) and of `placements` (where the creative ran as an ad).
     */
    previewFrame: libraryPreviewFrameSchema.default('native'),
    /** Aspect-ratio labels a template must carry ('9:16'), matched as overlap. */
    ratios: z.array(z.string().min(1)).default([]),
    /** Font families a template uses, matched as overlap. */
    fonts: z.array(z.string().min(1)).default([]),
    search: z.string().max(500).default(''),
    /** Format groups, OR'd. Naming any lifts the default browse's hiding of source files. */
    families: z.array(libraryFormatGroupSchema).max(LIBRARY_FORMAT_GROUPS.length).default([]),
    ranges: libraryRangeFiltersSchema.optional(),
    technical: libraryTechnicalFiltersSchema.optional(),
    /** The brand's custom review states, OR'd with `reviewStatuses` (a base status matches its states too). */
    reviewStateIds: z.array(z.string().uuid()).max(50).default([]),
    fieldFilters: z.array(customFieldFilterSchema).max(20).default([]),
    fieldRanges: z.array(libraryFieldRangeSchema).max(10).default([]),
    sort: librarySortSchema.default(DEFAULT_LIBRARY_SORT),
    /** Tie-breaking keys after `sort`, in order. */
    thenBy: z.array(librarySortSpecSchema).max(MAX_LIBRARY_THEN_BY).default([]),
    performanceWindow: libraryPerformanceWindowSchema.default('d30'),
    layout: libraryLayoutSchema.default('grid'),
    boardGroupBy: z.string().min(1).max(100).default('review_status'),
    /** The custom field a `field_asc` / `field_desc` sort orders by. */
    sortFieldId: z.string().uuid().nullable().optional(),
    cursor: z.string().min(1).nullable().optional(),
    limit: z.number().int().min(1).max(96).default(48),
  })
  .strict();
export type LibraryBrowseQuery = z.infer<typeof libraryBrowseQuerySchema>;

const NAMED_SORT_SPECS: Readonly<Record<string, LibrarySortSpec>> = {
  most_used: { key: 'usage', dir: 'desc' },
  best_performing: { key: 'performance', dir: 'desc' },
  manual: { key: 'manual', dir: 'asc' },
};

/**
 * The ordering media.library_browse_assets receives: `sort`, then `thenBy`, each key once.
 * A field sort without its field falls back to newest first rather than a half-formed key.
 */
export function libraryBrowseSortSpecs(
  query: Pick<LibraryBrowseQuery, 'sort' | 'sortFieldId' | 'thenBy'>,
): LibrarySortSpec[] {
  const primary: LibrarySortSpec =
    NAMED_SORT_SPECS[query.sort] ??
    (query.sort === 'field_asc' || query.sort === 'field_desc'
      ? query.sortFieldId
        ? { key: `field:${query.sortFieldId}`, dir: query.sort === 'field_asc' ? 'asc' : 'desc' }
        : { key: 'created', dir: 'desc' }
      : {
          key: query.sort.slice(0, query.sort.lastIndexOf('_')) as LibrarySortKey,
          dir: query.sort.endsWith('_asc') ? 'asc' : 'desc',
        });
  const specs = [primary];
  for (const spec of query.thenBy ?? []) {
    if (!specs.some((existing) => existing.key === spec.key)) specs.push(spec);
  }
  return specs;
}

/** The URL form of `thenBy`: `size:asc,duration:desc`. */
export function formatLibraryThenBy(specs: readonly LibrarySortSpec[]): string {
  return specs.map((spec) => `${spec.key}:${spec.dir}`).join(',');
}

/** Inverse of formatLibraryThenBy; an unreadable entry is dropped, never guessed at. */
export function parseLibraryThenBy(value: string | null | undefined): LibrarySortSpec[] {
  if (!value) return [];
  return value
    .split(',')
    .flatMap((part) => {
      const cut = part.lastIndexOf(':');
      const parsed = librarySortSpecSchema.safeParse({
        key: part.slice(0, cut).trim(),
        dir: part.slice(cut + 1).trim(),
      });
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, MAX_LIBRARY_THEN_BY);
}

/** The filter keys media.library_browse_assets reads from p_query (and a smart query may save). */
export const LIBRARY_BROWSE_FILTER_KEYS = [
  'mediaType',
  'createdWith',
  'placements',
  'tags',
  'reviewStatuses',
  'reviewStateIds',
  'ownerIds',
  'campaignIds',
  'projectIds',
  'usageRights',
  'used',
  'shared',
  'leadingOnly',
  'templateOnly',
  'destination',
  'aspectRatios',
  'ratios',
  'fonts',
  'search',
  'performanceWindow',
  'families',
  'ranges',
  'technical',
  'fieldFilters',
  'fieldRanges',
] as const satisfies readonly (keyof LibraryBrowseQuery)[];

/**
 * p_query for media.library_browse_assets / library_browse_facet_counts: the filters only,
 * with every empty one dropped so the SQL builds no predicate for it. One mapping for the
 * route, the page and the bench — a copy is where a renamed key silently stops filtering.
 */
export function libraryBrowseRpcQuery(query: LibraryBrowseQuery): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of LIBRARY_BROWSE_FILTER_KEYS) {
    const value = query[key];
    if (value === undefined || value === null || value === false || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (key === 'mediaType' && value === 'all') continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
      continue;
    }
    out[key] = value;
  }
  // `used: false` / `shared: false` are real filters ("unused"), unlike leadingOnly: false.
  if (query.used === false) out.used = false;
  if (query.shared === false) out.shared = false;
  return out;
}

export const libraryFacetCountSchema = z
  .object({ value: z.string().min(1), count: z.number().int().nonnegative() })
  .strict();

export const libraryBrowseFacetsSchema = z
  .object({
    mediaTypes: z.array(libraryFacetCountSchema),
    createdWith: z.array(libraryFacetCountSchema),
    placements: z.array(libraryFacetCountSchema),
    tags: z.array(libraryFacetCountSchema),
    reviewStatuses: z.array(libraryFacetCountSchema),
    /** Custom review state ids (media.review_custom_states), each counted on its own. */
    reviewStates: z.array(libraryFacetCountSchema).default([]),
    /** Format groups, counted with every filter except the Format filter itself. */
    families: z.array(libraryFacetCountSchema).default([]),
  })
  .strict();
export type LibraryBrowseFacets = z.infer<typeof libraryBrowseFacetsSchema>;

export const libraryBrowsePageSchema = z
  .object({
    items: z.array(mediaAssetSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type LibraryBrowsePage = z.infer<typeof libraryBrowsePageSchema>;

/** Days a soft-deleted asset stays restorable from the Library's Trash view. */
export const LIBRARY_TRASH_RETENTION_DAYS = 30;

// A soft-deleted asset as the Trash view lists it. deletedAt rides beside the asset
// because the asset shape itself never carries deletion state.
export const libraryTrashItemSchema = z
  .object({ asset: mediaAssetSchema, deletedAt: z.string() })
  .strict();
export type LibraryTrashItem = z.infer<typeof libraryTrashItemSchema>;

export const libraryTrashPageSchema = z.object({ items: z.array(libraryTrashItemSchema) }).strict();
export type LibraryTrashPage = z.infer<typeof libraryTrashPageSchema>;

// System tags whose assets are real Library rows but do NOT belong in a default browse:
// they are components of something else the grid already shows, or machinery the user
// never asked to see.
//
//   carousel-slide    — the non-cover slides of a saved carousel; the cover already
//                       occupies one browse slot for the whole set.
//   element-reference — the generated reference image behind an Element; a brand with
//                       twenty Elements would otherwise find its Library full of
//                       near-identical studio shots.
//
// One list rather than a literal per call site: this was previously restated at four
// sites (backend libraryManage + metadataSearch, frontend filters + carousel), which is
// four chances for them to disagree about what "default browse" means. Search and the
// agent-facing tools still reach these assets — hidden is not deleted.
export const HIDDEN_LIBRARY_TAGS: readonly string[] = [CAROUSEL_SLIDE_TAG, ELEMENT_REFERENCE_TAG];

/** PostgREST array literal for a `not('tags','ov',…)` overlap exclusion. */
export const HIDDEN_LIBRARY_TAGS_FILTER = `{${HIDDEN_LIBRARY_TAGS.join(',')}}`;
