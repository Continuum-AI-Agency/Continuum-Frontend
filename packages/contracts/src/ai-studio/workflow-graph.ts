import { z } from 'zod';
import { actionDef, actionInputPort, actionOutputModality, isActionId } from './action-registry';
import { API_RENDER_MEDIA_LIST_MAX } from './api-renders';
import { type BatchItemKind, batchItemType, MAX_BATCH_ITEMS } from './batch-node';
import {
  coerceImageSize,
  DEFAULT_IMAGE_GENERATOR_MODEL,
  DEFAULT_IMAGE_SIZE,
  isImageGeneratorModel,
} from './image-size';
import {
  type GeneratorNodeBounds,
  generatorNodeStyle,
  IMAGE_GENERATOR_NODE_BOUNDS,
  LAYER_EDITOR_NODE_BOUNDS,
  OMNI_GENERATOR_NODE_BOUNDS,
  VIDEO_GENERATOR_NODE_BOUNDS,
} from './node-sizing';

// Canonical AI Studio canvas graph rules — node-type vocabulary, handle
// compatibility, connection limits, and media↔handle compatibility. Ported from
// the Frontend StudioCanvas (isValidConnection / videoModel / connectionValidation
// / createNodeConfig) so the Backend MCP tool validates exactly what the canvas
// accepts and the Frontend delegates to one source of truth.

export const STUDIO_NODE_TYPES = [
  'string',
  'nanoGen',
  'videoGen',
  'veoDirector',
  'veoFast',
  'extendVideo',
  'timelineEditor',
  'hyperframesAgent',
  'plannerDraft',
  'organicPublish',
  'paidPublisher',
  'apiRender',
  'omniGen',
  'image',
  'video',
  'audio',
  'document',
  'videoDecode',
  'frameExtract',
  // Canvas-only until now: `note` lived in StudioCanvas.tsx alone, so any canvas
  // carrying one failed validateWorkflowGraph and no agent could add one. Contracts
  // entry closes that drift; the node still wires to nothing and never runs.
  'note',
  // Canvas V3 runtime vocabulary. `action` / `batch` / `router` / `export` /
  // `layerEditor` execute; `element` / `designRef` emit references and gain their
  // runtimes in later waves.
  'action',
  'batch',
  'router',
  'export',
  'layerEditor',
  'element',
  'designRef',
] as const;

export type StudioNodeType = (typeof STUDIO_NODE_TYPES)[number];
export const studioNodeTypeEnum = z.enum(STUDIO_NODE_TYPES);

export const isStudioNodeType = (type?: string): type is StudioNodeType =>
  typeof type === 'string' && (STUDIO_NODE_TYPES as readonly string[]).includes(type);

// Structural shapes the validators operate on — deliberately loose so the
// Frontend xyflow Node/Edge/Connection types satisfy them without an adapter.
export interface GraphNodeLike {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
}
export interface GraphEdgeLike {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}
export type GraphConnectionLike = Omit<GraphEdgeLike, 'id'>;

export const CONNECTION_VALIDATION_CODES = [
  'valid',
  'missing_node',
  'self_connection',
  'duplicate_connection',
  'cycle',
  'unknown_source_port',
  'unknown_target_port',
  'source_has_no_output',
  'target_at_capacity',
  'incompatible_data_type',
] as const;

export type ConnectionValidationCode = (typeof CONNECTION_VALIDATION_CODES)[number];

export interface ConnectionValidationResult {
  valid: boolean;
  code: ConnectionValidationCode;
  message: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}

export type StudioPortDirection = 'input' | 'output';
export const studioPortDataTypeSchema = z.enum([
  'text',
  'image',
  'video',
  'audio',
  'document',
  'media',
]);
export type StudioPortDataType = z.infer<typeof studioPortDataTypeSchema>;

export interface StudioPortMetadata {
  id: string;
  name: string;
  direction: StudioPortDirection;
  dataType: StudioPortDataType;
  required: boolean;
  connectionCount: number;
  maxConnections?: number;
}

const recordSchema = z.record(z.string(), z.unknown());

export const studioNodeSchema = z.object({
  id: z.string(),
  type: studioNodeTypeEnum,
  position: z.object({ x: z.number(), y: z.number() }),
  data: recordSchema.default({}),
  style: recordSchema.optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const studioEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  type: z.string().optional(),
  data: recordSchema.optional(),
  className: z.string().optional(),
});

export const studioWorkflowGraphSchema = z.object({
  nodes: z.array(studioNodeSchema),
  edges: z.array(studioEdgeSchema),
  metadata: recordSchema.optional(),
});

export type StudioGraphNode = z.infer<typeof studioNodeSchema>;
export type StudioGraphEdge = z.infer<typeof studioEdgeSchema>;
export type StudioWorkflowGraph = z.infer<typeof studioWorkflowGraphSchema>;

// ---------------------------------------------------------------------------
// Video generator models
// ---------------------------------------------------------------------------

export const VIDEO_GENERATOR_MODELS = [
  'kling-omni',
  'pixverse-v6',
  'seedance-2.0',
  'veo-3.1-fast',
  'veo-3.1-lite',
  'veo-3.1',
] as const;
export type VideoGeneratorModel = (typeof VIDEO_GENERATOR_MODELS)[number];

export const DEFAULT_VIDEO_GENERATOR_MODEL: VideoGeneratorModel = 'veo-3.1-fast';

export const VIDEO_GENERATOR_MODEL_LABELS: Record<VideoGeneratorModel, string> = {
  'veo-3.1': 'Veo 3.1',
  'veo-3.1-fast': 'Veo 3.1 Fast',
  'veo-3.1-lite': 'Veo 3.1 Lite',
  'kling-omni': 'Kling Omni',
  'pixverse-v6': 'Pixverse V6',
  'seedance-2.0': 'Seedance 2.0',
};

/**
 * Who hosts the model. Menus group by this so a provider's models are never split
 * across a flat list — every video-model picker renders the same grouping.
 */
export type VideoGeneratorProvider = 'google' | 'fal';

export const VIDEO_GENERATOR_PROVIDER_LABELS: Record<VideoGeneratorProvider, string> = {
  google: 'Google',
  fal: 'Fal',
};

const VIDEO_GENERATOR_PROVIDER_BY_MODEL: Record<VideoGeneratorModel, VideoGeneratorProvider> = {
  'veo-3.1': 'google',
  'veo-3.1-fast': 'google',
  'veo-3.1-lite': 'google',
  'kling-omni': 'fal',
  'pixverse-v6': 'fal',
  'seedance-2.0': 'fal',
};

export const getVideoGeneratorProvider = (model: VideoGeneratorModel): VideoGeneratorProvider =>
  VIDEO_GENERATOR_PROVIDER_BY_MODEL[model];

export type VideoGeneratorModelGroup = {
  provider: VideoGeneratorProvider;
  label: string;
  models: readonly VideoGeneratorModel[];
};

const VIDEO_GENERATOR_PROVIDER_ORDER: readonly VideoGeneratorProvider[] = ['google', 'fal'];

export const VIDEO_GENERATOR_MODEL_GROUPS: readonly VideoGeneratorModelGroup[] =
  VIDEO_GENERATOR_PROVIDER_ORDER.map((provider) => ({
    provider,
    label: VIDEO_GENERATOR_PROVIDER_LABELS[provider],
    models: VIDEO_GENERATOR_MODELS.filter(
      (model) => VIDEO_GENERATOR_PROVIDER_BY_MODEL[model] === provider,
    ),
  }));

/**
 * Clip length, in seconds. Veo renders 4, 6 or 8 and nothing else, and it renders
 * anything above 720p at 8 seconds only — both rules are enforced by the Backend
 * request schema (App/ai-studio/types.ts `veoResolutionsRequiring8s`), so a node
 * carrying an illegal length does not fail at write time, it 400s at Run.
 */
export const VIDEO_GENERATOR_DURATIONS = [4, 6, 8] as const;
export type VideoGeneratorDurationSeconds = (typeof VIDEO_GENERATOR_DURATIONS)[number];
export const DEFAULT_VIDEO_GENERATOR_DURATION: VideoGeneratorDurationSeconds = 8;
export const VIDEO_GENERATOR_DURATION_NOTE =
  'Veo renders 4, 6 or 8 seconds only. 1080p and above render at 8 seconds.';

const VIDEO_RESOLUTIONS_REQUIRING_8S = new Set(['1080p', '2K', '4K']);

/** The canvas has written both `4k` and `4K` for one tier; the Backend upper-cases too. */
const canonicalVideoResolution = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/k$/, 'K') : '';

/** Only the Google-hosted (Veo) models tie duration to resolution; fal models do not. */
export const videoResolutionRequiresEightSeconds = (
  model: VideoGeneratorModel,
  resolution: unknown,
): boolean =>
  getVideoGeneratorProvider(model) === 'google' &&
  VIDEO_RESOLUTIONS_REQUIRING_8S.has(canonicalVideoResolution(resolution));

/**
 * The length this node will ACTUALLY render at. `undefined` means the model has no
 * fixed ladder (the fal models take 3-15s), so the requested value is left alone
 * rather than silently clamped down to something the provider never asked for.
 */
export function coerceVideoGeneratorDuration(
  model: VideoGeneratorModel,
  resolution: unknown,
  requested: unknown,
): VideoGeneratorDurationSeconds | undefined {
  if (getVideoGeneratorProvider(model) !== 'google') return undefined;
  if (videoResolutionRequiresEightSeconds(model, resolution)) return 8;
  const value = Number(requested);
  return (VIDEO_GENERATOR_DURATIONS as readonly number[]).includes(value)
    ? (value as VideoGeneratorDurationSeconds)
    : DEFAULT_VIDEO_GENERATOR_DURATION;
}

const VIDEO_GENERATOR_NODE_TYPES = new Set(['videoGen', 'veoDirector', 'veoFast']);

export const VIDEO_IMAGE_REFERENCE_HANDLES = ['ref-image', 'ref-images'] as const;
export const VIDEO_FRAME_HANDLES = ['first-frame', 'last-frame'] as const;
export const VIDEO_REFERENCE_VIDEO_HANDLE = 'ref-video' as const;

/**
 * An image generator can emit up to IMAGE_VARIATION_LIMIT variations from one run,
 * each on its own source handle so a downstream node can consume a SPECIFIC one.
 *
 * Variation 0 keeps the bare `image` id rather than `image-0`. Every graph saved
 * before variations existed has edges on `image`, and `normalizeEdges` DROPS an
 * edge whose source handle is not in the allowed set — renumbering would silently
 * delete those edges from every existing canvas.
 */
