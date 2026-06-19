import { z } from "zod";

// Canonical AI Studio canvas graph rules — node-type vocabulary, handle
// compatibility, connection limits, and media↔handle compatibility. Ported from
// the Frontend StudioCanvas (isValidConnection / videoModel / connectionValidation
// / createNodeConfig) so the Backend MCP tool validates exactly what the canvas
// accepts and the Frontend delegates to one source of truth.

export const STUDIO_NODE_TYPES = [
  "string",
  "nanoGen",
  "videoGen",
  "veoDirector",
  "veoFast",
  "extendVideo",
  "videoEditor",
  "image",
  "video",
  "audio",
  "document",
  "videoDecode",
] as const;

export type StudioNodeType = (typeof STUDIO_NODE_TYPES)[number];
export const studioNodeTypeEnum = z.enum(STUDIO_NODE_TYPES);

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
export type GraphConnectionLike = Omit<GraphEdgeLike, "id">;

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
  "kling-omni",
  "pixverse-v6",
  "seedance-2.0",
  "veo-3.1-fast",
  "veo-3.1-lite",
  "veo-3.1",
] as const;
export type VideoGeneratorModel = (typeof VIDEO_GENERATOR_MODELS)[number];

export const DEFAULT_VIDEO_GENERATOR_MODEL: VideoGeneratorModel = "veo-3.1-fast";

export const VIDEO_GENERATOR_MODEL_LABELS: Record<VideoGeneratorModel, string> = {
  "veo-3.1": "Veo 3.1",
  "veo-3.1-fast": "Veo 3.1 Fast",
  "veo-3.1-lite": "Veo 3.1 Lite",
  "kling-omni": "Kling Omni",
  "pixverse-v6": "Pixverse V6",
  "seedance-2.0": "Seedance 2.0",
};

const VIDEO_GENERATOR_NODE_TYPES = new Set(["videoGen", "veoDirector", "veoFast"]);

export const VIDEO_IMAGE_REFERENCE_HANDLES = ["ref-image", "ref-images"] as const;
export const VIDEO_FRAME_HANDLES = ["first-frame", "last-frame"] as const;
export const VIDEO_REFERENCE_VIDEO_HANDLE = "ref-video" as const;

export type VideoGeneratorNodeType = "videoGen" | "veoDirector" | "veoFast";

const isVideoGeneratorModel = (value: unknown): value is VideoGeneratorModel =>
  typeof value === "string" && (VIDEO_GENERATOR_MODELS as readonly string[]).includes(value);

export const isVideoGeneratorNodeType = (nodeType?: string): nodeType is VideoGeneratorNodeType =>
  typeof nodeType === "string" && VIDEO_GENERATOR_NODE_TYPES.has(nodeType);

export function resolveVideoGeneratorModel(node: { type?: string; data?: Record<string, unknown> }): VideoGeneratorModel {
  const model = node.data?.model;
  if (isVideoGeneratorModel(model)) return model;
  if (node.type === "veoFast") return "veo-3.1-fast";
  if (node.type === "veoDirector") return "veo-3.1";
  return DEFAULT_VIDEO_GENERATOR_MODEL;
}

export function getVideoGeneratorReferenceMode(model: VideoGeneratorModel): "images" | "frames" | "omni" {
  if (model === "veo-3.1-fast" || model === "veo-3.1-lite") return "frames";
  if (model === "kling-omni") return "omni";
  return "images";
}

export function supportsVideoGeneratorFrameInputs(model: VideoGeneratorModel): boolean {
  return model === "veo-3.1-fast" || model === "veo-3.1-lite" || model === "seedance-2.0";
}

export function supportsVideoGeneratorReferenceVideo(model: VideoGeneratorModel): boolean {
  return model === "kling-omni" || model === "seedance-2.0";
}

export function supportsVideoGeneratorReferenceImages(model: VideoGeneratorModel): boolean {
  return model !== "veo-3.1-fast" && model !== "veo-3.1-lite";
}

