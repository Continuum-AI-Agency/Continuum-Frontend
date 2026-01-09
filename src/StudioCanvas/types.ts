import { Node, Edge, OnConnect, OnNodesChange, OnEdgesChange, NodeChange, EdgeChange, Connection } from '@xyflow/react';

// --- Data Types ---
export type DataType = 'string' | 'image' | 'video' | 'trigger';

export interface ConnectorData {
  type: DataType;
  value: any; 
}

// --- Node Specific Data ---
export interface BaseNodeData extends Record<string, unknown> {
  label?: string;
  isExecuting?: boolean;
  isComplete?: boolean;
  error?: string;
  executionTime?: number;
}

export interface StringNodeData extends BaseNodeData {
  value: string;
}

export interface NanoGenNodeData extends BaseNodeData {
  model: 'nano-banana' | 'nano-banana-pro';
  positivePrompt: string;
  negativePrompt: string;
  aspectRatio: string;
  generatedImage?: string | Blob; 
}

export interface VeoDirectorNodeData extends BaseNodeData {
  model: 'veo-3.1' | 'veo-3.1-fast';
  prompt: string;
  enhancePrompt: boolean;
  generatedVideo?: string | Blob; 
}

export type StudioNodeData = StringNodeData | NanoGenNodeData | VeoDirectorNodeData;
export type StudioNode = Node<StudioNodeData>;

// --- Execution State ---
export type ExecutionStatus = 'idle' | 'running' | 'completed' | 'failed';
export interface NodeExecutionState {
  status: ExecutionStatus;
  output?: any;
  error?: string;
}