export const IMAGE_VARIATION_LIMIT = 4;
export const IMAGE_VARIATION_HANDLE_PREFIX = 'image-';
export const IMAGE_VARIATION_HANDLES = ['image', 'image-1', 'image-2', 'image-3'] as const;
export type ImageVariationHandle = (typeof IMAGE_VARIATION_HANDLES)[number];

export const getImageVariationHandleId = (index: number): string =>
  index <= 0 ? 'image' : `${IMAGE_VARIATION_HANDLE_PREFIX}${index}`;

/**
 * Inverse of getImageVariationHandleId. Anything unrecognisable resolves to 0 so a
 * legacy or malformed edge still yields the first variation instead of nothing.
 */
export const variationIndexFromHandle = (handleId?: string | null): number => {
  if (!handleId || !handleId.startsWith(IMAGE_VARIATION_HANDLE_PREFIX)) return 0;
  const index = Number.parseInt(handleId.slice(IMAGE_VARIATION_HANDLE_PREFIX.length), 10);
  return Number.isInteger(index) && index > 0 && index < IMAGE_VARIATION_LIMIT ? index : 0;
};

export type VideoGeneratorNodeType = 'videoGen' | 'veoDirector' | 'veoFast';

/**
 * How a video node takes its image inputs. Veo REJECTS a request carrying both
 * `referenceImages` and `image`/`lastFrame` — it is one or the other per request —
 * so on the two toggleable Veo models this is a user-visible mode that swaps the
 * node's target handles, not a hint.
 *
 * Seedance is why this cannot be derived from the two `supports*` predicates: it
 * sends `images_list` AND `first_image_url`/`last_image_url` in ONE request, so it
 * has a single mode carrying both handle families. An explicit table is the honest
 * model of what each provider accepts.
 */
export type VideoGeneratorReferenceMode = 'images' | 'frames' | 'omni';

/** Entry [0] is the model's default mode. A new model cannot compile until its modes are declared. */
const REFERENCE_MODES_BY_MODEL: Record<
  VideoGeneratorModel,
  readonly [VideoGeneratorReferenceMode, ...VideoGeneratorReferenceMode[]]
> = {
  'veo-3.1': ['images', 'frames'],
  'veo-3.1-fast': ['frames', 'images'],
  'veo-3.1-lite': ['frames'],
  'kling-omni': ['omni'],
  'pixverse-v6': ['images'],
  'seedance-2.0': ['images'],
};

export const VIDEO_GENERATOR_REFERENCE_MODE_LABELS: Record<VideoGeneratorReferenceMode, string> = {
  images: 'Reference Images',
  frames: 'First / Last Frame',
  omni: 'Omni References',
};

export function getVideoGeneratorReferenceModes(
  model: VideoGeneratorModel,
): readonly VideoGeneratorReferenceMode[] {
  return REFERENCE_MODES_BY_MODEL[model];
}

const isVideoGeneratorModel = (value: unknown): value is VideoGeneratorModel =>
  typeof value === 'string' && (VIDEO_GENERATOR_MODELS as readonly string[]).includes(value);

export const isVideoGeneratorNodeType = (nodeType?: string): nodeType is VideoGeneratorNodeType =>
  typeof nodeType === 'string' && VIDEO_GENERATOR_NODE_TYPES.has(nodeType);

export function resolveVideoGeneratorModel(node: {
  type?: string;
  data?: Record<string, unknown>;
}): VideoGeneratorModel {
  const model = node.data?.model;
  if (isVideoGeneratorModel(model)) return model;
  if (node.type === 'veoFast') return 'veo-3.1-fast';
  if (node.type === 'veoDirector') return 'veo-3.1';
  return DEFAULT_VIDEO_GENERATOR_MODEL;
}

/** The model's DEFAULT mode. Use `resolveVideoGeneratorReferenceMode` when you hold a node. */
export function getVideoGeneratorReferenceMode(
  model: VideoGeneratorModel,
): VideoGeneratorReferenceMode {
  return REFERENCE_MODES_BY_MODEL[model][0];
}

/**
 * The node's EFFECTIVE mode: what the user picked, validated against what the model
 * actually accepts, falling back to the model default. Validation-with-fallback is
 * what makes an absent or stale `referenceMode` on a saved canvas behave exactly as
 * it did before modes existed.
 */
export function resolveVideoGeneratorReferenceMode(node: {
  type?: string;
  data?: Record<string, unknown>;
}): VideoGeneratorReferenceMode {
  const model = resolveVideoGeneratorModel(node);
  const legal = REFERENCE_MODES_BY_MODEL[model];
  const requested = node.data?.referenceMode;
  return legal.includes(requested as VideoGeneratorReferenceMode)
    ? (requested as VideoGeneratorReferenceMode)
    : legal[0];
}

const TEXT_TARGET_HANDLES = ['prompt-in', 'prompt', 'negative'] as const;

export function getVideoGeneratorTargetHandles(
  model: VideoGeneratorModel,
  mode: VideoGeneratorReferenceMode = getVideoGeneratorReferenceMode(model),
): string[] {
  if (model === 'veo-3.1-lite') {
    return [...TEXT_TARGET_HANDLES, ...VIDEO_FRAME_HANDLES];
  }
  if (model === 'veo-3.1' || model === 'veo-3.1-fast') {
    return mode === 'frames'
      ? [...TEXT_TARGET_HANDLES, ...VIDEO_FRAME_HANDLES]
      : [...TEXT_TARGET_HANDLES, ...VIDEO_IMAGE_REFERENCE_HANDLES];
  }
  if (model === 'kling-omni') {
    return [...TEXT_TARGET_HANDLES, ...VIDEO_IMAGE_REFERENCE_HANDLES, VIDEO_REFERENCE_VIDEO_HANDLE];
  }
  if (model === 'pixverse-v6') {
    return [...TEXT_TARGET_HANDLES, VIDEO_IMAGE_REFERENCE_HANDLES[0]];
  }
  if (model === 'seedance-2.0') {
    return [
      ...TEXT_TARGET_HANDLES,
      ...VIDEO_IMAGE_REFERENCE_HANDLES,
      ...VIDEO_FRAME_HANDLES,
      VIDEO_REFERENCE_VIDEO_HANDLE,
    ];
  }
  return [...TEXT_TARGET_HANDLES, ...VIDEO_IMAGE_REFERENCE_HANDLES];
}

export type VideoGeneratorImageReferenceHandle = (typeof VIDEO_IMAGE_REFERENCE_HANDLES)[number];

/**
 * The ONE image-reference handle id a video-generator node RENDERS.
 *
 * The allowed set carries both aliases so graphs saved against either id keep
 * validating, but the node draws a single dot. Every consumer — the node's handle
 * rail, the drop-target resolver, the legacy edge remap — must agree on which id
 * that is, or an edge lands on a handle that does not exist in the DOM and silently
 * fails to render. Plural is canonical; `pixverse-v6` is the one model whose allowed
 * set carries only the singular.
 */
export function getVideoGeneratorImageReferenceHandle(
  model: VideoGeneratorModel,
  mode?: VideoGeneratorReferenceMode,
): VideoGeneratorImageReferenceHandle | undefined {
  const allowed = getVideoGeneratorTargetHandles(model, mode);
  if (allowed.includes('ref-images')) return 'ref-images';
  if (allowed.includes('ref-image')) return 'ref-image';
  return undefined;
}

// Derived from the handle table so a capability can never disagree with the handles
// the node actually renders. Omitting `mode` answers for the model's DEFAULT mode.
export function supportsVideoGeneratorFrameInputs(
  model: VideoGeneratorModel,
  mode?: VideoGeneratorReferenceMode,
): boolean {
  return getVideoGeneratorTargetHandles(model, mode).some(isFrameHandle);
}

export function supportsVideoGeneratorReferenceImages(
  model: VideoGeneratorModel,
  mode?: VideoGeneratorReferenceMode,
): boolean {
  return getVideoGeneratorTargetHandles(model, mode).some(isImageReferenceHandle);
}

export function supportsVideoGeneratorReferenceVideo(model: VideoGeneratorModel): boolean {
  return model === 'kling-omni' || model === 'seedance-2.0';
}

export function getVideoGeneratorImageLimit(
  model: VideoGeneratorModel,
  hasReferenceVideo: boolean,
): number | undefined {
  if (model === 'veo-3.1' || model === 'veo-3.1-fast') return 3;
  if (model === 'kling-omni') return hasReferenceVideo ? 4 : 7;
  if (model === 'pixverse-v6') return 1;
  if (model === 'seedance-2.0') return 9;
  return undefined;
}

export function getVideoGeneratorBackendModel(model: VideoGeneratorModel): string {
  if (model === 'veo-3.1-fast') return 'veo-3.1-fast-generate-preview';
  if (model === 'veo-3.1-lite') return 'veo-3.1-lite-generate-preview';
  if (model === 'kling-omni') return 'kling-omni';
  if (model === 'pixverse-v6') return 'pixverse-v6';
  if (model === 'seedance-2.0') return 'seedance-2.0';
  return 'veo-3.1-generate-preview';
}

// ---------------------------------------------------------------------------
// Single-text-input guards
// ---------------------------------------------------------------------------

const TEXT_INPUT_HANDLES = new Set([
  'prompt',
  'prompt-in',
  'trigger',
  'negative',
  'input',
  'audio',
  'video',
]);

export function isTextInputHandle(handleId?: string | null): boolean {
  if (!handleId) return false;
  return TEXT_INPUT_HANDLES.has(handleId);
}

export function hasExistingTargetConnection(
  edges: GraphEdgeLike[],
  targetId: string,
  targetHandle?: string | null,
): boolean {
  if (!targetHandle) return false;
  return edges.some((edge) => edge.target === targetId && edge.targetHandle === targetHandle);
}

export function canAcceptSingleTextInput(
  edges: GraphEdgeLike[],
  targetId: string,
  targetHandle?: string | null,
): boolean {
  if (!isTextInputHandle(targetHandle)) return true;
  return !hasExistingTargetConnection(edges, targetId, targetHandle);
}

// ---------------------------------------------------------------------------
// Handle vocabulary
// ---------------------------------------------------------------------------

