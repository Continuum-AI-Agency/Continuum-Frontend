import type { StudioNode } from "../types";

export const VIDEO_GENERATOR_MODELS = ["kling-omni", "pixverse-v6", "seedance-2.0", "veo-3.1-fast", "veo-3.1-lite", "veo-3.1"] as const;
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
    return [
      "prompt-in",
      "prompt",
      "negative",
      ...VIDEO_IMAGE_REFERENCE_HANDLES,
      VIDEO_REFERENCE_VIDEO_HANDLE,
    ];
  }
  if (model === "pixverse-v6") {
    return ["prompt-in", "prompt", "negative", VIDEO_IMAGE_REFERENCE_HANDLES[0]];
  }
  if (model === "seedance-2.0") {
    return ["prompt-in", "prompt", "negative", ...VIDEO_IMAGE_REFERENCE_HANDLES, ...VIDEO_FRAME_HANDLES, VIDEO_REFERENCE_VIDEO_HANDLE];
  }
  return ["prompt-in", "prompt", "negative", ...VIDEO_IMAGE_REFERENCE_HANDLES];
}

export function getVideoGeneratorImageLimit(
  model: VideoGeneratorModel,
  hasReferenceVideo: boolean
): number | undefined {
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
