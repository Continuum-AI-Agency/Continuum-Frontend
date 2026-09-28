import { z } from 'zod';
import { type MediaKind, mediaKindSchema, mediaReviewStatusSchema } from './asset';
import { classifyLibraryFileOrGeneric } from './asset-formats';
import { mediaAssetTechnicalFieldsSchema } from './media-info';

export const libraryAssetRefSchema = z
  .object({
    asset_id: z.string().uuid(),
    version_id: z.string().uuid().optional(),
  })
  .strict();
export type LibraryAssetRef = z.infer<typeof libraryAssetRefSchema>;

export const pinnedLibraryAssetRefSchema = libraryAssetRefSchema.extend({
  version_id: z.string().uuid(),
});
export type PinnedLibraryAssetRef = z.infer<typeof pinnedLibraryAssetRefSchema>;

// Image-specific names remain as compatibility aliases for the upload and
// generation surfaces that intentionally accept images only.
export const libraryImageRefSchema = libraryAssetRefSchema;
export type LibraryImageRef = LibraryAssetRef;
export const pinnedLibraryImageRefSchema = pinnedLibraryAssetRefSchema;
export type PinnedLibraryImageRef = z.infer<typeof pinnedLibraryImageRefSchema>;

export const completeMcpUploadIntentRequestSchema = z
  .object({
    action: z.literal('complete_mcp_upload_intent'),
    brandId: z.string().uuid(),
    uploadIntentId: z.string().uuid(),
    assetRefs: z.array(pinnedLibraryImageRefSchema).min(1).max(8),
  })
  .strict();

export const completeMcpUploadIntentResponseSchema = z
  .object({
    upload_intent_id: z.string().uuid(),
    status: z.literal('completed'),
    asset_refs: z.array(pinnedLibraryImageRefSchema).min(1).max(8),
    updated_at: z.string(),
  })
  .strict();

// ─── Canvas ↔ Library ──────────────────────────────────────────────────────────────
// What a canvas node knows about the Library asset it holds, read in ONE brand-scoped
// call per room: media.canvas_library_context(p_brand_id, p_asset_ids, p_version_ids).
// The jsonb it returns IS this schema (camelCase keys written by the SQL).

/** Per-call cap, mirrored by the SQL: a room with more Library nodes reads in pages. */
export const CANVAS_LIBRARY_CONTEXT_MAX_IDS = 500;

const optionalCount = () => z.number().int().nonnegative().nullable().optional();

export const canvasLibraryRenditionSchema = z.object({
  role: z.string().min(1),
  bucket: z.string().min(1),
  storagePath: z.string().min(1),
  mimeType: z.string().min(1),
  width: optionalCount(),
  height: optionalCount(),
  durationMs: optionalCount(),
});
export type CanvasLibraryRendition = z.infer<typeof canvasLibraryRenditionSchema>;

export const canvasLibraryVersionContextSchema = z.object({
  id: z.string().uuid(),
  assetId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  bucket: z.string().min(1),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  width: optionalCount(),
  height: optionalCount(),
  durationMs: optionalCount(),
  reviewStatus: mediaReviewStatusSchema.nullable().optional(),
  /** Ready display renditions only (see CANVAS_DISPLAY_RENDITION_ROLES). */
  renditions: z.array(canvasLibraryRenditionSchema).default([]),
});
export type CanvasLibraryVersionContext = z.infer<typeof canvasLibraryVersionContextSchema>;

export const canvasLibraryAssetContextSchema = z.object({
  id: z.string().uuid(),
  kind: mediaKindSchema,
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  title: z.string().nullable().optional(),
  reviewStatus: mediaReviewStatusSchema.catch('none'),
  /** The brand's own name/colour for the status: a custom state, else the brand label. */
  reviewLabel: z.string().nullable().optional(),
  reviewColor: z.string().nullable().optional(),
  headVersionId: z.string().uuid().nullable(),
  headVersionNumber: z.number().int().positive().nullable(),
  commentCount: z.number().int().nonnegative(),
  /** Top-level comments that are not resolved — the Frame.io "open threads" count. */
  openThreadCount: z.number().int().nonnegative(),
  width: optionalCount(),
  height: optionalCount(),
  durationMs: optionalCount(),
  sizeBytes: optionalCount(),
  deletedAt: z.string().nullable().optional(),
  updatedAt: z.string(),
  ...mediaAssetTechnicalFieldsSchema.shape,
});
export type CanvasLibraryAssetContext = z.infer<typeof canvasLibraryAssetContextSchema>;

export const canvasLibraryContextSchema = z.object({
  assets: z.array(canvasLibraryAssetContextSchema).default([]),
  /** Every requested version plus each asset's head. */
  versions: z.array(canvasLibraryVersionContextSchema).default([]),
});
export type CanvasLibraryContext = z.infer<typeof canvasLibraryContextSchema>;

/** The renditions the canvas may draw in place of an original it cannot. */
export const CANVAS_DISPLAY_RENDITION_ROLES = [
  'preview_image',
  'preview_video',
  'proxy_1080',
  'proxy_540',
  'proxy_360',
  'proxy_2160',
  'audio_proxy',
  'model_poster',
  'page_1',
] as const;

const VIDEO_PROXY_ORDER = ['preview_video', 'proxy_1080', 'proxy_540', 'proxy_360', 'proxy_2160'];
const STILL_PREVIEW_ORDER = ['preview_image', 'page_1', 'model_poster'];

export type CanvasLibraryNodeType = 'image' | 'video' | 'audio' | 'document';