export function getVideoGeneratorTargetHandles(model: VideoGeneratorModel): string[] {
  if (model === "veo-3.1-fast" || model === "veo-3.1-lite") {
    return ["prompt-in", "prompt", "negative", ...VIDEO_FRAME_HANDLES];
  }
  if (model === "kling-omni") {
    return ["prompt-in", "prompt", "negative", ...VIDEO_IMAGE_REFERENCE_HANDLES, VIDEO_REFERENCE_VIDEO_HANDLE];
  }
  if (model === "pixverse-v6") {
    return ["prompt-in", "prompt", "negative", VIDEO_IMAGE_REFERENCE_HANDLES[0]];
  }
  if (model === "seedance-2.0") {
    return ["prompt-in", "prompt", "negative", ...VIDEO_IMAGE_REFERENCE_HANDLES, ...VIDEO_FRAME_HANDLES, VIDEO_REFERENCE_VIDEO_HANDLE];
  }
  return ["prompt-in", "prompt", "negative", ...VIDEO_IMAGE_REFERENCE_HANDLES];
}

export function getVideoGeneratorImageLimit(model: VideoGeneratorModel, hasReferenceVideo: boolean): number | undefined {
  if (model === "veo-3.1") return 3;
  if (model === "kling-omni") return hasReferenceVideo ? 4 : 7;
  if (model === "pixverse-v6") return 1;
  if (model === "seedance-2.0") return 9;
  return undefined;
}

export function getVideoGeneratorBackendModel(model: VideoGeneratorModel): string {
  if (model === "veo-3.1-fast") return "veo-3.1-fast-generate-preview";
  if (model === "veo-3.1-lite") return "veo-3.1-lite-generate-preview";
  if (model === "kling-omni") return "kling-omni";
  if (model === "pixverse-v6") return "pixverse-v6";
  if (model === "seedance-2.0") return "seedance-2.0";
  return "veo-3.1-generate-preview";
}

// ---------------------------------------------------------------------------
// Single-text-input guards
// ---------------------------------------------------------------------------

const TEXT_INPUT_HANDLES = new Set(["prompt", "prompt-in", "trigger", "negative", "input", "audio", "video"]);

export function isTextInputHandle(handleId?: string | null): boolean {
  if (!handleId) return false;
  return TEXT_INPUT_HANDLES.has(handleId);
}

export function hasExistingTargetConnection(edges: GraphEdgeLike[], targetId: string, targetHandle?: string | null): boolean {
  if (!targetHandle) return false;
  return edges.some((edge) => edge.target === targetId && edge.targetHandle === targetHandle);
}

