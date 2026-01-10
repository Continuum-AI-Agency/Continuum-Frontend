import { type Node, type Edge, type OnConnect, type OnNodesChange, type OnEdgesChange, type NodeChange, type EdgeChange, type Connection } from '@xyflow/react';

export type { Node, Edge, OnConnect, OnNodesChange, OnEdgesChange, NodeChange, EdgeChange, Connection };

export type DataType = 'string' | 'image' | 'video' | 'trigger';

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
}

export type LLMModel = 'claude-3-5-sonnet' | 'gpt-4o' | 'gemini-1.5-pro';

export interface FrameSlot {
  id: string;
  src?: string;
  type: 'image' | 'video';
}

export type ImageStylePreset = 'photorealistic' | 'anime' | '3d-render' | 'cyberpunk' | 'studio-ghibli' | 'clay' | 'none';

export interface NanoGenNodeData extends BaseNodeData {
  model: 'nano-banana' | 'nano-banana-pro';
  positivePrompt: string;
  aspectRatio: string;
  stylePreset?: ImageStylePreset;
  seed?: number;
  steps?: number;
  guidance?: number;
  scheduler?: string;
  promptEnhancement?: boolean;
  uploadedImage?: string;
  generatedImage?: string | Blob;
}

export interface StringNodeData extends BaseNodeData {
  value: string;
  model?: LLMModel;
  inputs?: Array<{ type: 'image' | 'video' | 'text', src: string }>;
  isSplitting?: boolean;
}

export interface ImageNodeData extends BaseNodeData {
  image?: string;
  fileName?: string;
}

export interface VideoNodeData extends BaseNodeData {
  video?: string;
  fileName?: string;
}

export interface VideoGenNodeData extends BaseNodeData {
  model: 'veo-3.1' | 'veo-3.1-fast';
  prompt: string;
  negativePrompt?: string;
  enhancePrompt: boolean;
  frameList?: FrameSlot[];
  generatedVideo?: string | Blob;
}

export type StudioNodeData = StringNodeData | NanoGenNodeData | VideoGenNodeData | ImageNodeData | VideoNodeData;
export type StudioNode = Node & { data: StudioNodeData };

export type ExecutionStatus = 'idle' | 'running' | 'completed' | 'failed';
export interface NodeExecutionState {
  status: ExecutionStatus;
  output?: any;
  error?: string;
}