const IMAGE_REFERENCE_HANDLE_SET = new Set<string>(VIDEO_IMAGE_REFERENCE_HANDLES);
const FRAME_HANDLE_SET = new Set<string>(VIDEO_FRAME_HANDLES);

const isVideoGeneratorNode = (node: GraphNodeLike): boolean => isVideoGeneratorNodeType(node.type);

// Nineteen node types emit exactly what they ARE — a `nanoGen` makes an image, a
// `veoFast` makes a video — so a literal list answers "what comes out of this". The
// Canvas V3 types do not: an `action` emits whatever its op emits, a `router` forwards
// whatever it locked onto, a `batch` carries an item kind, and a `designRef` emits a
// section specimen on one handle and a token summary on the other.
//
// `sourceModality` (below, hoisted) answers for those; the `sourceHandle` argument is
// OPTIONAL so every existing caller and every existing type behaves exactly as before.
const isVideoProducingSource = (node: GraphNodeLike, sourceHandle?: string | null): boolean =>
  node.type === 'video' ||
  node.type === 'extendVideo' ||
  node.type === 'timelineEditor' ||
  node.type === 'hyperframesAgent' ||
  node.type === 'omniGen' ||
  isVideoGeneratorNodeType(node.type) ||
  sourceModality(node, sourceHandle) === 'video';

const isImageProducingSource = (node: GraphNodeLike, sourceHandle?: string | null): boolean =>
  node.type === 'image' ||
  node.type === 'nanoGen' ||
  node.type === 'frameExtract' ||
  sourceModality(node, sourceHandle) === 'image';

const isTextProducingSource = (node: GraphNodeLike, sourceHandle?: string | null): boolean =>
  node.type === 'string' ||
  node.type === 'videoDecode' ||
  sourceModality(node, sourceHandle) === 'text';

// Timeline Editor (timelineEditor) input pool: a single multi-connection target
// handle `media-in` that accepts many video-producing sources, images, and
// audio beds/voiceovers.
// Connected inputs form a pool the editor's timeline places clips from — each
// placement references its source node. Legacy per-slot splicer handles are
// converted to this pool by migrateWorkflowGraph before the graph is consumed.
export const TIMELINE_MEDIA_INPUT_HANDLE = 'media-in';
export const TIMELINE_MEDIA_POOL_LIMIT = 20;
export const isTimelineMediaHandle = (handleId?: string | null): boolean =>
  handleId === TIMELINE_MEDIA_INPUT_HANDLE;

export const HYPERFRAMES_PROMPT_INPUT_HANDLE = 'prompt-in';
export const HYPERFRAMES_IMAGE_INPUT_HANDLE = 'image-in';
export const HYPERFRAMES_VIDEO_INPUT_HANDLE = 'video-in';
export const HYPERFRAMES_AUDIO_INPUT_HANDLE = 'audio-in';
export const HYPERFRAMES_VIDEO_OUTPUT_HANDLE = 'video';
export const HYPERFRAMES_MEDIA_INPUT_HANDLES = [
  HYPERFRAMES_IMAGE_INPUT_HANDLE,
  HYPERFRAMES_VIDEO_INPUT_HANDLE,
  HYPERFRAMES_AUDIO_INPUT_HANDLE,
] as const;
export const HYPERFRAMES_MEDIA_POOL_LIMIT = 20;

// Publishing sinks accept a format-specific single input or explicit ordered
// carousel slots. They have no MEDIA source output, so they are deliberately absent
// from the media-producing source predicates.
export const PUBLISH_IMAGE_INPUT_HANDLE = 'image-in';
export const PUBLISH_VIDEO_INPUT_HANDLE = 'video-in';
export const PUBLISH_ASSET_INPUT_PREFIX = 'asset-';
export const isPublishAssetHandle = (handleId?: string | null): boolean =>
  typeof handleId === 'string' && handleId.startsWith(PUBLISH_ASSET_INPUT_PREFIX);

/**
 * The DRAFT wire: `plannerDraft` hands the Planner draft it is bound to downstream,
 * and `organicPublish` posts it.
 *
 * A draft reference is not media, so these handles map to no media kind — the agent's
 * `attach_media` cannot target them, and a generator's output cannot be wired straight
 * into a publish. Publishing is deliberately downstream of a SAVED draft: the row (with
 * its caption, its account and its approval state) is what gets posted, never a loose
 * canvas asset.
 */
export const DRAFT_OUTPUT_HANDLE = 'draft';
export const DRAFT_INPUT_HANDLE = 'draft-in';

/** A caption/copy input, so a draft's text can come from an upstream node. */
export const PLANNER_DRAFT_TEXT_INPUT_HANDLE = 'text-in';

// ---------------------------------------------------------------------------
// Canvas V3 handle vocabulary
// ---------------------------------------------------------------------------
//
// Reuse before invent: `export` takes the timeline pool's `media-in` and `layerEditor`
// takes the hyperframes/publish `image-in`. Both are already labelled, already carry the
// right port data type, and `image-in` is already in IMAGE_MEDIA_HANDLES so `attach_media`
// works on a layer editor for free. Every consumer of those ids is scoped by
// `node.type === …`, so sharing the string costs nothing and a fourth spelling of "the
// media input" would cost a lookup table.

/** `action` — one input, one output. WHICH modality each carries comes from the op. */
export const ACTION_INPUT_HANDLE = 'in';
export const ACTION_OUTPUT_HANDLE = 'out';

/** `router` — same two handles. Many edges may leave `out`; that IS the fan-out. */
export const ROUTER_INPUT_HANDLE = 'in';
export const ROUTER_OUTPUT_HANDLE = 'out';

/** `batch` — many items in, one collection out. */
export const BATCH_ITEMS_INPUT_HANDLE = 'items';
export const BATCH_COLLECTION_OUTPUT_HANDLE = 'collection';

/** `export` — terminal. Deliberately the same id as the timeline media pool. */
export const EXPORT_MEDIA_INPUT_HANDLE = 'media-in';
export const EXPORT_MEDIA_POOL_LIMIT = 20;

/** `layerEditor` — stills in, one composed still out. Same id as the image inputs above. */
export const LAYER_EDITOR_IMAGE_INPUT_HANDLE = 'image-in';
export const LAYER_EDITOR_IMAGE_OUTPUT_HANDLE = 'image';
export const LAYER_EDITOR_LAYER_LIMIT = 20;

/** `element` — a saved reference, image out only. */
export const ELEMENT_IMAGE_OUTPUT_HANDLE = 'image';

/** `designRef` — the section specimen, and the same section as text. */
export const DESIGN_REF_IMAGE_OUTPUT_HANDLE = 'image';
export const DESIGN_REF_TEXT_OUTPUT_HANDLE = 'text';

/** What a node emits. Narrower than `StudioPortDataType` on purpose: no Canvas V3 type
 *  moves audio or documents, and collection-ness is a runtime output SHAPE, never a
 *  port type. */
export type StudioEmittedModality = 'text' | 'image' | 'video';

const declaredModality = (value: unknown): StudioEmittedModality | undefined =>
  value === 'text' || value === 'image' || value === 'video' ? value : undefined;

/**
 * The modality a node emits on `sourceHandle`, for the types whose output their TYPE
 * does not settle. `undefined` means "contracts cannot know yet" — an unconfigured
 * action, an unlocked router, an empty batch — and every caller treats that as
 * "not a legal source", which is what stops a half-built node from wiring anywhere.
 *
 * Declared as a `function` so the predicates above, which are defined earlier in the
 * file, can call it.
 */
function sourceModality(
  node: GraphNodeLike,
  sourceHandle?: string | null,
): StudioEmittedModality | undefined {
  switch (node.type) {
    case 'action':
      return actionOutputModality(node.data?.actionId);
    case 'router':
      // Reads the STAMPED lock only. The canvas writes it on the first connection using
      // `routerLockedType` below — deriving it here would need the edge list, which the
      // producer predicates deliberately do not carry.
      return declaredModality(node.data?.lockedType);
    case 'batch':
      return batchItemType(node.data);
    case 'element':
    case 'layerEditor':
      return 'image';
    case 'designRef':
      // Two outputs, two modalities. With no handle named there is nothing to tell them
      // apart, so we refuse rather than guess — guessing 'image' is how a token summary
      // ends up wired into a reference-image port.
      if (sourceHandle === DESIGN_REF_TEXT_OUTPUT_HANDLE) return 'text';
      if (sourceHandle === DESIGN_REF_IMAGE_OUTPUT_HANDLE) return 'image';
      return undefined;
    default:
      return undefined;
  }
}

/**
 * The modality a router should be pinned to: its stamped `data.lockedType` when it has
 * one, otherwise whatever is already wired into it.
 *
 * The canvas calls this on connect and writes the answer to `data.lockedType`. Keeping
 * the DERIVATION here means the rule lives with the rest of the graph rules, and the
 * Frontend only has to store the result.
 */
export function routerLockedType(
  node: GraphNodeLike,
  edges: GraphEdgeLike[] = [],
  nodes: GraphNodeLike[] = [],
): StudioEmittedModality | undefined {
  const declared = declaredModality(node.data?.lockedType);
  if (declared) return declared;

  const incoming = edges.find((edge) => edge.target === node.id);
  if (!incoming) return undefined;
  const source = nodes.find((candidate) => candidate.id === incoming.source);
  if (!source) return undefined;
  const handle = incoming.sourceHandle;
  if (isTextProducingSource(source, handle)) return 'text';
  if (isImageProducingSource(source, handle)) return 'image';
  if (isVideoProducingSource(source, handle)) return 'video';
  return undefined;
}

/**
 * The kind a batch is locked to: its stamped `data.itemType` when it has one, then the
 * first item already in it, and — exactly like `routerLockedType` — otherwise whatever is
 * wired into its `items` handle.
 *
 * The wired fallback is what makes a batch buildable head-first. `BatchNode` fills
 * `data.items` and `data.itemType` from its wired producers in an effect, but that effect
 * only runs once the node is on screen. An agent building `string → batch → generator` in
 * one call has no canvas, so without this the batch has no output modality, the
 * batch→generator edge is refused, and the effect it was waiting for can never rescue an
 * edge that was never created.
 *
 * Resolution only — nothing here writes. `stampBatchLocks` in the builder persists the
 * answer, the same division of labour `routerLockedType` has with the canvas.
 */
