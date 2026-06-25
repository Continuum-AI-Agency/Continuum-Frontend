import { type Node, type Edge, type OnConnect, type OnNodesChange, type OnEdgesChange, type NodeChange, type EdgeChange, type Connection } from '@xyflow/react';

export type { Node, Edge, OnConnect, OnNodesChange, OnEdgesChange, NodeChange, EdgeChange, Connection };

export type DataType = 'string' | 'image' | 'video' | 'audio' | 'document' | 'trigger';

export interface ConnectorData {
  type: DataType;
  value: any;
}

export interface BaseNodeData extends Record<string, unknown> {
  label?: string;
  isExecuting?: boolean;
  isComplete?: boolean;
  error?: string;
  executionTime?: number;
  isToolbarVisible?: boolean;
  isTourSeed?: boolean;
}

export type LLMModel = 'claude-3-5-sonnet' | 'gpt-4o' | 'gemini-1.5-pro';

export interface FrameSlot {
  id: string;
  src?: string;
  type: 'image' | 'video';
}

export type ImageStylePreset = 'photorealistic' | 'anime' | '3d-render' | 'cyberpunk' | 'studio-ghibli' | 'clay' | 'none';

export interface NanoGenNodeData extends BaseNodeData {
  model: 'nano-banana' | 'nano-banana-pro' | 'nano-banana-2' | 'gpt-image-2' | 'flux-2-pro' | 'flux-2-max';
  positivePrompt: string;
  aspectRatio: string;
  imageSize?: '512px' | '1K' | '2K' | '4K';
  maxReferenceImages?: number;
  stylePreset?: ImageStylePreset;
  // Creative-direction skill ids applied to this generation; the Backend resolves
  // their directives and folds them into the prompt.
  skillIds?: string[];
  seed?: number;
  steps?: number;
  guidance?: number;
  scheduler?: string;
  promptEnhancement?: boolean;
  generatedImage?: string | Blob;
  generatedImageUrl?: string;
  generatedImageStoragePath?: string;
  generatedImageBucket?: string;
}

export interface StringNodeData extends BaseNodeData {
  value: string;
  model?: LLMModel;
  inputs?: Array<{ type: 'image' | 'video' | 'text', src: string }>;
  isSplitting?: boolean;
}

export type ImageReferenceType = 'default' | 'product' | 'color' | 'person';

export interface ImageNodeData extends BaseNodeData {
  image?: string;
  fileName?: string;
  sourcePath?: string;
  // Storage bucket for sourcePath, so a reference URL can be re-signed on load.
  bucket?: string;
  sourceUrl?: string;
  referenceType?: ImageReferenceType;
  aspectRatio?: string;
  originalImage?: string;
  markupLayer?: string;
  hasMarkup?: boolean;
  referenceStatus?: 'processing' | 'ready' | 'error';
  // Server error reason for a failed upload, surfaced on the "Failed" badge hover.
  referenceError?: string;
}

export interface VideoNodeData extends BaseNodeData {
  video?: string;
  fileName?: string;
  sourcePath?: string;
  bucket?: string;
  sourceUrl?: string;
  referenceStatus?: 'processing' | 'ready' | 'error';
  referenceError?: string;
}

export interface AudioNodeData extends BaseNodeData {
  audio?: string;
  fileName?: string;
}

export interface CanvasDocument {
  name: string;
  // Pre-extracted text (preferred for brand_documents). When present, content
  // and sourceUrl are not needed for enrichment.
  extractedText?: string;
  // Storage-first: signed URL is the source of truth. base64 is fallback only.
  sourceUrl?: string;
  storagePath?: string;
  bucket?: string;
  // brand_profiles.brand_documents row id — enables chunk lookup on the server.
  sourceDocumentId?: string;
  type: 'pdf' | 'txt';
  // Raw base64 data URL (last-resort fallback; not stored after a successful upload).
  content?: string;
}

export interface DocumentNodeData extends BaseNodeData {
  documents?: CanvasDocument[];
}

