import type { StudioNode } from "../types";

export const VIDEO_GENERATOR_MODELS = ["kling-omni", "veo-3.1-fast", "veo-3.1"] as const;
export type VideoGeneratorModel = (typeof VIDEO_GENERATOR_MODELS)[number];

export const DEFAULT_VIDEO_GENERATOR_MODEL: VideoGeneratorModel = "veo-3.1-fast";

export const VIDEO_GENERATOR_MODEL_LABELS: Record<VideoGeneratorModel, string> = {
  "veo-3.1": "Veo 3.1",
  "veo-3.1-fast": "Veo 3.1 Fast",
  "kling-omni": "Kling Omni",
};

const VIDEO_GENERATOR_NODE_TYPES = new Set(["videoGen", "veoDirector", "veoFast"] as const);

export const VIDEO_IMAGE_REFERENCE_HANDLES = ["ref-image", "ref-images"] as const;
export const VIDEO_FRAME_HANDLES = ["first-frame", "last-frame"] as const;
export const VIDEO_REFERENCE_VIDEO_HANDLE = "ref-video" as const;

export type VideoGeneratorNodeType = "videoGen" | "veoDirector" | "veoFast";

const isVideoGeneratorModel = (value: unknown): value is VideoGeneratorModel =>
  typeof value === "string" && (VIDEO_GENERATOR_MODELS as readonly string[]).includes(value);

export const isVideoGeneratorNodeType = (
  nodeType?: string
): nodeType is VideoGeneratorNodeType =>
  typeof nodeType === "string" &&
  (VIDEO_GENERATOR_NODE_TYPES as ReadonlySet<string>).has(nodeType);

export function resolveVideoGeneratorModel(
  node: Pick<StudioNode, "type" | "data"> | { type?: string; data?: Record<string, unknown> }
): VideoGeneratorModel {
  const model = node.data?.model;
  if (isVideoGeneratorModel(model)) {
    return model;
  }

  if (node.type === "veoFast") {
    return "veo-3.1-fast";
  }

  if (node.type === "veoDirector") {
    return "veo-3.1";
  }

  return DEFAULT_VIDEO_GENERATOR_MODEL;
}

export function getVideoGeneratorReferenceMode(
  model: VideoGeneratorModel
): "images" | "frames" | "omni" {
  if (model === "veo-3.1-fast") return "frames";
  if (model === "kling-omni") return "omni";
  return "images";
}

export function getVideoGeneratorTargetHandles(model: VideoGeneratorModel): string[] {
  if (model === "veo-3.1-fast") {
    return ["prompt-in", "prompt", "negative", ...VIDEO_FRAME_HANDLES];
  }
  if (model === "kling-omni") {
    return [
      "prompt-in",
      "prompt",
      "negative",
      ...VIDEO_IMAGE_REFERENCE_HANDLES,
      VIDEO_REFERENCE_VIDEO_HANDLE,
    ];
  }
  return ["prompt-in", "prompt", "negative", ...VIDEO_IMAGE_REFERENCE_HANDLES];
}

export function getVideoGeneratorImageLimit(
  model: VideoGeneratorModel,
  hasReferenceVideo: boolean
): number | undefined {
  if (model === "veo-3.1") return 3;
  if (model === "kling-omni") return hasReferenceVideo ? 4 : 7;
  return undefined;
}

export function getVideoGeneratorBackendModel(model: VideoGeneratorModel): string {
  if (model === "veo-3.1-fast") return "veo-3.1-fast-generate-preview";
  if (model === "kling-omni") return "kling-omni";
  return "veo-3.1-generate-preview";
}