export function batchLockedType(
  node: GraphNodeLike,
  edges: GraphEdgeLike[] = [],
  nodes: GraphNodeLike[] = [],
): BatchItemKind | undefined {
  const declared = batchItemType(node.data);
  if (declared) return declared;

  for (const edge of edges) {
    if (edge.target !== node.id) continue;
    if ((edge.targetHandle ?? BATCH_ITEMS_INPUT_HANDLE) !== BATCH_ITEMS_INPUT_HANDLE) continue;
    const source = nodes.find((candidate) => candidate.id === edge.source);
    // A batch wired into a batch is the COMBINE PARTNER, never a source of items — the
    // same rule `materializeBatch` and the node body already apply.
    if (!source || source.type === 'batch') continue;
    const handle = edge.sourceHandle;
    if (isTextProducingSource(source, handle)) return 'text';
    if (isImageProducingSource(source, handle)) return 'image';
    if (isVideoProducingSource(source, handle)) return 'video';
  }
  return undefined;
}

/**
 * A batch seen WITH its wired lock resolved. Only the connection rules have the edge list,
 * so the derivation happens here and the producer predicates stay edge-free — the property
 * the rest of this file is built on. Any other node is returned untouched.
 */
const withResolvedBatchLock = (
  node: GraphNodeLike,
  edges: GraphEdgeLike[],
  nodes: GraphNodeLike[],
): GraphNodeLike => {
  if (node.type !== 'batch' || batchItemType(node.data)) return node;
  const locked = batchLockedType(node, edges, nodes);
  return locked ? { ...node, data: { ...node.data, itemType: locked } } : node;
};

type PublisherFormat = 'image' | 'carousel' | 'video';

const publisherFormat = (node: GraphNodeLike): PublisherFormat => {
  const value = node.data?.format;
  return value === 'carousel' || value === 'video' ? value : 'image';
};

const publisherSlots = (node: GraphNodeLike): Array<{ id: string }> => {
  const slots = (node.data as { assetSlots?: unknown } | undefined)?.assetSlots;
  if (!Array.isArray(slots)) return [];
  return slots.flatMap((slot) => {
    const id = (slot as { id?: unknown })?.id;
    return typeof id === 'string' && id ? [{ id }] : [];
  });
};

const publisherTargetHandles = (node: GraphNodeLike): string[] => {
  const format = publisherFormat(node);
  if (format === 'image') return [PUBLISH_IMAGE_INPUT_HANDLE];
  if (format === 'video') return [PUBLISH_VIDEO_INPUT_HANDLE];
  return publisherSlots(node).map((slot) => `${PUBLISH_ASSET_INPUT_PREFIX}${slot.id}`);
};

/** What a template variable may carry over an edge. */
export type ConnectableApiRenderVariableKind = 'image' | 'video' | 'text';

const CONNECTABLE_API_RENDER_KINDS: readonly string[] = ['image', 'video', 'text'];

/**
 * Whether this template variable gets a Canvas handle — the ONE place that decides it.
 *
 * `reserved` is excluded, and that exclusion belongs HERE rather than at each call site:
 * the Backend fills a reserved variable itself and refuses a caller-supplied value with
 * `render_reserved_variable`, and the Canvas deliberately renders no handle for one. A
 * graph rule that still calls the edge legal lets a saved or agent-authored workflow
 * carry an edge `resolveApiRenderVariables` silently drops — wired on screen, empty at
 * render.
 *
 * `number` and `enum` are deliberately NOT wireable: a numeric parameter stays a typed
 * field and an enum stays a picker over the options the template reflected. A handle
 * would REPLACE that control rather than add to it.
 *
 * Exported because the node body (`RenderVariableFields`), the value resolver
 * (`resolveApiRenderVariables`) and these graph rules must not each carry their own kind
 * list — a handle the graph refuses is an edge the canvas paints and the render never
 * receives, and this repo has already lost a feature to exactly that.
 */
export const isConnectableApiRenderVariable = (variable: {
  kind?: unknown;
  reserved?: unknown;
}): boolean =>
  variable?.reserved !== true && CONNECTABLE_API_RENDER_KINDS.includes(String(variable?.kind));

/** The handle id for a template variable. One spelling, one place. */
export const apiRenderVariableHandleId = (key: string): string => `variable-${key}`;

const apiRenderConnectableVariables = (
  node: GraphNodeLike,
): Array<{ key: string; kind: ConnectableApiRenderVariableKind; multiple: boolean }> => {
  const variables = (node.data as { variableDefinitions?: unknown })?.variableDefinitions;
  if (!Array.isArray(variables)) return [];
  return variables.flatMap((variable) => {
    if (!variable || typeof variable !== 'object') return [];
    const value = variable as {
      key?: unknown;
      kind?: unknown;
      reserved?: unknown;
      multiple?: unknown;
    };
    if (!isConnectableApiRenderVariable(value) || typeof value.key !== 'string') return [];
    return [
      {
        key: value.key,
        kind: value.kind as ConnectableApiRenderVariableKind,
        // A text port carries one scalar: `apiRenderInputValueSchema` has no `string[]`
        // member, so `multiple` on a text variable is a shape the wire cannot express.
        // Honouring it here would let the canvas accept edges preflight then refuses.
        multiple: value.multiple === true && value.kind !== 'text',
      },
    ];
  });
};

export const apiRenderTargetHandles = (node: GraphNodeLike): string[] =>
  apiRenderConnectableVariables(node).map((variable) => apiRenderVariableHandleId(variable.key));

const apiRenderVariableForHandle = (node: GraphNodeLike, handle: string) =>
  apiRenderConnectableVariables(node).find(
    (variable) => apiRenderVariableHandleId(variable.key) === handle,
  ) ?? null;

const apiRenderVariableKindForHandle = (
  node: GraphNodeLike,
  handle: string,
): ConnectableApiRenderVariableKind | null =>
  apiRenderVariableForHandle(node, handle)?.kind ?? null;

const isImageReferenceHandle = (handleId?: string | null): boolean =>
  typeof handleId === 'string' && IMAGE_REFERENCE_HANDLE_SET.has(handleId);

const isFrameHandle = (handleId?: string | null): boolean =>
  typeof handleId === 'string' && FRAME_HANDLE_SET.has(handleId);

const getEdgeCountForTargetHandles = (
  edges: GraphEdgeLike[],
  targetId: string,
  targetHandles: readonly string[],
): number =>
  edges.filter(
    (edge) => edge.target === targetId && targetHandles.includes(edge.targetHandle ?? ''),
  ).length;

const getEdgeCountForTargetHandle = (
  edges: GraphEdgeLike[],
  targetId: string,
  targetHandle: string,
): number =>
  edges.filter((edge) => edge.target === targetId && edge.targetHandle === targetHandle).length;

const getCountedHandles = (node: GraphNodeLike, targetHandle: string): readonly string[] => {
  if (
    node.type === 'hyperframesAgent' &&
    HYPERFRAMES_MEDIA_INPUT_HANDLES.includes(
      targetHandle as (typeof HYPERFRAMES_MEDIA_INPUT_HANDLES)[number],
    )
  )
    return HYPERFRAMES_MEDIA_INPUT_HANDLES;
  if (node.type === 'nanoGen' && isImageReferenceHandle(targetHandle))
    return VIDEO_IMAGE_REFERENCE_HANDLES;
  if (isVideoGeneratorNode(node) && isImageReferenceHandle(targetHandle))
    return VIDEO_IMAGE_REFERENCE_HANDLES;
  return [targetHandle];
};

export const getAllowedSourceHandles = (node: GraphNodeLike): string[] => {
  switch (node.type) {
    case 'string':
    case 'videoDecode':
      return ['text'];
    case 'image':
    case 'frameExtract':
      return ['image'];
    case 'video':
      return ['video'];
    case 'audio':
      return ['audio'];
    case 'document':
      return ['document'];
    case 'nanoGen':
      return [...IMAGE_VARIATION_HANDLES];
    case 'extendVideo':
    case 'timelineEditor':
    case 'hyperframesAgent':
      return ['video'];
    case 'omniGen':
      return ['video'];
    case 'plannerDraft':
      return [DRAFT_OUTPUT_HANDLE];
    case 'action':
      // The op decides the modality, but the handle is the same one either way — a node
      // that changes its op keeps its edges' geometry and only revalidates them.
      return actionDef(node.data?.actionId) ? [ACTION_OUTPUT_HANDLE] : [];
    case 'router':
      // ONE source handle. The fan-out is many edges leaving it, not many handles.
      return [ROUTER_OUTPUT_HANDLE];
    case 'batch':
      return [BATCH_COLLECTION_OUTPUT_HANDLE];
    case 'layerEditor':
      return [LAYER_EDITOR_IMAGE_OUTPUT_HANDLE];
    case 'element':
      return [ELEMENT_IMAGE_OUTPUT_HANDLE];
    case 'designRef':
      return [DESIGN_REF_IMAGE_OUTPUT_HANDLE, DESIGN_REF_TEXT_OUTPUT_HANDLE];
    // `export` is terminal and `note` is an annotation — neither produces anything.
    case 'export':
    case 'note':
      return [];
    default:
      return isVideoGeneratorNode(node) ? ['video'] : [];
  }
};

export const getAllowedTargetHandles = (node: GraphNodeLike): string[] => {
  switch (node.type) {
    case 'nanoGen':
      return ['prompt', 'negative', ...VIDEO_IMAGE_REFERENCE_HANDLES, 'trigger'];
    case 'extendVideo':
      return ['prompt', 'video'];
    case 'timelineEditor':
      return [TIMELINE_MEDIA_INPUT_HANDLE];
    case 'hyperframesAgent':
      return [HYPERFRAMES_PROMPT_INPUT_HANDLE, ...HYPERFRAMES_MEDIA_INPUT_HANDLES];
    case 'plannerDraft':
      return [PLANNER_DRAFT_TEXT_INPUT_HANDLE, ...publisherTargetHandles(node)];
    case 'paidPublisher':
      return publisherTargetHandles(node);
    case 'organicPublish':
      return [DRAFT_INPUT_HANDLE];
    case 'apiRender':
      return apiRenderTargetHandles(node);
    case 'omniGen':
      return ['prompt-in', 'prompt', 'ref-images'];
    case 'string':
      return ['image', 'audio', 'document', 'video'];
    case 'videoDecode':
      return ['video'];
    case 'frameExtract':
      return ['video'];
    case 'action':
      return actionDef(node.data?.actionId)?.inputs.map((port) => port.handle) ?? [];
    case 'router':
      return [ROUTER_INPUT_HANDLE];
    case 'batch':
      return [BATCH_ITEMS_INPUT_HANDLE];
    case 'export':
      return [EXPORT_MEDIA_INPUT_HANDLE];
    case 'layerEditor':
      return [LAYER_EDITOR_IMAGE_INPUT_HANDLE];
    // Sources and annotations: `element` and `designRef` emit a saved reference, `note`
    // is for the human reading the canvas.
    case 'element':
    case 'designRef':
    case 'note':
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
      return [];
    default:
      return isVideoGeneratorNode(node)
        ? getVideoGeneratorTargetHandles(
            resolveVideoGeneratorModel(node),
            resolveVideoGeneratorReferenceMode(node),
          )
        : [];
  }
};

