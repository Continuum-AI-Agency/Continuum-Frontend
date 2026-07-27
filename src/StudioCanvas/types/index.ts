import type {
  BrandBookPieceKind,
  CanvasRenderContinuation,
  ImageGeneratorModel,
  ImageSize,
} from '@continuum/contracts';
import type {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
} from '@xyflow/react';
import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import type { ClipEffectSpec } from '../utils/render/effectSpec';
import type { ClipTransition } from '../utils/render/transitions';
import type { CaptionCue, CaptionWord } from '../utils/splice/captionCues';

export type {
  BrandBookPieceKind,
  Connection,
  Edge,
  EdgeChange,
  ImageGeneratorModel,
  ImageSize,
  Node,
  NodeChange,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
};

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
  // Canonical signature of the generation inputs that produced the current
  // output. A run reuses a node's existing output unless this no longer matches
  // the node's current settings/wiring (the node was edited since it generated).
  generationSignature?: string;
}

export type LLMModel = 'claude-3-5-sonnet' | 'gpt-4o' | 'gemini-1.5-pro';

export interface FrameSlot {
  id: string;
  src?: string;
  type: 'image' | 'video';
}

export type ImageStylePreset =
  | 'photorealistic'
  | 'anime'
  | '3d-render'
  | 'cyberpunk'
  | 'studio-ghibli'
  | 'clay'
  | 'none';

export interface NanoGenNodeData extends BaseNodeData {
  model: ImageGeneratorModel;
  positivePrompt: string;
  // What the image must NOT contain. Fed by the `negative` handle or typed on the
  // node; the Backend folds it into the instruction (Gemini image models have no
  // negative-prompt parameter). Mirrors VideoGenNodeData.negativePrompt.
  negativePrompt?: string;
  aspectRatio: string;
  imageSize?: ImageSize;
  maxReferenceImages?: number;
  stylePreset?: ImageStylePreset;
  // Creative-direction skill ids applied to this generation; the Backend resolves
  // their directives and folds them into the prompt.
  skillIds?: string[];
  // Brand-book pieces enforced on this generation; the Backend renders them into
  // an authoritative forced block. Non-empty means the node is brand-enforced.
  brandBookPieces?: BrandBookPieceKind[];
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
  /** Composer-authored prompts are already final; user-authored text can opt into enrichment. */
  promptMode?: 'literal' | 'enrich';
  model?: LLMModel;
  inputs?: Array<{ type: 'image' | 'video' | 'text'; src: string }>;
  isSplitting?: boolean;
}

export type ImageReferenceType = 'default' | 'product' | 'color' | 'person';

export interface ImageNodeData extends BaseNodeData {
  image?: string;
  fileName?: string;
  // media.assets id of the Library asset this node holds, when it has one (dropped
  // from the Library, uploaded on drop, or attached by an agent). Persisted so a
  // generation downstream of this node can be credited back to the asset that fed it.
  assetId?: string;
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
  // media.assets id of the Library asset this node holds — see ImageNodeData.assetId.
  assetId?: string;
  sourcePath?: string;
  bucket?: string;
  sourceUrl?: string;
  aspectRatio?: string;
  referenceStatus?: 'processing' | 'ready' | 'error';
  referenceError?: string;
}

export interface AudioNodeData extends BaseNodeData {
  audio?: string;
  fileName?: string;
  assetId?: string;
  sourcePath?: string;
  bucket?: string;
  sourceUrl?: string;
  referenceStatus?: 'processing' | 'ready' | 'error';
  referenceError?: string;
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
  model:
    | 'veo-3.1'
    | 'veo-3.1-fast'
    | 'veo-3.1-lite'
    | 'kling-omni'
    | 'pixverse-v6'
    | 'seedance-2.0';
  prompt: string;
  negativePrompt?: string;
  enhancePrompt: boolean;
  // Creative-direction skill ids applied to this generation; the Backend resolves
  // their directives and folds them into the prompt.
  skillIds?: string[];
  // Brand-book pieces enforced on this generation; the Backend renders them into
  // an authoritative forced block. Non-empty means the node is brand-enforced.
  brandBookPieces?: BrandBookPieceKind[];
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
  renderOutputAssetId?: string;
  renderOutputDurationSec?: number;
  renderOutputWidth?: number;
  renderOutputHeight?: number;
  lastRenderJobId?: string;
  renderContinuation?: CanvasRenderContinuation;
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
  kind?: 'video' | 'image' | 'audio';
  trimStartSec?: number;
  trimEndSec?: number;
  // For image stills: how long the frame holds in the output (seconds).
  durationSec?: number;
  muteAudio?: boolean;
  // Per-clip audio gain (1 = unchanged, 0 = silent) and manual fade in/out
  // (seconds), applied in the render mixdown on top of any transition crossfade.
  volume?: number;
  audioFadeInSec?: number;
  audioFadeOutSec?: number;
  // Per-clip visual/audio effects (color, opacity, transform, Ken Burns, speed,
  // text). Applied identically in the CSS preview and the canvas export.
  effects?: ClipEffectSpec;
  // Transition INTO this clip from the previous one (the boundary before it).
  transition?: ClipTransition;
  // Absolute output start (seconds) for OVERLAY-track items, which float on top
  // of the base track at a fixed time. Ignored for base-track items (sequential).
  startSec?: number;
}

export type TimelineTrackKind = 'base' | 'overlay' | 'audio';

