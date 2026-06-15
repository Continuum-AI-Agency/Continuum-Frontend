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
}

export interface VideoNodeData extends BaseNodeData {
  video?: string;
  fileName?: string;
  sourcePath?: string;
  bucket?: string;
  sourceUrl?: string;
  referenceStatus?: 'processing' | 'ready' | 'error';
}

export interface AudioNodeData extends BaseNodeData {
  audio?: string;
  fileName?: string;
}

export interface DocumentNodeData extends BaseNodeData {
  documents?: Array<{
    name: string;
    content: string;
    type: 'pdf' | 'txt';
  }>;
}

export interface VideoGenNodeData extends BaseNodeData {
  model: 'veo-3.1' | 'veo-3.1-fast' | 'veo-3.1-lite' | 'kling-omni' | 'pixverse-v6' | 'seedance-2.0';
  prompt: string;
  negativePrompt?: string;
  enhancePrompt: boolean;
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

export type StudioNodeData = StringNodeData | NanoGenNodeData | VideoGenNodeData | ExtendVideoNodeData | VideoEditorNodeData | ImageNodeData | VideoNodeData | AudioNodeData | DocumentNodeData | VideoDecodeNodeData;
export type StudioNode = Node & { data: StudioNodeData };

export type ExecutionStatus = 'idle' | 'running' | 'completed' | 'failed';
export interface NodeExecutionState {
  status: ExecutionStatus;
  output?: any;
  error?: string;
}