export function getTargetHandleConnectionLimit(
  node: GraphNodeLike,
  targetHandle: string,
  edges: GraphEdgeLike[],
): number | undefined {
  if (node.type === 'nanoGen' && isImageReferenceHandle(targetHandle)) {
    const configured = (node.data as { maxReferenceImages?: unknown })?.maxReferenceImages;
    const limit = typeof configured === 'number' ? Math.floor(configured) : undefined;
    if (limit !== undefined && Number.isFinite(limit) && limit > 0) return limit;
    return 14;
  }

  if (node.type === 'extendVideo' && targetHandle === 'video') return 1;
  if (node.type === 'videoDecode' && targetHandle === 'video') return 1;
  if (node.type === 'frameExtract' && targetHandle === 'video') return 1;
  if (node.type === 'timelineEditor' && isTimelineMediaHandle(targetHandle))
    return TIMELINE_MEDIA_POOL_LIMIT;
  if (node.type === 'hyperframesAgent' && targetHandle === HYPERFRAMES_PROMPT_INPUT_HANDLE)
    return 1;
  if (
    node.type === 'hyperframesAgent' &&
    HYPERFRAMES_MEDIA_INPUT_HANDLES.includes(
      targetHandle as (typeof HYPERFRAMES_MEDIA_INPUT_HANDLES)[number],
    )
  ) {
    return HYPERFRAMES_MEDIA_POOL_LIMIT;
  }
  if (
    (node.type === 'plannerDraft' || node.type === 'paidPublisher') &&
    publisherTargetHandles(node).includes(targetHandle)
  )
    return 1;
  if (node.type === 'plannerDraft' && targetHandle === PLANNER_DRAFT_TEXT_INPUT_HANDLE) return 1;
  // One draft per publish. Fanning several drafts into one publish node would make
  // "Post now" mean N irreversible posts behind a single confirmation.
  if (node.type === 'organicPublish' && targetHandle === DRAFT_INPUT_HANDLE) return 1;
  // A `multiple` variable is a graph-runner `media_list` port; its cap is the wire
  // contract's own array bound, so the canvas cannot accept an edge preflight refuses.
  if (node.type === 'apiRender') {
    const variable = apiRenderVariableForHandle(node, targetHandle);
    if (variable) return variable.multiple ? API_RENDER_MEDIA_LIST_MAX : 1;
  }
  if (node.type === 'omniGen' && isImageReferenceHandle(targetHandle)) return 3;
  // The op's own port declares its cap: one clip for a speed change, twenty for a stitch.
  if (node.type === 'action') {
    return actionInputPort(node.data?.actionId, targetHandle)?.max;
  }
  if (node.type === 'router' && targetHandle === ROUTER_INPUT_HANDLE) return 1;
  if (node.type === 'batch' && targetHandle === BATCH_ITEMS_INPUT_HANDLE) return MAX_BATCH_ITEMS;
  if (node.type === 'export' && targetHandle === EXPORT_MEDIA_INPUT_HANDLE)
    return EXPORT_MEDIA_POOL_LIMIT;
  if (node.type === 'layerEditor' && targetHandle === LAYER_EDITOR_IMAGE_INPUT_HANDLE)
    return LAYER_EDITOR_LAYER_LIMIT;

  if (!isVideoGeneratorNode(node)) return undefined;

  const model = resolveVideoGeneratorModel(node);

  // Handle-driven, not model-driven: a frame is one image by definition on every
  // provider, and an image-reference cap is whatever the provider's validator says.
  // The old per-model branches left seedance frames, seedance ref-images and
  // pixverse ref-image unbounded here while the Backend rejected them at Run.
  if (isFrameHandle(targetHandle)) return 1;

  if (model === 'kling-omni' && targetHandle === VIDEO_REFERENCE_VIDEO_HANDLE) {
    const currentImageCount = getEdgeCountForTargetHandles(
      edges,
      node.id,
      VIDEO_IMAGE_REFERENCE_HANDLES,
    );
    return currentImageCount > 4 ? 0 : 1;
  }

  if (isImageReferenceHandle(targetHandle)) {
    const hasReferenceVideo =
      getEdgeCountForTargetHandle(edges, node.id, VIDEO_REFERENCE_VIDEO_HANDLE) > 0;
    return getVideoGeneratorImageLimit(model, hasReferenceVideo);
  }

  return undefined;
}

function isConnectionCompatible(
  connection: GraphConnectionLike,
  edges: GraphEdgeLike[],
  nodes: GraphNodeLike[],
): boolean {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const rawSource = nodeById.get(connection.source);
  const targetNode = nodeById.get(connection.target);
  const targetHandle = connection.targetHandle ?? '';
  const sourceHandle = connection.sourceHandle ?? null;

  if (!rawSource || !targetNode) return false;
  // A batch that has not been stamped yet still knows what it carries if something is
  // wired into it. Resolved once, here, so every predicate below sees the same lock.
  const sourceNode = withResolvedBatchLock(rawSource, edges, nodes);

  if (
    isTextProducingSource(sourceNode, sourceHandle) &&
    ['prompt', 'prompt-in', 'negative'].includes(targetHandle)
  ) {
    return !hasExistingTargetConnection(edges, connection.target, targetHandle);
  }

  if (targetNode.type === 'string') {
    const handle = targetHandle;
    if (!canAcceptSingleTextInput(edges, connection.target, handle)) return false;
    if (handle === 'image' && isImageProducingSource(sourceNode, sourceHandle)) return true;
    if (handle === 'audio' && sourceNode.type === 'audio') return true;
    if (handle === 'video' && sourceNode.type === 'video') return true;
    if (handle === 'document' && sourceNode.type === 'document') return true;
    return false;
  }

  if (targetNode.type === 'nanoGen') {
    if (isImageReferenceHandle(targetHandle)) {
      if (!isImageProducingSource(sourceNode, sourceHandle)) return false;
    } else if (targetHandle === 'prompt' || targetHandle === 'negative') {
      if (!isTextProducingSource(sourceNode, sourceHandle)) return false;
    } else {
      return false;
    }
  } else if (targetNode.type === 'extendVideo') {
    if (targetHandle === 'video') {
      if (!isVideoProducingSource(sourceNode, sourceHandle)) return false;
    } else if (targetHandle === 'prompt') {
      if (!isTextProducingSource(sourceNode, sourceHandle)) return false;
    } else {
      return false;
    }
  } else if (targetNode.type === 'timelineEditor') {
    if (!isTimelineMediaHandle(targetHandle)) return false;
    const isImageSource = isImageProducingSource(sourceNode, sourceHandle);
    const isAudioSource = sourceNode.type === 'audio';
    if (!isVideoProducingSource(sourceNode, sourceHandle) && !isImageSource && !isAudioSource)
      return false;
  } else if (targetNode.type === 'hyperframesAgent') {
    if (targetHandle === HYPERFRAMES_PROMPT_INPUT_HANDLE) {
      if (!isTextProducingSource(sourceNode, sourceHandle)) return false;
    } else if (targetHandle === HYPERFRAMES_IMAGE_INPUT_HANDLE) {
      if (!isImageProducingSource(sourceNode, sourceHandle)) return false;
    } else if (targetHandle === HYPERFRAMES_VIDEO_INPUT_HANDLE) {
      if (!isVideoProducingSource(sourceNode, sourceHandle)) return false;
    } else if (targetHandle === HYPERFRAMES_AUDIO_INPUT_HANDLE) {
      if (sourceNode.type !== 'audio') return false;
    } else {
      return false;
    }
  } else if (targetNode.type === 'videoDecode') {
    if (targetHandle !== 'video') return false;
    if (!isVideoProducingSource(sourceNode, sourceHandle)) return false;
  } else if (targetNode.type === 'frameExtract') {
    if (targetHandle !== 'video') return false;
    if (!isVideoProducingSource(sourceNode, sourceHandle)) return false;
  } else if (targetNode.type === 'plannerDraft' || targetNode.type === 'paidPublisher') {
    if (targetHandle === PLANNER_DRAFT_TEXT_INPUT_HANDLE) {
      return targetNode.type === 'plannerDraft' && isTextProducingSource(sourceNode, sourceHandle);
    }
    const format = publisherFormat(targetNode);
    if (!publisherTargetHandles(targetNode).includes(targetHandle)) return false;
    const isImageSource = isImageProducingSource(sourceNode, sourceHandle);
    const isVideoSource = isVideoProducingSource(sourceNode, sourceHandle);
    if (format === 'image' && !isImageSource) return false;
    if (format === 'video' && !isVideoSource) return false;
    if (format === 'carousel' && !isImageSource && !isVideoSource) return false;
  } else if (targetNode.type === 'organicPublish') {
    // Only a saved Planner draft can be published, and only `plannerDraft` produces one.
    // Wiring a generator straight in would publish a loose canvas asset with no caption,
    // no account and no approval — the exact thing the publish gate exists to refuse.
    if (targetHandle !== DRAFT_INPUT_HANDLE) return false;
    if (sourceNode.type !== 'plannerDraft') return false;
  } else if (targetNode.type === 'apiRender') {
    const kind = apiRenderVariableKindForHandle(targetNode, targetHandle);
    if (kind === 'image' && !isImageProducingSource(sourceNode, sourceHandle)) return false;
    if (kind === 'video' && !isVideoProducingSource(sourceNode, sourceHandle)) return false;
    // A text parameter takes whatever a Text Block or a decoder produces. The inline
    // field stays as the fallback; the wire is what wins when there is one.
    if (kind === 'text' && !isTextProducingSource(sourceNode, sourceHandle)) return false;
    if (!kind) return false;
  } else if (targetNode.type === 'action') {
    // An action with no op chosen accepts nothing: until `actionId` is set there is no
    // answer to "what does this port take", and guessing one is how a clip ends up wired
    // into a find-and-replace. The palette only ever creates action nodes with an op.
    const port = actionInputPort(targetNode.data?.actionId, targetHandle);
    if (!port) return false;
    if (port.modality === 'text' && !isTextProducingSource(sourceNode, sourceHandle)) return false;
    if (port.modality === 'image' && !isImageProducingSource(sourceNode, sourceHandle))
      return false;
    if (port.modality === 'video' && !isVideoProducingSource(sourceNode, sourceHandle))
      return false;
  } else if (targetNode.type === 'router') {
    if (targetHandle !== ROUTER_INPUT_HANDLE) return false;
    const incoming = isTextProducingSource(sourceNode, sourceHandle)
      ? 'text'
      : isImageProducingSource(sourceNode, sourceHandle)
        ? 'image'
        : isVideoProducingSource(sourceNode, sourceHandle)
          ? 'video'
          : undefined;
    if (!incoming) return false;
    // A router that has already been locked keeps its modality: it is a pass-through, so
    // changing what it carries would silently invalidate everything downstream of it.
    const locked = declaredModality(targetNode.data?.lockedType);
    if (locked && locked !== incoming) return false;
  } else if (targetNode.type === 'batch') {
    if (targetHandle !== BATCH_ITEMS_INPUT_HANDLE) return false;
    const incoming = isTextProducingSource(sourceNode, sourceHandle)
      ? 'text'
      : isImageProducingSource(sourceNode, sourceHandle)
        ? 'image'
        : isVideoProducingSource(sourceNode, sourceHandle)
          ? 'video'
          : undefined;
    if (!incoming) return false;
    // One kind per batch. Mixing images and videos would make "run this for every item"
    // mean two different things at the consuming node. The lock counts whether it was
    // stamped or is merely implied by what is already wired in — otherwise the SECOND
    // item edge into an unstamped batch is accepted and the mix only surfaces at run time.
    const locked = batchLockedType(targetNode, edges, nodes);
    if (locked && locked !== incoming) return false;
  } else if (targetNode.type === 'export') {
    if (targetHandle !== EXPORT_MEDIA_INPUT_HANDLE) return false;
    // Media only — there is no file to hand a user for a string.
    if (
      !isImageProducingSource(sourceNode, sourceHandle) &&
      !isVideoProducingSource(sourceNode, sourceHandle)
    ) {
      return false;
    }
  } else if (targetNode.type === 'layerEditor') {
    if (targetHandle !== LAYER_EDITOR_IMAGE_INPUT_HANDLE) return false;
    if (!isImageProducingSource(sourceNode, sourceHandle)) return false;
  } else if (targetNode.type === 'omniGen') {
    if (targetHandle === 'prompt' || targetHandle === 'prompt-in') {
      if (!isTextProducingSource(sourceNode, sourceHandle)) return false;
    } else if (isImageReferenceHandle(targetHandle)) {
      if (!isImageProducingSource(sourceNode, sourceHandle)) return false;
    } else {
      return false;
    }
  } else if (isVideoGeneratorNode(targetNode)) {
    const model = resolveVideoGeneratorModel(targetNode);
    if (isTextProducingSource(sourceNode, sourceHandle)) {
      if (!['prompt', 'prompt-in', 'negative'].includes(targetHandle)) return false;
    } else if (isImageProducingSource(sourceNode, sourceHandle)) {
      // The node's own allowed set already encodes the model AND the selected
      // reference mode, so it is the single authority here.
      if (!isFrameHandle(targetHandle) && !isImageReferenceHandle(targetHandle)) return false;
      if (!getAllowedTargetHandles(targetNode).includes(targetHandle)) return false;
    } else if (
      sourceNode.type === 'video' ||
      isVideoGeneratorNode(sourceNode) ||
      sourceNode.type === 'extendVideo'
    ) {
      if (!(model === 'kling-omni' && targetHandle === VIDEO_REFERENCE_VIDEO_HANDLE)) return false;
    } else {
      return false;
    }
  } else if (isTextProducingSource(sourceNode, sourceHandle)) {
    if (!['prompt', 'prompt-in', 'negative'].includes(targetHandle)) return false;
  } else if (isImageProducingSource(sourceNode, sourceHandle)) {
    if (!isImageReferenceHandle(targetHandle)) return false;
    if (targetNode.type === 'image' || targetNode.type === 'video') return false;
  } else if (
    sourceNode.type === 'video' ||
    sourceNode.type === 'extendVideo' ||
    isVideoGeneratorNode(sourceNode)
  ) {
    return false;
  }

  if (!canAcceptSingleTextInput(edges, connection.target, targetHandle)) return false;

  const limit = getTargetHandleConnectionLimit(targetNode, targetHandle, edges);
  if (limit !== undefined) {
    if (limit <= 0) return false;
    const countedHandles = getCountedHandles(targetNode, targetHandle);
    const existingConnections = getEdgeCountForTargetHandles(
      edges,
      connection.target,
      countedHandles,
    );
    if (existingConnections >= limit) return false;
  }

  return true;
}