export interface VideoGenNodeData extends BaseNodeData {
  model: 'veo-3.1' | 'veo-3.1-fast' | 'veo-3.1-lite' | 'kling-omni' | 'pixverse-v6' | 'seedance-2.0';
  prompt: string;
  negativePrompt?: string;
  enhancePrompt: boolean;
  // Creative-direction skill ids applied to this generation; the Backend resolves
  // their directives and folds them into the prompt.
  skillIds?: string[];
  aspectRatio?: '16:9' | '9:16';
  resolution?: '720p' | '1080p' | '2K' | '4K' | '4k';
  durationSeconds?: 4 | 6 | 8;
  referenceMode?: 'images' | 'frames' | 'omni';
  frameList?: FrameSlot[];
  generatedVideo?: string | Blob;
  generatedVideoUrl?: string;
  generatedVideoStoragePath?: string;
  generatedVideoBucket?: string;
}

export interface ExtendVideoNodeData extends BaseNodeData {
  prompt?: string;
  generatedVideo?: string | Blob;
  generatedVideoUrl?: string;
  generatedVideoStoragePath?: string;
  generatedVideoBucket?: string;
}

export interface ClipSlot {
  id: string;
  order: number;
  trimStartSec?: number;
  trimEndSec?: number;
  muteAudio?: boolean;
}

export interface VideoEditorNodeData extends BaseNodeData {
  clipSlots: ClipSlot[];
  outputFormat?: 'mp4';
  videoCodec?: 'avc';
  audioCodec?: 'aac';
  progress?: number;
  generatedVideo?: string;
  generatedVideoUrl?: string;
  generatedVideoStoragePath?: string;
  generatedVideoBucket?: string;
  unsupportedReason?: string;
}

export interface VideoDecodeNodeData extends BaseNodeData {
  value: string;
}

// One placement on the Video Editor (timelineEditor) timeline. `sourceNodeId`
// references a member of the input pool (an image/video node wired into the
// node's `media-in` handle); a `video` placement trims that clip, an `image`
// placement holds it for `durationSec` as a still. Reorder/split are pure data:
// split duplicates the placement into two complementary trim ranges over the
// same source.
export interface TimelineItem {
  id: string;
  order: number;
  sourceNodeId: string;
  kind?: 'video' | 'image';
  trimStartSec?: number;
  trimEndSec?: number;
  // For image stills: how long the frame holds in the output (seconds).
  durationSec?: number;
  muteAudio?: boolean;
}

// A placeable member of the Video Editor input pool, derived from a connected
// upstream image/video source node. Drives the editor's media bin.
export interface TimelineInputSource {
  nodeId: string;
  kind: 'video' | 'image';
  label: string;
  previewUrl?: string;
}

export interface TimelineEditorNodeData extends BaseNodeData {
  items: TimelineItem[];
  outputFormat?: 'mp4';
  videoCodec?: 'avc';
  audioCodec?: 'aac';
  progress?: number;
  // Break-point gate: the workflow halts at this node until the human renders.
  // `committed` flips true once a render has been persisted this session, which
  // lets the scheduler resume downstream without re-rendering.
  committed?: boolean;
  generatedVideo?: string;
  generatedVideoUrl?: string;
  generatedVideoStoragePath?: string;
  generatedVideoBucket?: string;
  unsupportedReason?: string;
}

export type StudioNodeData = StringNodeData | NanoGenNodeData | VideoGenNodeData | ExtendVideoNodeData | VideoEditorNodeData | TimelineEditorNodeData | ImageNodeData | VideoNodeData | AudioNodeData | DocumentNodeData | VideoDecodeNodeData;
export type StudioNode = Node & { data: StudioNodeData };

export type ExecutionStatus = 'idle' | 'running' | 'awaiting' | 'completed' | 'failed';
export interface NodeExecutionState {
  status: ExecutionStatus;
  output?: any;
  error?: string;
}
