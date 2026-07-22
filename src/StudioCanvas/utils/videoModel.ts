// Video-generator model vocabulary and per-model handle gating. The canonical
// implementation lives in @continuum/contracts so the Backend MCP tool, the
// headless run worker, and this canvas all share one matrix. This module is a
// thin re-export kept so existing `./videoModel` imports continue to resolve.

export type { VideoGeneratorModel, VideoGeneratorNodeType } from '@continuum/contracts';
export {
  DEFAULT_VIDEO_GENERATOR_MODEL,
  getVideoGeneratorBackendModel,
  getVideoGeneratorImageLimit,
  getVideoGeneratorReferenceMode,
  getVideoGeneratorTargetHandles,
  isVideoGeneratorNodeType,
  resolveVideoGeneratorModel,
  supportsVideoGeneratorFrameInputs,
  supportsVideoGeneratorReferenceImages,
  supportsVideoGeneratorReferenceVideo,
  VIDEO_FRAME_HANDLES,
  VIDEO_GENERATOR_MODEL_LABELS,
  VIDEO_GENERATOR_MODELS,
  VIDEO_IMAGE_REFERENCE_HANDLES,
  VIDEO_REFERENCE_VIDEO_HANDLE,
} from '@continuum/contracts';