const PORT_LABELS: Record<string, string> = {
  text: 'Text',
  prompt: 'Prompt',
  'prompt-in': 'Prompt',
  draft: 'Planner draft',
  'draft-in': 'Planner draft',
  'text-in': 'Caption',
  negative: 'Negative prompt',
  image: 'Image',
  'ref-image': 'Reference image',
  'ref-images': 'Reference images',
  'first-frame': 'First frame',
  'last-frame': 'Last frame',
  video: 'Video',
  'ref-video': 'Reference video',
  audio: 'Audio',
  document: 'Document',
  'media-in': 'Media',
  in: 'Input',
  out: 'Output',
  items: 'Items',
  collection: 'Collection',
  'overlay-in': 'Overlay',
  'background-in': 'Background',
};

const portName = (handle: string): string =>
  PORT_LABELS[handle] ??
  handle.replace(/[-_]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());

// `node` is optional so the existing handle-only callers are unchanged; it is what lets
// an `action` / `router` / `batch` port report the modality it actually carries instead of
// falling through to 'text'.
const portDataType = (handle: string, node?: GraphNodeLike): StudioPortDataType => {
  if (node) {
    const emitted = sourceModality(node, handle);
    if (emitted) return emitted;
    if (node.type === 'action') {
      const port = actionInputPort(node.data?.actionId, handle);
      if (port) return port.modality;
    }
    // A batch takes text, images or videos on one handle. 'media' is the existing value
    // for "more than one kind"; StudioPortDataType is deliberately NOT widened, because
    // collection-ness is a runtime output shape rather than a port type.
    if (node.type === 'batch' && handle === BATCH_ITEMS_INPUT_HANDLE) return 'media';
    if (node.type === 'router') return 'media';
  }
  const mediaKind = mediaKindForHandle(handle);
  if (mediaKind) return mediaKind;
  if (handle === TIMELINE_MEDIA_INPUT_HANDLE || handle.startsWith('clip-')) return 'media';
  return 'text';
};

const isRequiredInputPort = (node: GraphNodeLike, handle: string): boolean => {
  if (handle === 'prompt' || handle === 'prompt-in') return node.type !== 'string';
  if (handle === 'video') {
    return (
      node.type === 'extendVideo' || node.type === 'videoDecode' || node.type === 'frameExtract'
    );
  }
  if (node.type === 'plannerDraft' || node.type === 'paidPublisher') {
    return publisherTargetHandles(node).includes(handle);
  }
  if (node.type === 'organicPublish') return handle === DRAFT_INPUT_HANDLE;
  // Every Canvas V3 runtime node is a transform: with nothing wired in there is nothing
  // for it to do, so its input is required rather than optional.
  if (node.type === 'action') return actionInputPort(node.data?.actionId, handle) !== undefined;
  if (node.type === 'router') return handle === ROUTER_INPUT_HANDLE;
  if (node.type === 'batch') return handle === BATCH_ITEMS_INPUT_HANDLE;
  if (node.type === 'export') return handle === EXPORT_MEDIA_INPUT_HANDLE;
  if (node.type === 'layerEditor') return handle === LAYER_EDITOR_IMAGE_INPUT_HANDLE;
  return false;
};

export function getStudioPortMetadata(
  node: GraphNodeLike,
  direction: StudioPortDirection,
  edges: GraphEdgeLike[] = [],
): StudioPortMetadata[] {
  const handles =
    direction === 'input' ? getAllowedTargetHandles(node) : getAllowedSourceHandles(node);

  return handles.map((handle) => {
    const connectionCount = edges.filter((edge) =>
      direction === 'input'
        ? edge.target === node.id && edge.targetHandle === handle
        : edge.source === node.id && edge.sourceHandle === handle,
    ).length;
    const explicitLimit =
      direction === 'input' ? getTargetHandleConnectionLimit(node, handle, edges) : undefined;
    const maxConnections =
      direction === 'input' && explicitLimit === undefined && isTextInputHandle(handle)
        ? 1
        : explicitLimit;

    return {
      id: handle,
      name: portName(handle),
      direction,
      dataType: portDataType(handle, node),
      required: direction === 'input' && isRequiredInputPort(node, handle),
      connectionCount,
      ...(maxConnections === undefined ? {} : { maxConnections }),
    };
  });
}

function wouldCreateCycle(connection: GraphConnectionLike, edges: GraphEdgeLike[]): boolean {
  if (connection.source === connection.target) return true;
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
  }

  const pending = [connection.target];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const nodeId = pending.pop();
    if (!nodeId || visited.has(nodeId)) continue;
    if (nodeId === connection.source) return true;
    visited.add(nodeId);
    pending.push(...(outgoing.get(nodeId) ?? []));
  }
  return false;
}

const validationResult = (
  connection: GraphConnectionLike,
  code: ConnectionValidationCode,
  message: string,
): ConnectionValidationResult => ({
  valid: code === 'valid',
  code,
  message,
  sourceNodeId: connection.source,
  targetNodeId: connection.target,
  sourceHandle: connection.sourceHandle ?? null,
  targetHandle: connection.targetHandle ?? null,
});

