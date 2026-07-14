import type { BrandBookPieceKind, Edge, ImageSize, StudioNode } from './index';

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
  // base64 is optional: under URL-first generation an image output carries only a
  // signed URL (+ storage path/bucket). base64 is the emergency fallback.
  | {
      type: 'image';
      base64?: string;
      mimeType: string;
      url?: string;
      storagePath?: string;
      storageBucket?: string;
      sizeBytes?: number;
    }
  | {
      type: 'video';
      url: string;
      posterBase64?: string;
      storagePath?: string;
      storageBucket?: string;
      sizeBytes?: number;
    };

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
};

export interface EnrichPromptPayload {
  prompt: string;
  brandId?: string;
  // Grounding data piece inherited from the downstream generation node this text
  // box feeds — the Backend folds these into the enrichment system prompt so the
  // rewrite is on-brand (services/studio-grounding.ts).
  skillIds?: string[];
  brandBookPieces?: BrandBookPieceKind[];
  context: {
    // A reference carries a signed `imageUrl` (preferred) OR inline base64 `data`
    // (fallback). The backend resolves the URL to bytes for the model.
    images?: Array<{
      type: 'base64' | 'url';
      data?: string;
      imageUrl?: string;
      mimeType: string;
      sourcePath?: string;
      sourceUrl?: string;
    }>;
    audio?: { type: 'base64'; data: string; mimeType: string };
    video?: {
      type: 'base64' | 'url';
      data?: string;
      imageUrl?: string;
      mimeType: string;
      sourcePath?: string;
      sourceUrl?: string;
    };
    documents?: Array<{
      name: string;
      type: 'pdf' | 'txt';
      // Pre-extracted text from brand_document_chunks (best path; no fetch needed).
      extractedText?: string;
      // Signed storage URL — server fetches and reads the file.
      sourceUrl?: string;
      // brand_profiles.brand_documents row id — server loads pre-extracted chunks.
      sourceDocumentId?: string;
      // Base64 data URL — last-resort fallback for locally-uploaded files.
      content?: string;
    }>;
  };
}

export interface GenerationPayload {
  brandId: string;
  model: string;
  medium: 'image' | 'video';
  prompt: string;
  negativePrompt?: string;
  // Creative-direction skill ids resolved + folded into the prompt by the Backend.
  skillIds?: string[];
  // Brand-book pieces the Backend renders into an authoritative forced block.
  brandBookPieces?: BrandBookPieceKind[];
  // Library ids of the reference creatives. The Backend folds what they actually
  // EARNED into the prompt (<asset_performance>) so a variant is not made blind.
  referenceAssetIds?: string[];
  aspectRatio?: string;
  resolution?: string;
  imageSize?: ImageSize;
  durationSeconds?: number;
  referenceImages?: Array<{
    data?: string;
    imageUrl?: string;
    storageBucket?: string;
    storagePath?: string;
    mimeType: string;
    filename?: string;
    weight?: number;
    referenceType?: 'asset' | 'style';
  }>;
  firstFrame?: {
    data?: string;
    imageUrl?: string;
    mimeType: string;
    filename?: string;
  };
  lastFrame?: {
    data?: string;
    imageUrl?: string;
    mimeType: string;
    filename?: string;
  };
  referenceVideo?: {
    data: string;
    mimeType: string;
    filename?: string;
  };
  imageReferences?: Array<{
    data?: string;
    imageUrl?: string;
    mimeType: string;
    filename?: string;
  }>;
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
