import { StudioNode, Edge } from './index';

export type ExecutionStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type NodeExecutionState = {
  nodeId: string;
  status: ExecutionStatus;
  progress: number;
  error?: string;
  output?: NodeOutput;
};

export type NodeOutput = 
  | { type: 'text'; value: string }
  | { type: 'image'; base64: string; mimeType: string }
  | { type: 'video'; url: string; posterBase64?: string };

export interface WorkflowExecutionContext {
  brandProfileId: string;
  nodes: StudioNode[];
  edges: Edge[];
  nodeStates: Map<string, NodeExecutionState>;
  resolvedData: Map<string, NodeOutput>;
  updateNodeState: (nodeId: string, state: Partial<NodeExecutionState>) => void;
  setNodeOutput: (nodeId: string, output: NodeOutput) => void;
  abortController: AbortController;
  isCancelled: () => boolean;
}

export type DependencyGraph = {
  dependents: Map<string, string[]>;
  dependencies: Map<string, string[]>;
  entryPoints: string[];
  executionOrder: string[];
}

export interface GenerationPayload {
  brandId: string;
  model: string;
  medium: 'image' | 'video';
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  resolution?: string;
  durationSeconds?: number;
  referenceImages?: Array<{
    data: string;
    mimeType: string;
    filename?: string;
    weight?: number;
    referenceType?: 'asset' | 'style';
  }>;
  firstFrame?: {
    data: string;
    mimeType: string;
    filename?: string;
  };
  lastFrame?: {
    data: string;
    mimeType: string;
    filename?: string;
  };
  seed?: number;
  cfgScale?: number;
  steps?: number;
}

export type ExtendVideoInput =
  | { data: string; mimeType: string; filename?: string }
  | { uri: string };

export interface ExtendVideoPayload {
  brandId: string;
  service: string;
  model: string;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  video: ExtendVideoInput;
}