export function canAcceptSingleTextInput(edges: GraphEdgeLike[], targetId: string, targetHandle?: string | null): boolean {
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
  node.type === "video" || node.type === "extendVideo" || node.type === "videoEditor" || isVideoGeneratorNodeType(node.type);

const isTextProducingSource = (node: GraphNodeLike): boolean => node.type === "string" || node.type === "videoDecode";

export const isClipSlotHandle = (handleId?: string | null): boolean =>
  typeof handleId === "string" && handleId.startsWith("clip-");

const isImageReferenceHandle = (handleId?: string | null): boolean =>
  typeof handleId === "string" && IMAGE_REFERENCE_HANDLE_SET.has(handleId);

const isFrameHandle = (handleId?: string | null): boolean => typeof handleId === "string" && FRAME_HANDLE_SET.has(handleId);

const getEdgeCountForTargetHandles = (edges: GraphEdgeLike[], targetId: string, targetHandles: readonly string[]): number =>
  edges.filter((edge) => edge.target === targetId && targetHandles.includes(edge.targetHandle ?? "")).length;

const getEdgeCountForTargetHandle = (edges: GraphEdgeLike[], targetId: string, targetHandle: string): number =>
  edges.filter((edge) => edge.target === targetId && edge.targetHandle === targetHandle).length;

const getCountedHandles = (node: GraphNodeLike, targetHandle: string): readonly string[] => {
  if (node.type === "nanoGen" && isImageReferenceHandle(targetHandle)) return VIDEO_IMAGE_REFERENCE_HANDLES;
  if (isVideoGeneratorNode(node) && isImageReferenceHandle(targetHandle)) return VIDEO_IMAGE_REFERENCE_HANDLES;
  return [targetHandle];
};

export const getAllowedSourceHandles = (node: GraphNodeLike): string[] => {
  switch (node.type) {
    case "string":
    case "videoDecode":
      return ["text"];
    case "image":
      return ["image"];
    case "video":
      return ["video"];
    case "audio":
      return ["audio"];
    case "document":
      return ["document"];
    case "nanoGen":
      return ["image"];
    case "extendVideo":
    case "videoEditor":
      return ["video"];
    default:
      return isVideoGeneratorNode(node) ? ["video"] : [];
  }
};

export const getAllowedTargetHandles = (node: GraphNodeLike): string[] => {
  switch (node.type) {
    case "nanoGen":
      return ["prompt", ...VIDEO_IMAGE_REFERENCE_HANDLES, "trigger"];
    case "extendVideo":
      return ["prompt", "video"];
    case "videoEditor": {
      const slots = (node.data as { clipSlots?: Array<{ id?: string }> } | undefined)?.clipSlots ?? [];
      return slots
        .map((slot) => (typeof slot?.id === "string" ? `clip-${slot.id}` : null))
        .filter((handle): handle is string => Boolean(handle));
    }
    case "string":
      return ["image", "audio", "document", "video"];
    case "videoDecode":
      return ["video"];
    case "image":
    case "video":
    case "audio":
    case "document":
      return [];
    default:
      return isVideoGeneratorNode(node) ? getVideoGeneratorTargetHandles(resolveVideoGeneratorModel(node)) : [];
  }
};

export function getTargetHandleConnectionLimit(
  node: GraphNodeLike,
  targetHandle: string,
  edges: GraphEdgeLike[],
): number | undefined {
  if (node.type === "nanoGen" && isImageReferenceHandle(targetHandle)) {
    const configured = (node.data as { maxReferenceImages?: unknown })?.maxReferenceImages;
    const limit = typeof configured === "number" ? Math.floor(configured) : undefined;
    if (limit !== undefined && Number.isFinite(limit) && limit > 0) return limit;
    return 14;
  }

  if (node.type === "extendVideo" && targetHandle === "video") return 1;
  if (node.type === "videoDecode" && targetHandle === "video") return 1;
  if (node.type === "videoEditor" && isClipSlotHandle(targetHandle)) return 1;

  if (!isVideoGeneratorNode(node)) return undefined;

  const model = resolveVideoGeneratorModel(node);
  if (model === "veo-3.1-fast" || model === "veo-3.1-lite") {
    return targetHandle === "first-frame" || targetHandle === "last-frame" ? 1 : undefined;
  }
  if (model === "veo-3.1") {
    return isImageReferenceHandle(targetHandle) ? 3 : undefined;
  }
  if (model === "kling-omni") {
    if (targetHandle === VIDEO_REFERENCE_VIDEO_HANDLE) {
      const currentImageCount = getEdgeCountForTargetHandles(edges, node.id, VIDEO_IMAGE_REFERENCE_HANDLES);
      return currentImageCount > 4 ? 0 : 1;
    }
    if (isImageReferenceHandle(targetHandle)) {
      const hasReferenceVideo = getEdgeCountForTargetHandle(edges, node.id, VIDEO_REFERENCE_VIDEO_HANDLE) > 0;
      return getVideoGeneratorImageLimit(model, hasReferenceVideo);
    }
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
  const targetHandle = connection.targetHandle ?? "";

  if (!sourceNode || !targetNode) return false;

  if (isTextProducingSource(sourceNode) && ["prompt", "prompt-in", "negative"].includes(targetHandle)) {
    return !hasExistingTargetConnection(edges, connection.target, targetHandle);
  }

  if (targetNode.type === "string") {
    const handle = targetHandle;
    if (!canAcceptSingleTextInput(edges, connection.target, handle)) return false;
    if (handle === "image" && (sourceNode.type === "image" || sourceNode.type === "nanoGen")) return true;
    if (handle === "audio" && sourceNode.type === "audio") return true;
    if (handle === "video" && sourceNode.type === "video") return true;
    if (handle === "document" && sourceNode.type === "document") return true;
    return false;
  }

  if (targetNode.type === "nanoGen") {
    if (isImageReferenceHandle(targetHandle)) {
      if (sourceNode.type !== "image" && sourceNode.type !== "nanoGen") return false;
    } else if (targetHandle === "prompt") {
      if (!isTextProducingSource(sourceNode)) return false;
    } else {
      return false;
    }
  } else if (targetNode.type === "extendVideo") {
    if (targetHandle === "video") {
      if (!isVideoProducingSource(sourceNode)) return false;
    } else if (targetHandle === "prompt") {
      if (!isTextProducingSource(sourceNode)) return false;
    } else {
      return false;
    }
  } else if (targetNode.type === "videoEditor") {
    if (!isClipSlotHandle(targetHandle)) return false;
    if (!isVideoProducingSource(sourceNode)) return false;
  } else if (targetNode.type === "videoDecode") {
    if (targetHandle !== "video") return false;
    if (!isVideoProducingSource(sourceNode)) return false;
  } else if (isVideoGeneratorNode(targetNode)) {
    const model = resolveVideoGeneratorModel(targetNode);
    if (isTextProducingSource(sourceNode)) {
      if (!["prompt", "prompt-in", "negative"].includes(targetHandle)) return false;
    } else if (sourceNode.type === "image" || sourceNode.type === "nanoGen") {
      if (model === "veo-3.1-fast" || model === "veo-3.1-lite") {
        if (!isFrameHandle(targetHandle)) return false;
      } else if (!isImageReferenceHandle(targetHandle)) {
        return false;
      }
    } else if (sourceNode.type === "video" || isVideoGeneratorNode(sourceNode) || sourceNode.type === "extendVideo") {
      if (!(model === "kling-omni" && targetHandle === VIDEO_REFERENCE_VIDEO_HANDLE)) return false;
    } else {
      return false;
    }
  } else if (isTextProducingSource(sourceNode)) {
    if (!["prompt", "prompt-in", "negative"].includes(targetHandle)) return false;
  } else if (sourceNode.type === "image" || sourceNode.type === "nanoGen") {
    if (!isImageReferenceHandle(targetHandle)) return false;
    if (targetNode.type === "image" || targetNode.type === "video") return false;
  } else if (sourceNode.type === "video" || sourceNode.type === "extendVideo" || isVideoGeneratorNode(sourceNode)) {
    return false;
  }

  if (!canAcceptSingleTextInput(edges, connection.target, targetHandle)) return false;

  const limit = getTargetHandleConnectionLimit(targetNode, targetHandle, edges);
  if (limit !== undefined) {
    if (limit <= 0) return false;
    const countedHandles = getCountedHandles(targetNode, targetHandle);
    const existingConnections = getEdgeCountForTargetHandles(edges, connection.target, countedHandles);
    if (existingConnections >= limit) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Media kind ↔ handle compatibility (for attach_media)
// ---------------------------------------------------------------------------

export type WorkflowMediaKind = "image" | "video" | "audio" | "document";

const IMAGE_MEDIA_HANDLES = new Set<string>([...VIDEO_IMAGE_REFERENCE_HANDLES, ...VIDEO_FRAME_HANDLES, "image"]);
const VIDEO_MEDIA_HANDLES = new Set<string>([VIDEO_REFERENCE_VIDEO_HANDLE, "video"]);

export function mediaKindForHandle(handle?: string | null): WorkflowMediaKind | undefined {
  if (!handle) return undefined;
  if (IMAGE_MEDIA_HANDLES.has(handle)) return "image";
  if (VIDEO_MEDIA_HANDLES.has(handle)) return "video";
  if (handle === "audio") return "audio";
  if (handle === "document") return "document";
  return undefined;
}

export function isMediaKindCompatibleWithHandle(kind: WorkflowMediaKind, node: GraphNodeLike, targetHandle: string): boolean {
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
  return { ...base, data: { ...base.data, ...overrides } };
}

function baseNodeData(type: StudioNodeType): NodeCreationResult {
  switch (type) {
    case "nanoGen":
      return {
        data: { model: "nano-banana-2", imageSize: "512px", positivePrompt: "", aspectRatio: "16:9" },
        style: { width: 400, height: 225 },
      };
    case "videoGen":
    case "veoDirector":
    case "veoFast": {
      const model = type === "veoDirector" ? "veo-3.1" : type === "veoFast" ? "veo-3.1-fast" : DEFAULT_VIDEO_GENERATOR_MODEL;
      return {
        data: { model, prompt: "", negativePrompt: "", enhancePrompt: false, referenceMode: getVideoGeneratorReferenceMode(model) },
        style: { width: 512, height: 288 },
      };
    }
    case "extendVideo":
      return { data: { prompt: "" }, style: { width: 360, height: 200 } };
    case "videoEditor":
      return {
        data: {
          clipSlots: [
            { id: newSlotId(1), order: 0 },
            { id: newSlotId(2), order: 1 },
          ],
          outputFormat: "mp4",
          videoCodec: "avc",
          audioCodec: "aac",
        },
        style: { width: 380, height: 460 },
      };
    case "string":
      return { data: { value: "" } };
    case "videoDecode":
      return { data: { value: "" }, style: { width: 360, height: 320 } };
    case "image":
      return { data: { aspectRatio: "1:1" }, style: { width: 192, height: 192 } };
    case "audio":
      return { data: {}, style: { width: 192, height: 100 } };
    case "document":
      return { data: { documents: [] }, style: { width: 200, height: 200 } };
    case "video":
      return { data: {}, style: { width: 192, height: 192 } };
  }
}
