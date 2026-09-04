import type {
  ActionId,
  ApiRenderInputValue,
  ApiRenderOutput,
  ApiRenderVariable,
  BatchCombine,
  BatchItem,
  BatchItemKind,
  BrandBookPieceKind,
  BrandDirectionPiece,
  CanvasPublishingFormat,
  CanvasPublishingSlot,
  CanvasRenderContinuation,
  CanvasTimelineRenderRequest,
  HyperframesAgentNodeData as ContractHyperframesAgentNodeData,
  DesignSection,
  EditorProductionSummary,
  ElementUseIntent,
  ImageGeneratorModel,
  ImageSize,
  StudioEmittedModality,
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
import type { BatchRunRecord } from '../utils/batch/generationFanout';
import type { BlendMode, ClipEffectSpec } from '../utils/render/effectSpec';
import type { ClipTransition } from '../utils/render/transitions';
import type { CaptionCue, CaptionWord } from '../utils/splice/captionCues';

export type {
  BrandBookPieceKind,
  BrandDirectionPiece,
  Connection,
  DesignSection,
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
  // The Backend's classification of `error`, when it sent one. Drives the node's
  // guidance panel so the user is told what to change instead of the raw provider
  // sentence. See utils/generationErrorCopy.
  errorCode?: string;
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
  /**
   * Which v2 creative-direction pieces reach the COMPILER for this generation.
   *
   * A different switch from `brandBookPieces` above, not a rename. That one selects legacy
   * brand-book sections rendered from `brand_tokens`; this one selects which approved
   * BrandDirection rules the compiler and its gates see. The two vocabularies share no
   * member, so both are carried.
   *
   * Tri-state, matching the Backend: `undefined` = everything the plan admits, `[]` = no
   * brand direction at all, a list narrows.
   */
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
  seed?: number;
  steps?: number;
  guidance?: number;
  scheduler?: string;
  promptEnhancement?: boolean;
  // How many variations one run produces. 1 or IMAGE_VARIATION_LIMIT — the node
  // draws one source handle per variation, so the ceiling is the handle count.
  variationCount?: 1 | 4;
  generatedImage?: string | Blob;
  generatedImageUrl?: string;
  generatedImageStoragePath?: string;
  generatedImageBucket?: string;
  renderOutputAssetId?: string;
  renderOutputAssetVersionId?: string;
  // One entry per variation, in handle order. Carries the SAME durable fields as
  // the single-image case above; a variation that only held a data URL would skip
  // re-signing and the asset ledger the moment its signed URL expired.
  generatedImages?: GeneratedImageVariation[];
  /**
   * The result of a BATCH fan-out through this generator: one entry per pair, plus the
   * two axes the matrix view hangs them under.
   *
   * Lives on the CONSUMING node rather than the batch, because it is this node's output —
   * the batch only supplied the inputs. Deliberately holds urls and asset ids and never
   * base64: a 100-item batch of inlined images would put megabytes into `canvas_sessions`
   * on every autosave.
   */
  batchRun?: BatchRunRecord;
}

export interface GeneratedImageVariation {
  // Signed URL when durable, base64 data URL only on the emergency fallback path.
  preview: string;
  url?: string;
  storagePath?: string;
  storageBucket?: string;
  assetId?: string;
  assetVersionId?: string;
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
  // Exact media.asset_versions id returned by Library registration.
  assetVersionId?: string;
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
  // Credit owed to whoever made this picture. Present on stock photos (Unsplash),
  // whose licence requires the photographer to be named and linked EVERY time the
  // image is displayed — so it is persisted on the node rather than held in the
  // picker that fetched it, and ImageNode renders it.
  attribution?: MediaAttribution;
}

export interface MediaAttribution {
  provider: 'unsplash';
  photographerName: string;
  photographerUrl: string;
  sourceUrl: string;
}

export interface VideoNodeData extends BaseNodeData {
  video?: string;
  fileName?: string;
  // media.assets id of the Library asset this node holds — see ImageNodeData.assetId.
  assetId?: string;
  assetVersionId?: string;
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
  assetVersionId?: string;
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
  /** See `NanoGenNodeData.batchRun` — the fan-out branch runs for video generators too. */
  batchRun?: BatchRunRecord;
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
  /**
   * Which v2 creative-direction pieces reach the COMPILER for this generation.
   *
   * A different switch from `brandBookPieces` above, not a rename. That one selects legacy
   * brand-book sections rendered from `brand_tokens`; this one selects which approved
   * BrandDirection rules the compiler and its gates see. The two vocabularies share no
   * member, so both are carried.
   *
   * Tri-state, matching the Backend: `undefined` = everything the plan admits, `[]` = no
   * brand direction at all, a list narrows.
   */
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

export interface VideoDecodeNodeData extends BaseNodeData {
  value: string;
}

export interface FrameExtractNodeData extends BaseNodeData {
  selector: 'first' | 'last' | 'timestamp';
  timestampSec?: number | null;
  outputWidth?: number;
  quality?: number;
  generatedImage?: string;
  generatedImageUrl?: string;
  sourceTimestampMs?: number;
  sourceAssetId?: string;
  sourceVersionId?: string;
  sourceAssetVersionId?: string;
}

export type HyperframesAgentNodeData = BaseNodeData & ContractHyperframesAgentNodeData;

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
  sourceVersionId?: string;
  previewUrl?: string;
  // Known source duration (seconds), when the host already has it. Absent on the
  // canvas, where the editor probes the preview URL for it instead.
  durationSec?: number;
}

export interface TimelineEditorNodeData extends BaseNodeData {
  /** Durable brand-shared production project bound to this Canvas node. */
  videoProjectId?: string;
  videoProductionSummary?: EditorProductionSummary;
  productionSeed?: {
    recipe: 'ugc_talking_head';
    objective: string;
    aspectRatio: '9:16' | '16:9' | '1:1';
    references: Array<{
      nodeId: string;
      role: 'style' | 'character' | 'location' | 'product' | 'score' | 'ambience';
    }>;
    shots: Array<{
      id: string;
      order: number;
      title: string;
      brief: string;
      spokenLine?: string;
      subjectAction: string;
      cameraMove: string;
      inSceneEvent: string;
      continuity?: string;
      targetDurationSec: 4 | 6 | 8;
    }>;
  };
  videoProductionSeeded?: boolean;
  plannerCompositionId?: string;
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
  renderOutputAssetId?: string;
  renderOutputAssetVersionId?: string;
  /** Durable handoff from the Canvas agent to the browser-only renderer. */
  agentRenderRequest?: CanvasTimelineRenderRequest;
  unsupportedReason?: string;
}

/**
 * The organic Planner draft a canvas branch is bound to — found or created here.
 *
 * `targetUpdatedAt` is the optimistic-concurrency token every write carries: it is the
 * `updated_at` this node last saw, and the planner refuses a write against a stale one.
 * Platform and account are only settable while creating, because the canonical planner
 * field-edit funnel cannot move them once the row exists.
 */
export interface PlannerDraftNodeData extends BaseNodeData {
  mode?: 'find' | 'create';
  format: CanvasPublishingFormat;
  assetSlots?: CanvasPublishingSlot[];
  targetDraftId?: string;
  targetUpdatedAt?: string;
  targetTitle?: string;
  targetStatus?: string;
  targetFormat?: CanvasPublishingFormat;
  caption?: string;
  dayId?: string;
  timeOfDay?: string;
  platform?: string;
  platformAccountId?: string;
  /** Set once a save lands, so a downstream publish knows the row is real. */
  savedAt?: string;
  error?: string;
}

/** Post the upstream draft — now, or on the schedule the draft already carries. */
export interface OrganicPublishNodeData extends BaseNodeData {
  schedule?: 'now' | 'scheduled';
  publishedAt?: string;
  platformPostId?: string;
  error?: string;
}

export interface PublisherNodeData extends BaseNodeData {
  format: CanvasPublishingFormat;
  assetSlots?: CanvasPublishingSlot[];
  targetDraftId?: string;
  targetUpdatedAt?: string;
  targetTitle?: string;
  adAccountId?: string;
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  targetAdId?: string;
  targetAdName?: string;
  expectedCreativeId?: string;
  confirmToken?: string;
  confirmationExpiresAt?: string;
  appliedCreativeId?: string;
  previousCreativeId?: string;
  replacementId?: string;
  publishedAt?: string;
}

export interface ApiRenderNodeData extends BaseNodeData {
  templateKey?: string | null;
  templateName?: string | null;
  contractHash?: string | null;
  variableDefinitions?: ApiRenderVariable[];
  /**
   * What the node itself holds for each variable — the typed field for a scalar, and for
   * a media slot the Library asset picked directly into it.
   *
   * Media slots can be filled two ways, wire OR pick, so this carries pins as well as
   * scalars. `ApiRenderInputValue` is the wire type verbatim rather than a narrower local
   * one: a value that cannot be sent is a value that should never have been stored.
   */
  variables: Record<string, ApiRenderInputValue>;
  delivery?: {
    action: 'create';
    adAccountId?: string;
    campaignId?: string;
    campaignName?: string;
    adsetId?: string;
    adsetName?: string;
    adStatus: 'PAUSED';
  } | null;
  status: 'idle' | 'prepared' | 'submitting' | 'queued' | 'rendering' | 'finished' | 'failed';
  latestJobId?: string;
  /**
   * Meta delivery is OPT-IN. A render that lands in the brand's library and nowhere
   * else is the common case, and the backend has always allowed it (`delivery` is
   * optional at preflight). Absent means off, so no saved node needs a migration.
   */
  deliveryEnabled?: boolean;
  /** The saved input set currently driving this node, if any. */
  inputSetId?: string | null;
  /** The sets selected for a multi-set batch. */
  batchInputSetIds?: string[];
  /**
   * Every job this node has launched. The ONLY durable handle a batch will ever get:
   * `media.ad_render_jobs` has no batch column and `POST /batches` returns its job
   * list exactly once, so a remount without this loses the batch entirely.
   */
  jobIds?: string[];
  /**
   * The latest job's finished outputs, kept on the node so a render survives a
   * remount before the job fetch lands.
   *
   * The URL is deliberately NOT persisted. Both the fleet URL and the library-signed
   * one the backend now prefers expire, so a saved copy renders a broken preview on
   * every later open. Only the durable descriptor is kept; the displayable URL always
   * comes from the live job DTO.
   */
  latestOutputs?: Array<
    Pick<ApiRenderOutput, 'id' | 'kind' | 'fileName' | 'assetId' | 'versionId'>
  >;
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
  /**
   * Which v2 creative-direction pieces reach the COMPILER for this generation.
   *
   * A different switch from `brandBookPieces` above, not a rename. That one selects legacy
   * brand-book sections rendered from `brand_tokens`; this one selects which approved
   * BrandDirection rules the compiler and its gates see. The two vocabularies share no
   * member, so both are carried.
   *
   * Tri-state, matching the Backend: `undefined` = everything the plan admits, `[]` = no
   * brand direction at all, a list narrows.
   */
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
  /**
   * Output resolution for the turn. 360p is the draft tier — markedly faster and
   * cheaper — and 4k is the delivery master; the service enforces the set.
   */
  resolution?: '360p' | '720p' | '1080p' | '4k';
  /**
   * What a turn does with a clip wired into `ref-video`: change it in place, or
   * continue it. Meaningless with nothing wired in, which is why it is optional
   * rather than defaulted into every node.
   */
  videoTask?: 'edit' | 'extend';
  variations?: OmniVariation[];
  activeVariationId?: string;
  previousInteractionId?: string;
  generatedVideo?: string | Blob;
  generatedVideoUrl?: string;
  generatedVideoStoragePath?: string;
  generatedVideoBucket?: string;
}

// ---------------------------------------------------------------------------
// Canvas V3 node payloads
// ---------------------------------------------------------------------------

/**
 * One deterministic operation from the contracts action catalog.
 *
 * ONE data shape for all 32 ops, and one output bag rather than a per-modality field:
 * the emitted modality belongs to the OP (`ACTION_DEFS[actionId].output`), not to the
 * node type. The node type's `producesMedia` flag says `true` because most ops emit
 * media — keying anything off it would make a `text.findReplace` node a media producer.
 *
 * `actionId: null` is a deliberately inert node: contracts gives it no handles and
 * refuses every connection until an op is chosen.
 */
export interface ActionNodeData extends BaseNodeData {
  actionId: ActionId | null;
  /** Validated against `ACTION_DEFS[actionId].config` at run time, never at write time. */
  config: Record<string, unknown>;
  generatedImage?: string;
  generatedImageUrl?: string;
  generatedVideo?: string | Blob;
  generatedVideoUrl?: string;
  /** A text op's output. Same field a `string` node uses, so consumers need no new case. */
  value?: string;
  /** How many items the last `collection` output carried. */
  collectionCount?: number;
  collectionItemType?: 'text' | 'image' | 'video';
  /** Every item of that collection as a renderable src — see `collectionPreviewSrcs`. */
  collectionItems?: string[];
}

/** A list of inputs the nodes downstream of it run once per item. Capped at 100. */
export interface BatchNodeData extends BaseNodeData {
  items: BatchItem[];
  /** One kind per batch — mixing images and videos makes "run per item" ambiguous. */
  itemType: BatchItemKind | null;
  combine: BatchCombine;
}

/** Identity pass-through. The fan-out is many edges off one output, not many handles. */
export interface RouterNodeData extends BaseNodeData {
  /** Stamped from contracts' `routerLockedType` on first connect; pins the modality. */
  lockedType: StudioEmittedModality | null;
  generatedImage?: string;
  generatedImageUrl?: string;
  generatedVideo?: string | Blob;
  generatedVideoUrl?: string;
  value?: string;
  collectionCount?: number;
  collectionItemType?: 'text' | 'image' | 'video';
  collectionItems?: string[];
}

/** Terminal writer. The runtime lands in Wave 3; the shape is declared here. */
export interface ExportNodeData extends BaseNodeData {
  /** Null until there is an input — the legal formats for a still and a clip differ. */
  format: string | null;
}

/** A saved brand Element, as a reusable reference. Runtime lands with the elements shell. */
export interface ElementNodeData extends BaseNodeData {
  elementId: string | null;
  elementName?: string;
  elementCategory?: string;
  useIntent?: ElementUseIntent;
  previewUrl?: string;
  motionUrl?: string;
  assetId?: string;
  referenceType?: ImageReferenceType;
}

/** One section of the brand design system, emitted as a reference. */
export interface DesignRefNodeData extends BaseNodeData {
  section: DesignSection | null;
  mode: 'image' | 'text' | 'both';
}

/**
 * One placed still in the Layer Editor document.
 *
 * This schema is the BINDING amendment from `docs/research/aep-interop.md` §4.3 and
 * deliberately does NOT reuse `ClipTransform`. `ClipTransform` pivots about the frame
 * centre with fraction-of-frame offsets and a scalar scale — fine for a single clip
 * filling the frame, a real bug for N independently placed layers, and an
 * unrecoverable migration once documents are stored. Every field below is chosen so a
 * future AEP importer is a pure function with no schema change.
 */
export interface LayerEditorLayer {
  /** Stable and opaque. Never derived from `name`: AE does not enforce unique names. */
  id: string;
  /**
   * Human label, defaulted from the source file name and preserved VERBATIM through
   * import/export — it is the join key an AE-side template binds by. Collisions are a
   * UI warning, never a data correction.
   */
  name: string;
  /** Upstream canvas node feeding this layer's pixels. */
  sourceNodeId: string;
  sourceAssetId?: string;
  sourceVersionId?: string;
  /** Intrinsic pixel size of the source, as measured. Needed to resolve `anchor`. */
  sourceWidth: number;
  sourceHeight: number;
  /**
   * Pivot for rotation and scale, in this layer's OWN source pixels, origin at the
   * source's top-left. Defaults to the source centre. AE calls it the Anchor Point.
   */
  anchor: { x: number; y: number };
  /**
   * Where `anchor` lands, in COMPOSITION pixels: origin at the frame's top-left, +x
   * right, +y DOWN. Not a fraction — resizing the frame must not move a layer.
   */
  position: { x: number; y: number };
  /** Multiplier, 1 = 100%. Negative flips that axis; there is no separate flip field. */
  scale: { x: number; y: number };
  /** Degrees clockwise, about `anchor`. */
  rotation: number;
  /** 0..1, matching `globalAlpha` and `ClipEffectSpec.opacity`. AE stores 0..100. */
  opacity: number;
  /** The existing seven-value union. Do NOT widen to AE's ~38 — see aep-interop §4.4. */
  blendMode: BlendMode;
  visible: boolean;
  locked: boolean;
}

/** Runtime lands in Wave 4; the stored model is declared now so it never migrates. */
export interface LayerEditorNodeData extends BaseNodeData {
  /** Composition pixels. Default 2048x2048, max 4096x4096. */
  frame: { width: number; height: number };
  /** Paint order, BOTTOM-FIRST. The layers panel renders it reversed. No zIndex field. */
  layers: LayerEditorLayer[];
  generatedImage?: string;
  generatedImageUrl?: string;
  // Durable coordinates persistLayerComposite writes — declared so the executor's
  // output projection reads typed strings, not index-signature unknowns.
  generatedImageStoragePath?: string;
  generatedImageBucket?: string;
  renderOutputAssetId?: string;
  renderOutputAssetVersionId?: string;
}

export type StudioNodeData =
  | StringNodeData
  | ActionNodeData
  | BatchNodeData
  | RouterNodeData
  | ExportNodeData
  | ElementNodeData
  | DesignRefNodeData
  | LayerEditorNodeData
  | NanoGenNodeData
  | VideoGenNodeData
  | OmniGenNodeData
  | ExtendVideoNodeData
  | TimelineEditorNodeData
  | PlannerDraftNodeData
  | OrganicPublishNodeData
  | PublisherNodeData
  | ApiRenderNodeData
  | ImageNodeData
  | VideoNodeData
  | AudioNodeData
  | DocumentNodeData
  | VideoDecodeNodeData
  | FrameExtractNodeData
  | HyperframesAgentNodeData;
export type StudioNode = Node & { data: StudioNodeData };

export type ExecutionStatus = 'idle' | 'running' | 'awaiting' | 'completed' | 'failed';
export interface NodeExecutionState {
  status: ExecutionStatus;
  output?: any;
  error?: string;
}
