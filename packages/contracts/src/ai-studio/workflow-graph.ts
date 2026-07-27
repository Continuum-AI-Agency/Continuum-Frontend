import { z } from 'zod';
import {
  coerceImageSize,
  DEFAULT_IMAGE_GENERATOR_MODEL,
  isImageGeneratorModel,
} from './image-size';
import {
  type GeneratorNodeBounds,
  generatorNodeStyle,
  IMAGE_GENERATOR_NODE_BOUNDS,
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
  'organicPublisher',
  'paidPublisher',
  'omniGen',
  'image',
  'video',
  'audio',
  'document',
  'videoDecode',
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

const VIDEO_GENERATOR_NODE_TYPES = new Set(['videoGen', 'veoDirector', 'veoFast']);

export const VIDEO_IMAGE_REFERENCE_HANDLES = ['ref-image', 'ref-images'] as const;
export const VIDEO_FRAME_HANDLES = ['first-frame', 'last-frame'] as const;
export const VIDEO_REFERENCE_VIDEO_HANDLE = 'ref-video' as const;

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

const isVideoProducingSource = (node: GraphNodeLike): boolean =>
  node.type === 'video' ||
  node.type === 'extendVideo' ||
  node.type === 'timelineEditor' ||
  node.type === 'hyperframesAgent' ||
  node.type === 'omniGen' ||
  isVideoGeneratorNodeType(node.type);

const isTextProducingSource = (node: GraphNodeLike): boolean =>
  node.type === 'string' || node.type === 'videoDecode';

// Timeline Editor (timelineEditor) input pool: a single multi-connection target
// handle `media-in` that accepts many video-producing sources and/or images.
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
// carousel slots. They have no source output, so they are deliberately absent
// from the media-producing source predicates.
export const PUBLISH_IMAGE_INPUT_HANDLE = 'image-in';
export const PUBLISH_VIDEO_INPUT_HANDLE = 'video-in';
export const PUBLISH_ASSET_INPUT_PREFIX = 'asset-';
export const isPublishAssetHandle = (handleId?: string | null): boolean =>
  typeof handleId === 'string' && handleId.startsWith(PUBLISH_ASSET_INPUT_PREFIX);

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
      return ['image'];
    case 'video':
      return ['video'];
    case 'audio':
      return ['audio'];
    case 'document':
      return ['document'];
    case 'nanoGen':
      return ['image'];
    case 'extendVideo':
    case 'timelineEditor':
    case 'hyperframesAgent':
      return ['video'];
    case 'omniGen':
      return ['video'];
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
    case 'organicPublisher':
    case 'paidPublisher':
      return publisherTargetHandles(node);
    case 'omniGen':
      return ['prompt-in', 'prompt', 'ref-images'];
    case 'string':
      return ['image', 'audio', 'document', 'video'];
    case 'videoDecode':
      return ['video'];
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
    (node.type === 'organicPublisher' || node.type === 'paidPublisher') &&
    publisherTargetHandles(node).includes(targetHandle)
  )
    return 1;
  if (node.type === 'omniGen' && isImageReferenceHandle(targetHandle)) return 3;

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