/** Which file a canvas node shows for a Library version, and as which node. */
export type CanvasLibrarySource = {
  nodeType: CanvasLibraryNodeType;
  bucket: string;
  storagePath: string;
  mimeType: string;
  /** Null when the node shows the original; else the rendition it shows instead. */
  renditionRole: string | null;
};

export type CanvasLibrarySourceInput = {
  kind: MediaKind;
  fileName: string;
  mimeType: string;
  bucket: string;
  storagePath: string;
  renditions: readonly CanvasLibraryRendition[];
};

/**
 * The canvas holds a live link to asset + version, but draws what a browser can draw:
 * the original when it is native, else the Library's own rendition — the flattened
 * `preview_image` of a PSD/AI/EPS, `page_1` of an InDesign file, the `model_poster` of a
 * 3D file, the H.264 proxy of MKV/AVI/MXF, the `audio_proxy` of AIFF/WMA. Null when the
 * version has nothing drawable yet (a proxy still rendering, an Office file).
 */
export function canvasLibrarySource(input: CanvasLibrarySourceInput): CanvasLibrarySource | null {
  const format = classifyLibraryFileOrGeneric({
    fileName: input.fileName,
    mimeType: input.mimeType,
  });
  const original = (nodeType: CanvasLibraryNodeType): CanvasLibrarySource => ({
    nodeType,
    bucket: input.bucket,
    storagePath: input.storagePath,
    mimeType: input.mimeType,
    renditionRole: null,
  });
  const rendition = (
    nodeType: CanvasLibraryNodeType,
    order: readonly string[],
  ): CanvasLibrarySource | null => {
    for (const role of order) {
      const match = input.renditions.find((candidate) => candidate.role === role);
      if (match) {
        return {
          nodeType,
          bucket: match.bucket,
          storagePath: match.storagePath,
          mimeType: match.mimeType,
          renditionRole: role,
        };
      }
    }
    return null;
  };

  if (format.previewStrategy === 'native' || format.previewStrategy === 'browser_video') {
    if (format.family === 'raster_image') return original('image');
    if (format.family === 'video') return original('video');
    if (format.family === 'audio') return original('audio');
    if (format.family === 'document') return original('document');
  }
  if (format.previewStrategy === 'proxy_transcode') {
    return format.originalKind === 'audio'
      ? rendition('audio', ['audio_proxy'])
      : rendition('video', VIDEO_PROXY_ORDER);
  }
  if (input.mimeType === 'text/plain') return original('document');
  // Unregistered but plainly native (a Library row older than the registry).
  if (format.family === 'generic') {
    if (input.kind === 'image' && input.mimeType.startsWith('image/')) return original('image');
    if (input.kind === 'video' && input.mimeType.startsWith('video/')) return original('video');
    if (input.kind === 'audio' && input.mimeType.startsWith('audio/')) return original('audio');
  }
  return rendition('image', STILL_PREVIEW_ORDER);
}

/** A canvas node's pin against the Library's current state. */
export type CanvasLibraryDrift = {
  /** The Library head moved past the version the node holds. */
  newerVersion: boolean;
  /** The review decision differs from the one the node last acknowledged. */
  decisionChanged: boolean;
  /** The asset was deleted (trashed) in the Library. */
  deleted: boolean;
};

export function canvasLibraryDrift(input: {
  pinnedVersionId: string | null | undefined;
  acknowledgedReviewStatus: string | null | undefined;
  asset: Pick<CanvasLibraryAssetContext, 'headVersionId' | 'reviewStatus' | 'deletedAt'>;
}): CanvasLibraryDrift {
  const { asset } = input;
  return {
    newerVersion: Boolean(
      input.pinnedVersionId && asset.headVersionId && input.pinnedVersionId !== asset.headVersionId,
    ),
    decisionChanged: Boolean(
      input.acknowledgedReviewStatus && input.acknowledgedReviewStatus !== asset.reviewStatus,
    ),
    deleted: Boolean(asset.deletedAt),
  };
}

// ─── Lineage from the version a canvas node pinned ─────────────────────────────────
// media.record_canvas_lineage(p_brand_id, p_derived_version_id, p_operation, p_sources,
// p_parameters): the Library's register paths credit a source's HEAD at the moment of
// registration; the canvas knows which version it actually used and says so here.

export const CANVAS_LINEAGE_OPERATIONS = ['canvas_generation', 'canvas_revision'] as const;
export const canvasLineageOperationSchema = z.enum(CANVAS_LINEAGE_OPERATIONS);
export type CanvasLineageOperation = z.infer<typeof canvasLineageOperationSchema>;

export const canvasLineageParametersSchema = z
  .object({
    roomId: z.string().uuid().nullable().optional(),
    nodeId: z.string().min(1).max(200).nullable().optional(),
    /** The canvas output asset a revision was promoted from, when it had its own row. */
    outputAssetId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type CanvasLineageParameters = z.infer<typeof canvasLineageParametersSchema>;

export const recordCanvasLineageRequestSchema = z
  .object({
    p_brand_id: z.string().uuid(),
    p_derived_version_id: z.string().uuid(),
    p_operation: canvasLineageOperationSchema,
    p_sources: z.array(pinnedLibraryAssetRefSchema).min(1).max(50),
    p_parameters: canvasLineageParametersSchema.default({}),
  })
  .strict();
export type RecordCanvasLineageRequest = z.input<typeof recordCanvasLineageRequestSchema>;

/** Where the Library links back to: the room + node an asset or version was made in. */
export function canvasDeepLink(params: { roomId: string; nodeId?: string | null }): string {
  const query = new URLSearchParams({ roomId: params.roomId });
  if (params.nodeId) query.set('focusNodeId', params.nodeId);
  return `/ai-studio?${query.toString()}`;
}