export function validateConnection(
  connection: GraphConnectionLike,
  edges: GraphEdgeLike[],
  nodes: GraphNodeLike[],
): ConnectionValidationResult {
  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  if (!sourceNode || !targetNode) {
    return validationResult(
      connection,
      'missing_node',
      'One of these nodes is no longer on the canvas.',
    );
  }
  if (connection.source === connection.target) {
    return validationResult(connection, 'self_connection', 'A node cannot connect back to itself.');
  }
  if (
    edges.some(
      (edge) =>
        edge.source === connection.source &&
        edge.target === connection.target &&
        (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null) &&
        (edge.targetHandle ?? null) === (connection.targetHandle ?? null),
    )
  ) {
    return validationResult(
      connection,
      'duplicate_connection',
      'These ports are already connected.',
    );
  }
  if (wouldCreateCycle(connection, edges)) {
    return validationResult(
      connection,
      'cycle',
      'This connection would create a loop in the workflow.',
    );
  }

  const sourcePorts = getAllowedSourceHandles(sourceNode);
  const targetPorts = getAllowedTargetHandles(targetNode);
  const sourceHandle = connection.sourceHandle ?? '';
  const targetHandle = connection.targetHandle ?? '';
  if (sourcePorts.length === 0) {
    return validationResult(
      connection,
      'source_has_no_output',
      `${sourceNode.type ?? 'This node'} does not produce an output.`,
    );
  }
  if (sourceHandle && !sourcePorts.includes(sourceHandle)) {
    return validationResult(
      connection,
      'unknown_source_port',
      `${portName(sourceHandle)} is not an output of this node.`,
    );
  }
  if (targetHandle && !targetPorts.includes(targetHandle) && !targetHandle.startsWith('clip-')) {
    return validationResult(
      connection,
      'unknown_target_port',
      `${portName(targetHandle)} is not an input on this node.`,
    );
  }

  if (!canAcceptSingleTextInput(edges, connection.target, targetHandle)) {
    return validationResult(
      connection,
      'target_at_capacity',
      `${portName(targetHandle)} already has the maximum number of connections.`,
    );
  }

  const limit = getTargetHandleConnectionLimit(targetNode, targetHandle, edges);
  if (limit !== undefined) {
    const countedHandles = getCountedHandles(targetNode, targetHandle);
    const existingConnections = getEdgeCountForTargetHandles(
      edges,
      connection.target,
      countedHandles,
    );
    if (limit <= 0 || existingConnections >= limit) {
      return validationResult(
        connection,
        'target_at_capacity',
        `${portName(targetHandle)} already has the maximum number of connections.`,
      );
    }
  }

  if (!isConnectionCompatible(connection, edges, nodes)) {
    return validationResult(
      connection,
      'incompatible_data_type',
      `${portName(sourceHandle || 'output')} cannot feed ${portName(targetHandle || 'input')}.`,
    );
  }

  return validationResult(connection, 'valid', 'Connection is valid.');
}

export function isValidConnection(
  connection: GraphConnectionLike,
  edges: GraphEdgeLike[],
  nodes: GraphNodeLike[],
): boolean {
  return validateConnection(connection, edges, nodes).valid;
}

// ---------------------------------------------------------------------------
// Media kind ↔ handle compatibility (for attach_media)
// ---------------------------------------------------------------------------

export type WorkflowMediaKind = 'image' | 'video' | 'audio' | 'document';

const IMAGE_MEDIA_HANDLES = new Set<string>([
  ...VIDEO_IMAGE_REFERENCE_HANDLES,
  ...VIDEO_FRAME_HANDLES,
  'image',
  HYPERFRAMES_IMAGE_INPUT_HANDLE,
  PUBLISH_IMAGE_INPUT_HANDLE,
]);
const VIDEO_MEDIA_HANDLES = new Set<string>([
  VIDEO_REFERENCE_VIDEO_HANDLE,
  'video',
  HYPERFRAMES_VIDEO_INPUT_HANDLE,
  PUBLISH_VIDEO_INPUT_HANDLE,
]);

export function mediaKindForHandle(handle?: string | null): WorkflowMediaKind | undefined {
  if (!handle) return undefined;
  if (IMAGE_MEDIA_HANDLES.has(handle)) return 'image';
  if (VIDEO_MEDIA_HANDLES.has(handle)) return 'video';
  if (handle === 'audio' || handle === HYPERFRAMES_AUDIO_INPUT_HANDLE) return 'audio';
  if (handle === 'document') return 'document';
  return undefined;
}

export function isMediaKindCompatibleWithHandle(
  kind: WorkflowMediaKind,
  node: GraphNodeLike,
  targetHandle: string,
): boolean {
  if (!getAllowedTargetHandles(node).includes(targetHandle)) return false;
  return mediaKindForHandle(targetHandle) === kind;
}

// ---------------------------------------------------------------------------
// Node creation defaults (mirrors StudioCanvas createNodeConfig)
// ---------------------------------------------------------------------------

const newSlotId = (suffix: number): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `slot-${suffix}`;
  }
};

export interface NodeCreationResult {
  data: Record<string, unknown>;
  style?: Record<string, number>;
}

export function createNodeData(
  type: StudioNodeType,
  overrides: Record<string, unknown> = {},
): NodeCreationResult {
  const base = baseNodeData(type);
  const merged = { ...base.data, ...overrides };
  const { data } = coerceNodeConfig(type, merged);

  for (const key of Object.keys(data)) {
    if (data[key] === undefined) delete data[key];
  }

  const style = nodeStyleFor(type, data) ?? base.style;
  return style ? { data, style } : { data };
}

function baseNodeData(type: StudioNodeType): NodeCreationResult {
  switch (type) {
    case 'nanoGen':
      return {
        data: {
          model: DEFAULT_IMAGE_GENERATOR_MODEL,
          // Derived, not literal: coerceNodeConfig re-checks the size against the
          // model anyway, so a hardcoded tier here would silently disagree with the
          // node it actually produces the moment the default model changes.
          imageSize: DEFAULT_IMAGE_SIZE[DEFAULT_IMAGE_GENERATOR_MODEL],
          positivePrompt: '',
          negativePrompt: '',
          aspectRatio: '16:9',
        },
        // Style is derived from the aspect ratio by createNodeData (nodeStyleFor);
        // 16:9 lands on the historical 400x225.
      };
    case 'apiRender':
      return {
        data: {
          templateKey: null,
          templateName: null,
          contractHash: null,
          variables: {},
          delivery: null,
          status: 'idle',
        },
        style: { width: 380, height: 520 },
      };
    case 'videoGen':
    case 'veoDirector':
    case 'veoFast': {
      return {
        data: {
          model: defaultModelForVideoNodeType(type),
          prompt: '',
          negativePrompt: '',
          enhancePrompt: false,
          // referenceMode is deliberately NOT seeded here: `overrides` merge on top of
          // this base, so a seeded mode would outlive a model override that invalidates
          // it. coerceNodeConfig derives it from the EFFECTIVE model instead.
          // The blocks READ data.aspectRatio (footer label, preview box, resize lock)
          // but the family never carried it, so a video node was born ratio-less and
          // sized by a hardcoded 16:9 style. Style is derived from it by nodeStyleFor.
          aspectRatio: '16:9',
          // Seeded, not implied: buildNodePayload fell back to 8s when this was
          // absent, so every canvas video was 8s with no control saying so and no
          // way to pick 4s or 6s (Airtable #252/#254).
          durationSeconds: DEFAULT_VIDEO_GENERATOR_DURATION,
        },
      };
    }
    case 'extendVideo':
      return { data: { prompt: '' }, style: { width: 360, height: 200 } };
    case 'timelineEditor':
      return {
        data: {
          items: [],
          outputFormat: 'mp4',
          videoCodec: 'avc',
          audioCodec: 'aac',
          committed: false,
        },
        style: { width: 320, height: 260 },
      };
    case 'hyperframesAgent':
      return {
        data: {
          label: 'HyperFrames Agent',
          model: 'gemini-3.5-flash-lite',
          prompt: '',
          aspectRatio: '16:9',
          durationSeconds: 10,
          fps: 30,
          resolution: '1080p',
          status: 'idle',
        },
        style: { width: 420, height: 360 },
      };
    case 'plannerDraft':
      return {
        data: {
          mode: 'find',
          format: 'image',
          assetSlots: [
            { id: newSlotId(1), order: 0 },
            { id: newSlotId(2), order: 1 },
          ],
        },
        style: { width: 340, height: 420 },
      };
    case 'paidPublisher':
      return {
        data: {
          format: 'image',
          assetSlots: [
            { id: newSlotId(1), order: 0 },
            { id: newSlotId(2), order: 1 },
          ],
        },
        style: { width: 320, height: 300 },
      };
    case 'organicPublish':
      return { data: { schedule: 'now' }, style: { width: 300, height: 260 } };
    case 'omniGen':
      // Style is derived from the aspect ratio by createNodeData (nodeStyleFor);
      // 16:9 lands on the historical 512x360.
      return {
        data: { model: 'gemini-omni-flash', prompt: '', aspectRatio: '16:9', variations: [] },
      };
    case 'string':
      return { data: { value: '', promptMode: 'enrich' } };
    case 'videoDecode':
      return { data: { value: '' }, style: { width: 360, height: 320 } };
    case 'frameExtract':
      return {
        data: { selector: 'last', timestampSec: null, outputWidth: 1280, quality: 0.9 },
        style: { width: 280, height: 220 },
      };
    case 'image':
      return { data: { aspectRatio: '1:1' }, style: { width: 192, height: 192 } };
    case 'audio':
      return { data: {}, style: { width: 192, height: 100 } };
    case 'document':
      return { data: { documents: [] }, style: { width: 200, height: 200 } };
    case 'video':
      return { data: {}, style: { width: 192, height: 192 } };
    case 'note':
      // Byte-for-byte the shape StudioCanvas.createNodeConfig has always built, so a note
      // created by an agent and a note created by the canvas menu are the same node.
      return { data: { content: '' }, style: { width: 260, height: 160 } };
    case 'action':
      // No op until one is chosen. An action with a null actionId exposes no handles and
      // accepts no connections — deliberately inert rather than defaulting to some op the
      // user never picked.
      return { data: { actionId: null, config: {} }, style: { width: 300, height: 220 } };
    case 'batch':
      return {
        data: { items: [], itemType: null, combine: 'zip' },
        style: { width: 300, height: 320 },
      };
    case 'router':
      return { data: { lockedType: null }, style: { width: 200, height: 120 } };
    case 'export':
      // Format stays null until there is an input: the legal formats for a still and for a
      // clip do not overlap, so a seeded default would be wrong half the time.
      return { data: { format: null }, style: { width: 280, height: 200 } };
    case 'layerEditor':
      // Style is derived from the aspect ratio by createNodeData (nodeStyleFor), the same
      // as the generator families — a 9:16 layer doc is born portrait.
      return {
        data: { layers: [], frameWidth: 2048, frameHeight: 2048, aspectRatio: '1:1' },
      };
    case 'element':
      return { data: { elementId: null }, style: { width: 240, height: 240 } };
    case 'designRef':
      return { data: { section: null, mode: 'both' }, style: { width: 240, height: 200 } };
  }
}