// A layer in the Video Editor. The base track is the main sequence; overlay
// tracks composite on top (picture-in-picture, logos, image/text overlays),
// each item placed at an absolute `startSec` and positioned via its transform.
export interface TimelineTrack {
  id: string;
  kind: TimelineTrackKind;
  items: TimelineItem[];
}

// A placeable member of the Video Editor input pool. Drives the editor's media
// bin. On the canvas each entry is a connected upstream image/video source node
// (hence `nodeId`); other hosts key it by their own source id.
export interface TimelineInputSource {
  nodeId: string;
  kind: 'video' | 'image' | 'audio';
  label: string;
  // Durable media.assets id when the source is Library-backed. Canvas node ids
  // are not asset ids; keeping both lets captioning and analysis use scoped
  // storage APIs without guessing from a React Flow id.
  sourceAssetId?: string;
  previewUrl?: string;
  // Known source duration (seconds), when the host already has it. Absent on the
  // canvas, where the editor probes the preview URL for it instead.
  durationSec?: number;
}

export interface TimelineEditorNodeData extends BaseNodeData {
  items: TimelineItem[];
  // Overlay layers composited over the base `items` track. Optional/additive so
  // existing single-track timelines keep working unchanged.
  overlayTracks?: TimelineTrack[];
  // Absolute-time music/voiceover lanes. Audio placements never enter the
  // visual base/overlay tracks; they join the renderer's single master mix.
  audioTracks?: TimelineTrack[];
  outputFormat?: 'mp4';
  videoCodec?: 'avc';
  audioCodec?: 'aac';
  // Export-preset id (utils/render/exportPresets) — resolution/aspect/bitrate for
  // the render. Absent = 'source' (keep the first clip's dimensions).
  exportPresetId?: string;
  // Reference marks (output seconds) on the ruler, for aligning cuts/overlays.
  markers?: number[];
  // Auto-captions (Gemini-transcribed, output-time words). When captionsEnabled,
  // the render burns them in and the preview shows them at the playhead.
  captionsEnabled?: boolean;
  captionCues?: CaptionCue[];
  captionWords?: CaptionWord[];
  captionStyle?: CaptionStyle;
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

export type PublishTargetStatus = 'draft' | 'approved' | 'scheduled';

// Terminal "Publish to Planner" node. Takes one upstream video (the edited MP4)
// and attaches it to an organic Planner draft — linking the seed draft the canvas
// was launched from, or creating a new one. Emits no downstream media (a sink).
export interface PublishToPlannerNodeData extends BaseNodeData {
  // Stable identity minted at creation; also the draft's `client_key`, so a
  // re-publish updates the same draft rather than spawning duplicates. Survives
  // canvas persistence (UUID has dashes, not stripped as a base64-like token).
  clientKey?: string;
  // The draft this node is bound to: pre-seeded when the canvas was launched from
  // a Planner draft, otherwise set after the first publish. Enables the
  // "Open in Planner" deep-link.
  draftId?: string;
  weekStartId?: string;
  platform?: string;
  // Full ISO timestamptz for the target slot (never date-only).
  scheduledAt?: string;
  status?: PublishTargetStatus;
  // Optional caption the node applies to the draft (else left for the Planner).
  caption?: string;
  // Durable, re-signable coords of the published video (base64-safe to persist).
  publishedStoragePath?: string;
  publishedBucket?: string;
  publishedUrl?: string;
  publishedAt?: string;
}

// One clip in an Omni node's variation micro-library. The first is the
// 'Original' generate; each subsequent one is an edit branched from the then-
// active variation (its interactionId threads the next edit's
// previous_interaction_id). Durable coords let the whole library re-sign on load.
export interface OmniVariation {
  id: string;
  label: string;
  instruction?: string;
  videoUrl?: string;
  storagePath?: string;
  bucket?: string;
  interactionId?: string;
  parentInteractionId?: string;
  status: 'pending' | 'done' | 'error';
  error?: string;
  createdAt: number;
}

// Gemini Omni Flash node: generate a clip, then conversationally edit it into
// variations. Unlike VideoGen (handle-wired, single output), the editing is
// in-node and the output is a selectable micro-library. The durable generated*
// fields MIRROR the active variation so setNodeOutput / rehydrateWorkflowMedia /
// downstream video consumers work unchanged.
export interface OmniGenNodeData extends BaseNodeData {
  model: 'gemini-omni-flash';
  prompt: string;
  aspectRatio?: '16:9' | '9:16';
  skillIds?: string[];
  brandBookPieces?: BrandBookPieceKind[];
  variations?: OmniVariation[];
  activeVariationId?: string;
  previousInteractionId?: string;
  isChatOpen?: boolean;
  generatedVideo?: string | Blob;
  generatedVideoUrl?: string;
  generatedVideoStoragePath?: string;
  generatedVideoBucket?: string;
}

export type StudioNodeData =
  | StringNodeData
  | NanoGenNodeData
  | VideoGenNodeData
  | OmniGenNodeData
  | ExtendVideoNodeData
  | VideoEditorNodeData
  | TimelineEditorNodeData
  | PublishToPlannerNodeData
  | ImageNodeData
  | VideoNodeData
  | AudioNodeData
  | DocumentNodeData
  | VideoDecodeNodeData;
export type StudioNode = Node & { data: StudioNodeData };

export type ExecutionStatus = 'idle' | 'running' | 'awaiting' | 'completed' | 'failed';
export interface NodeExecutionState {
  status: ExecutionStatus;
  output?: any;
  error?: string;
}