export function isValidConnection(
  connection: GraphConnectionLike,
  edges: GraphEdgeLike[],
  nodes: GraphNodeLike[],
): boolean {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const sourceNode = nodeById.get(connection.source);
  const targetNode = nodeById.get(connection.target);
  const targetHandle = connection.targetHandle ?? '';

  if (!sourceNode || !targetNode) return false;

  if (
    isTextProducingSource(sourceNode) &&
    ['prompt', 'prompt-in', 'negative'].includes(targetHandle)
  ) {
    return !hasExistingTargetConnection(edges, connection.target, targetHandle);
  }

  if (targetNode.type === 'string') {
    const handle = targetHandle;
    if (!canAcceptSingleTextInput(edges, connection.target, handle)) return false;
    if (handle === 'image' && (sourceNode.type === 'image' || sourceNode.type === 'nanoGen'))
      return true;
    if (handle === 'audio' && sourceNode.type === 'audio') return true;
    if (handle === 'video' && sourceNode.type === 'video') return true;
    if (handle === 'document' && sourceNode.type === 'document') return true;
    return false;
  }

  if (targetNode.type === 'nanoGen') {
    if (isImageReferenceHandle(targetHandle)) {
      if (sourceNode.type !== 'image' && sourceNode.type !== 'nanoGen') return false;
    } else if (targetHandle === 'prompt' || targetHandle === 'negative') {
      if (!isTextProducingSource(sourceNode)) return false;
    } else {
      return false;
    }
  } else if (targetNode.type === 'extendVideo') {
    if (targetHandle === 'video') {
      if (!isVideoProducingSource(sourceNode)) return false;
    } else if (targetHandle === 'prompt') {
      if (!isTextProducingSource(sourceNode)) return false;
    } else {
      return false;
    }
  } else if (targetNode.type === 'timelineEditor') {
    if (!isTimelineMediaHandle(targetHandle)) return false;
    const isImageSource = sourceNode.type === 'image' || sourceNode.type === 'nanoGen';
    if (!isVideoProducingSource(sourceNode) && !isImageSource) return false;
  } else if (targetNode.type === 'hyperframesAgent') {
    if (targetHandle === HYPERFRAMES_PROMPT_INPUT_HANDLE) {
      if (!isTextProducingSource(sourceNode)) return false;
    } else if (targetHandle === HYPERFRAMES_IMAGE_INPUT_HANDLE) {
      if (sourceNode.type !== 'image' && sourceNode.type !== 'nanoGen') return false;
    } else if (targetHandle === HYPERFRAMES_VIDEO_INPUT_HANDLE) {
      if (!isVideoProducingSource(sourceNode)) return false;
    } else if (targetHandle === HYPERFRAMES_AUDIO_INPUT_HANDLE) {
      if (sourceNode.type !== 'audio') return false;
    } else {
      return false;
    }
  } else if (targetNode.type === 'videoDecode') {
    if (targetHandle !== 'video') return false;
    if (!isVideoProducingSource(sourceNode)) return false;
  } else if (targetNode.type === 'organicPublisher' || targetNode.type === 'paidPublisher') {
    const format = publisherFormat(targetNode);
    if (!publisherTargetHandles(targetNode).includes(targetHandle)) return false;
    const isImageSource = sourceNode.type === 'image' || sourceNode.type === 'nanoGen';
    const isVideoSource = isVideoProducingSource(sourceNode);
    if (format === 'image' && !isImageSource) return false;
    if (format === 'video' && !isVideoSource) return false;
    if (format === 'carousel' && !isImageSource && !isVideoSource) return false;
  } else if (targetNode.type === 'omniGen') {
    if (targetHandle === 'prompt' || targetHandle === 'prompt-in') {
      if (!isTextProducingSource(sourceNode)) return false;
    } else if (isImageReferenceHandle(targetHandle)) {
      if (sourceNode.type !== 'image' && sourceNode.type !== 'nanoGen') return false;
    } else {
      return false;
    }
  } else if (isVideoGeneratorNode(targetNode)) {
    const model = resolveVideoGeneratorModel(targetNode);
    if (isTextProducingSource(sourceNode)) {
      if (!['prompt', 'prompt-in', 'negative'].includes(targetHandle)) return false;
    } else if (sourceNode.type === 'image' || sourceNode.type === 'nanoGen') {
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
  } else if (isTextProducingSource(sourceNode)) {
    if (!['prompt', 'prompt-in', 'negative'].includes(targetHandle)) return false;
  } else if (sourceNode.type === 'image' || sourceNode.type === 'nanoGen') {
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
          imageSize: '512px',
          positivePrompt: '',
          negativePrompt: '',
          aspectRatio: '16:9',
        },
        // Style is derived from the aspect ratio by createNodeData (nodeStyleFor);
        // 16:9 lands on the historical 400x225.
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
    case 'organicPublisher':
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
    case 'image':
      return { data: { aspectRatio: '1:1' }, style: { width: 192, height: 192 } };
    case 'audio':
      return { data: {}, style: { width: 192, height: 100 } };
    case 'document':
      return { data: { documents: [] }, style: { width: 200, height: 200 } };
    case 'video':
      return { data: {}, style: { width: 192, height: 192 } };
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

  return { data: next, changes };
}

export function coerceNodeConfig(
  type: StudioNodeType,
  patch: Record<string, unknown>,
  current: Record<string, unknown> = {},
): NodeConfigCoercion {
  if (isVideoGeneratorNodeType(type)) return coerceVideoGeneratorConfig(type, patch, current);
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