// ---------------------------------------------------------------------------
// Timeline vocabulary (timelineEditor)
// ---------------------------------------------------------------------------
//
// The timelineEditor takes a POOL of clip sources on one `media-in` handle, and a
// separate ordered list of timeline items that reference those sources by node id.
// Wiring a clip in does not place it; placing it does. Both halves live here so an
// agent seeding a cut and the browser rendering it agree on one vocabulary.

export const CLIP_TRANSITION_TYPES = [
  'cut',
  'fade',
  'dipWhite',
  'crossDissolve',
  'slideLeft',
  'slideRight',
  'slideUp',
  'slideDown',
  'wipeLeft',
  'wipeRight',
  'zoomIn',
  'spin',
] as const;

export type ClipTransitionType = (typeof CLIP_TRANSITION_TYPES)[number];

export const clipTransitionSchema = z
  .object({
    type: z.enum(CLIP_TRANSITION_TYPES),
    durationSec: z.number().min(0).max(5),
  })
  .strict();

/**
 * One placement on the timeline. `sourceNodeId` MUST name a node wired into the
 * editor's `media-in` pool — an item pointing at a node that is not connected
 * renders nothing, silently, which is the single most likely way an agent-authored
 * timeline goes wrong. applyOps enforces it.
 */
export const timelineItemSpecSchema = z
  .object({
    sourceNodeId: z.string().min(1),
    order: z.number().int().nonnegative(),
    kind: z.enum(['video', 'image']).optional(),
    trimStartSec: z.number().min(0).optional(),
    trimEndSec: z.number().min(0).optional(),
    /** How long a still holds on screen. Images only. */
    durationSec: z.number().min(0).max(60).optional(),
    muteAudio: z.boolean().optional(),
    /** The transition INTO this clip, from the one before it. */
    transition: clipTransitionSchema.optional(),
  })
  .strict();

export type TimelineItemSpec = z.infer<typeof timelineItemSpecSchema>;

// ---------------------------------------------------------------------------
// Agent-written node config
// ---------------------------------------------------------------------------
//
// Node `data` is a loose record by design — the canvas puts runtime flags, media
// coordinates and layout hints in it, and no single schema describes all of that.
// The consequence, until now, was that the enum-shaped CONFIG fields an agent is
// allowed to write were validated NOWHERE: an invented `imageSize: '1024px'` sat
// on the node until the user pressed Run and the generation endpoint 400d, with a
// prompt hint as the only guard. This is the write-time guard.
//
// It is patch-safe: only the keys PRESENT in `patch` are touched, with `current`
// supplying the node's existing values for context (an `update_node` that sets only
// a prompt must not have a model injected into it).

export interface NodeConfigCoercion {
  data: Record<string, unknown>;
  /** Human-readable corrections, for warning the agent that wrote them. */
  changes: string[];
}

const defaultModelForVideoNodeType = (type: VideoGeneratorNodeType): VideoGeneratorModel =>
  type === 'veoDirector'
    ? 'veo-3.1'
    : type === 'veoFast'
      ? 'veo-3.1-fast'
      : DEFAULT_VIDEO_GENERATOR_MODEL;

/**
 * `referenceMode` selects which image inputs the node exposes, so a mode the model
 * does not accept is not a cosmetic error — it silently changes which edges survive
 * the next load. A model change can invalidate a mode that was legal for the previous
 * model, so the mode is re-checked whenever either field is written.
 */
function coerceVideoGeneratorConfig(
  type: VideoGeneratorNodeType,
  patch: Record<string, unknown>,
  current: Record<string, unknown>,
): NodeConfigCoercion {
  const changes: string[] = [];
  const next: Record<string, unknown> = { ...patch };

  if ('model' in next && !isVideoGeneratorModel(next.model)) {
    const fallback = defaultModelForVideoNodeType(type);
    changes.push(`"${String(next.model)}" is not a video generator model — using ${fallback}`);
    next.model = fallback;
  }

  const model = isVideoGeneratorModel(next.model)
    ? next.model
    : isVideoGeneratorModel(current.model)
      ? current.model
      : defaultModelForVideoNodeType(type);

  if ('referenceMode' in next || 'model' in next) {
    const requested = 'referenceMode' in next ? next.referenceMode : current.referenceMode;
    const legal = getVideoGeneratorReferenceModes(model);
    const mode = legal.includes(requested as VideoGeneratorReferenceMode)
      ? (requested as VideoGeneratorReferenceMode)
      : legal[0];

    if (requested !== undefined && requested !== mode) {
      changes.push(
        `referenceMode "${String(requested)}" is not valid for ${model} — using "${mode}"`,
      );
    }
    next.referenceMode = mode;
  }

  // Resolution and duration are one setting on Veo: above 720p only 8s renders. A
  // resolution write that leaves a 4s duration behind produces a node that looks
  // configured and 400s at Run, so the pair is re-derived whenever either moves.
  if ('durationSeconds' in next || 'resolution' in next || 'model' in next) {
    const requested = 'durationSeconds' in next ? next.durationSeconds : current.durationSeconds;
    const resolution = 'resolution' in next ? next.resolution : current.resolution;
    const duration = coerceVideoGeneratorDuration(model, resolution, requested);

    if (duration !== undefined) {
      if (requested !== undefined && Number(requested) !== duration) {
        changes.push(
          videoResolutionRequiresEightSeconds(model, resolution)
            ? `${String(resolution)} renders only at 8 seconds — using 8s instead of ${String(requested)}`
            : `durationSeconds "${String(requested)}" is not valid for ${model} — using ${duration}s`,
        );
      }
      next.durationSeconds = duration;
    }
  }

  return { data: next, changes };
}

/**
 * An `actionId` is not a cosmetic field: it decides which handles the node HAS and what
 * they accept, so an invented one produces a node with no ports that silently drops
 * every edge somebody wires to it. Unknown ids are dropped at write time.
 *
 * `config` is deliberately NOT validated here yet, and is not on the agent field
 * whitelist — the per-op schemas in `action-registry.ts` land with the runtime that
 * reads them.
 */
function coerceActionConfig(patch: Record<string, unknown>): NodeConfigCoercion {
  if (!('actionId' in patch)) return { data: patch, changes: [] };
  if (patch.actionId === null || patch.actionId === undefined || isActionId(patch.actionId)) {
    return { data: patch, changes: [] };
  }
  return {
    data: { ...patch, actionId: null },
    changes: [`"${String(patch.actionId)}" is not an action in the catalog — cleared it`],
  };
}

export function coerceNodeConfig(
  type: StudioNodeType,
  patch: Record<string, unknown>,
  current: Record<string, unknown> = {},
): NodeConfigCoercion {
  if (isVideoGeneratorNodeType(type)) return coerceVideoGeneratorConfig(type, patch, current);
  if (type === 'action') return coerceActionConfig(patch);
  if (type !== 'nanoGen') return { data: patch, changes: [] };

  const changes: string[] = [];
  const next: Record<string, unknown> = { ...patch };

  if ('model' in next && !isImageGeneratorModel(next.model)) {
    changes.push(
      `"${String(next.model)}" is not an image generator model — using ${DEFAULT_IMAGE_GENERATOR_MODEL}`,
    );
    next.model = DEFAULT_IMAGE_GENERATOR_MODEL;
  }

  const model = isImageGeneratorModel(next.model)
    ? next.model
    : isImageGeneratorModel(current.model)
      ? current.model
      : DEFAULT_IMAGE_GENERATOR_MODEL;

  // A model change can invalidate a size that was legal for the previous model, so
  // the size is re-checked whenever either field is written.
  if ('imageSize' in next || 'model' in next) {
    const requested = 'imageSize' in next ? next.imageSize : current.imageSize;
    const size = coerceImageSize(model, requested);
    if (size === undefined) {
      if (requested !== undefined) {
        changes.push(`${model} takes no image size — dropped "${String(requested)}"`);
      }
      next.imageSize = undefined;
    } else {
      if (requested !== undefined && requested !== size) {
        changes.push(
          `imageSize "${String(requested)}" is not valid for ${model} — using "${size}"`,
        );
      }
      next.imageSize = size;
    }
  }

  return { data: next, changes };
}

// Which sizing envelope a generator type is born in. A type absent from this map is
// not a generator and keeps whatever fixed style baseNodeData gives it.
const GENERATOR_NODE_BOUNDS_BY_TYPE: Partial<Record<StudioNodeType, GeneratorNodeBounds>> = {
  nanoGen: IMAGE_GENERATOR_NODE_BOUNDS,
  videoGen: VIDEO_GENERATOR_NODE_BOUNDS,
  veoDirector: VIDEO_GENERATOR_NODE_BOUNDS,
  veoFast: VIDEO_GENERATOR_NODE_BOUNDS,
  omniGen: OMNI_GENERATOR_NODE_BOUNDS,
  // A layer document has a real frame ratio, so its node box carries it like a
  // generator's does. The other Canvas V3 types have no ratio and keep the fixed style
  // baseNodeData gives them.
  layerEditor: LAYER_EDITOR_NODE_BOUNDS,
};

/**
 * The style a generator node carries for the aspect ratio in `data` — the whole
 * family, not just nanoGen. While this covered nanoGen alone, every video node fell
 * back to a hardcoded 16:9 box, so a 9:16 selection produced a landscape node whose
 * footer read "9:16" (Airtable #230).
 */
export function nodeStyleFor(
  type: StudioNodeType,
  data: Record<string, unknown>,
): Record<string, number> | undefined {
  const bounds = GENERATOR_NODE_BOUNDS_BY_TYPE[type];
  if (!bounds) return undefined;
  const aspectRatio = typeof data.aspectRatio === 'string' ? data.aspectRatio : '16:9';
  const { width, height } = generatorNodeStyle(aspectRatio, bounds);
  return { width, height };
}
