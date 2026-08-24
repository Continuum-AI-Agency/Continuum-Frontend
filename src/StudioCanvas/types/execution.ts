import type {
  BrandBookPieceKind,
  BrandDirectionPiece,
  DesignSection,
  Edge,
  ImageSize,
  StudioNode,
} from './index';

export type ExecutionStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type NodeExecutionState = {
  nodeId: string;
  status: ExecutionStatus;
  progress: number;
  error?: string;
  output?: NodeOutput;
};

// base64 is optional: under URL-first generation an image carries only a signed
// URL (+ storage path/bucket). base64 is the emergency fallback.
//
// Shared by the single-image and multi-variation outputs so a variation can never
// be a second-class image that skips storage, re-signing, or the asset ledger.
export type ImageOutputItem = {
  base64?: string;
  mimeType: string;
  url?: string;
  storagePath?: string;
  storageBucket?: string;
  sizeBytes?: number;
  assetId?: string;
  assetVersionId?: string;
};

export type NodeOutput =
  | { type: 'text'; value: string }
  | ({ type: 'image' } & ImageOutputItem)
  // A `num_images` run: one item per variation, in variation_index order. The
  // edge's sourceHandle picks which one a downstream node consumes.
  | { type: 'images'; items: ImageOutputItem[] }
  | {
      type: 'video';
      url: string;
      posterBase64?: string;
      storagePath?: string;
      storageBucket?: string;
      sizeBytes?: number;
      assetId?: string;
      assetVersionId?: string;
    }
  // A fan-out result: N outputs of ONE modality, in item order.
  //
  // Distinct from `images`, which is a single generation's variations of the same
  // prompt and is addressed by the edge's `sourceHandle` (`image-2`). A collection is
  // a batch: every downstream runnable node loops over it, and the loop propagates
  // for free because a chained consumer emits a collection of its own.
  //
  // `itemType` is the ITEM modality, deliberately not a port data type — collection-ness
  // is the shape of an output, and widening `StudioPortDataType` would make every
  // existing compatibility rule ambiguous (Canvas V3 design B).
  | {
      type: 'collection';
      itemType: 'text' | 'image' | 'video';
      items: NodeOutput[];
      /** Item labels, when the source batch named them — a matrix view reads these. */
      labels?: string[];
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
  /** v2 compiler pieces; see `StudioCanvas/types/index.ts`. Tri-state. */
  brandDirectionPieces?: BrandDirectionPiece[];
  /**
   * Which sections of the brand's uploaded design system apply to this generation.
   *
   * Tri-state, matching the Backend: `undefined` = no preference, and the Backend resolves
   * it from the system's own rigor tier (`sectionsForTier`) rather than a fixed default;
   * `[]` = off; a list narrows. A third switch alongside the two above, because a design
   * system is a third source with its own vocabulary.
   */
  designSystemSections?: DesignSection[];
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
  /** v2 compiler pieces; see `StudioCanvas/types/index.ts`. Tri-state. */
  brandDirectionPieces?: BrandDirectionPiece[];
  /**
   * Which sections of the brand's uploaded design system apply to this generation.
   *
   * Tri-state, matching the Backend: `undefined` = no preference, and the Backend resolves
   * it from the system's own rigor tier (`sectionsForTier`) rather than a fixed default;
   * `[]` = off; a list narrows. A third switch alongside the two above, because a design
   * system is a third source with its own vocabulary.
   */
  designSystemSections?: DesignSection[];
  // Library ids of the reference creatives. The Backend folds what they actually
  // EARNED into the prompt (<asset_performance>) so a variant is not made blind.
  referenceAssetIds?: string[];
  aspectRatio?: string;
  resolution?: string;
  imageSize?: ImageSize;
  // How many variations to generate. Omitted at 1 so a plain generation sends
  // exactly the payload it always has.
  numImages?: number;
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
    data?: string;
    videoUrl?: string;
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
