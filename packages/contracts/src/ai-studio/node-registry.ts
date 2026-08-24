import type { StudioNodeType } from './workflow-graph';

// ONE description of every canvas node type — what it is called, what it is for, and
// which behaviours it has.
//
// Before this, "what nodes are there" was answered in nine places that disagreed:
// `STUDIO_NODE_TYPES` + `baseNodeData` here in contracts, `NODE_PURPOSE` in the agent
// prompt, `NODE_TYPES` / `createNodeConfig` / `nodeTypes` in StudioCanvas.tsx,
// `addNodeCatalog.ts`, `MEDIA_NODE_TYPES` in executeWorkflow.ts, `RUNNABLE_NODE_TYPES`
// in canvasRunRequests.ts, `OWN_FIELDS_BY_TYPE` in generationSignature.ts and
// `NODE_TYPE_LABEL` in WorkflowLibrary.tsx. Three of those were sets of "which nodes
// run" that had already drifted apart from each other.
//
// DATA ONLY — no React, no imports beyond the node-type union. The Backend imports it
// through the root entry, so nothing here may reach for the DOM or a component.
//
// After this lands, a new node type is: one array entry in `STUDIO_NODE_TYPES`, one
// entry here, one `baseNodeData` case, one Frontend block component, one Frontend map
// entry. The `satisfies Record<StudioNodeType, …>` below is what makes that a promise
// rather than a hope — it fails the typecheck in BOTH directions (a missing type and
// an invented one).

/** How the palette groups a node. What the node IS, not what it emits: `frameExtract`
 *  produces an image but is filed under Action, because that is where somebody looking
 *  for "pull a frame out" will look. */
export type StudioNodeCategory = 'text' | 'image' | 'video' | 'audio' | 'document' | 'action';

/** Who runs the node. `videoGen` is filed under its DEFAULT model's provider; the Fal
 *  models are not separate node types, they are a per-model expansion of `videoGen`
 *  from `VIDEO_GENERATOR_MODEL_GROUPS` at the catalog layer. */
export type StudioNodeProvider = 'google' | 'fal' | 'continuum';

/** Which publishing surface a terminal handoff delivers to. */
export type StudioNodeSink = 'organic' | 'paid' | 'render';

export interface StudioNodeDefinition {
  /** Menu label. */
  readonly label: string;
  /** Menu blurb — one line, user-facing. */
  readonly description: string;
  readonly category: StudioNodeCategory;
  readonly provider: StudioNodeProvider;
  /** The agent-facing sentence. Rendered verbatim into the node vocabulary prompt. */
  readonly purpose: string;
  /** The executor runs this node and the run summary reports it. */
  readonly runnable: boolean;
  /** A run of this node produces a media asset worth registering in the library. */
  readonly producesMedia: boolean;
  /** Set only on terminal DELIVERY handoffs, which a run walks up to but never executes. */
  readonly sink?: StudioNodeSink;
  /** Own fields folded into the generation signature (run-skip). Only the types the
   *  Frontend actually signature-tracks carry one. */
  readonly signatureFields?: readonly string[];
}

/**
 * The nanoGen generation-signature recipe, byte-for-byte as the Frontend stamps it
 * (`generationSignature.ts` `OWN_FIELDS_BY_TYPE.nanoGen`, version `sig2`).
 *
 * THIS ORDER AND THIS MEMBERSHIP ARE LOAD-BEARING. The signature is a join of
 * `field=value` in list order; changing either produces a string that no existing node
 * matches, which marks every nanoGen on every saved canvas stale and regenerates the
 * lot on the next Run. That is exactly bug #221, and it is why `node-registry.test.ts`
 * pins this against the Frontend source rather than trusting a careful copy.
 */
export const NANO_GEN_SIGNATURE_FIELDS = [
  'positivePrompt',
  'negativePrompt',
  'model',
  'aspectRatio',
  'imageSize',
  'stylePreset',
  'skillIds',
  'seed',
  'steps',
  'guidance',
  'scheduler',
  'promptEnhancement',
  'brandBookPieces',
] as const;

/** The shared recipe for every video generator type — same caveat as above. */
export const VIDEO_GENERATOR_SIGNATURE_FIELDS = [
  'prompt',
  'negativePrompt',
  'model',
  'enhancePrompt',
  'skillIds',
  'aspectRatio',
  'resolution',
  'durationSeconds',
  'referenceMode',
] as const;

export const STUDIO_NODE_REGISTRY = {
  // ── text ───────────────────────────────────────────────────────────────────
  string: {
    label: 'Text Block',
    description: 'Prompt and enrichment input',
    category: 'text',
    provider: 'continuum',
    purpose: 'a text / prompt box — the usual way to feed wording into a generator',
    runnable: true,
    producesMedia: false,
  },
  note: {
    label: 'Note / Annotation',
    description: 'Free-text canvas note with bold (⌘B)',
    category: 'text',
    provider: 'continuum',
    purpose:
      'a sticky note for humans reading the canvas — it wires to nothing and never runs. Add one to explain a branch; never to feed a generator (use `string` for that)',
    runnable: false,
    producesMedia: false,
  },

  // ── image ──────────────────────────────────────────────────────────────────
  nanoGen: {
    label: 'Image Generation',
    description: 'Canvas and generator output',
    category: 'image',
    provider: 'google',
    purpose: 'image generator',
    runnable: true,
    producesMedia: true,
    signatureFields: NANO_GEN_SIGNATURE_FIELDS,
  },
  image: {
    label: 'Image Reference',
    description: 'Image file input',
    category: 'image',
    provider: 'continuum',
    purpose: 'a reference image already in the brand library or uploaded',
    runnable: false,
    producesMedia: false,
  },
  element: {
    label: 'Element',
    description: 'A saved model, product, character or style, as a reusable reference',
    category: 'image',
    provider: 'continuum',
    purpose:
      'a saved brand Element — a model, character, product, object, material, setting or style kept as a small set of reference images with one canonical reference. Wire it into a generator to keep the same subject across generations',
    // Wave 1 declares the vocabulary only. The reference-generation runtime (and with it
    // `runnable: true`) lands with the elements backend.
    runnable: false,
    producesMedia: false,
  },
  designRef: {
    label: 'Design Reference',
    description: 'One section of the brand design system, as a live reference',
    category: 'image',
    provider: 'continuum',
    purpose:
      'one named section of the brand design system (palette, typography, logo, motion, …) emitted as a reference. Its `image` output is the section specimen a generator can look at; its `text` output is the same section as a token summary. A connected designRef overrides the ambient brand grounding for that section on the node it feeds',
    // Expected to flip to `runnable: true` in Wave 2, when specimen generation lands for
    // sections that have no stored exemplar to emit.
    runnable: false,
    producesMedia: false,
  },
  layerEditor: {
    label: 'Layer Editor',
    description: 'Stack, place and blend stills into one composed image',
    category: 'image',
    // Filed under Image, not Action, deliberately: Action already carries nine members,
    // and a stills compositor is what somebody browsing Image expects to find.
    provider: 'continuum',
    purpose:
      'a spatial compositor for stills — stack several images, move, scale, rotate and blend them, and output one composed image',
    runnable: true,
    producesMedia: true,
  },

  // ── video ──────────────────────────────────────────────────────────────────
  videoGen: {
    label: 'Video Generation',
    description: 'Model-selectable video generator',
    category: 'video',
    provider: 'google',
    purpose: 'video generator (model-selectable)',
    runnable: true,
    producesMedia: true,
    signatureFields: VIDEO_GENERATOR_SIGNATURE_FIELDS,
  },
  veoDirector: {
    label: 'Veo 3.1 Director',
    description: 'Highest quality Veo, slowest',
    category: 'video',
    provider: 'google',
    purpose: 'video generator pinned to Veo 3.1 (highest quality, slowest)',
    runnable: true,
    producesMedia: true,
    signatureFields: VIDEO_GENERATOR_SIGNATURE_FIELDS,
  },
  veoFast: {
    label: 'Veo 3.1 Fast',
    description: 'First/last frame driven Veo',
    category: 'video',
    provider: 'google',
    purpose: 'video generator pinned to Veo 3.1 Fast (first/last frame driven)',
    runnable: true,
    producesMedia: true,
    signatureFields: VIDEO_GENERATOR_SIGNATURE_FIELDS,
  },
  omniGen: {
    label: 'Omni Flash (Edit)',
    description: 'Generate a clip, then chat to edit it into variations',
    category: 'video',
    provider: 'google',
    purpose: 'Gemini Omni video generator, conversational variations',
    // RECONCILIATION (Canvas V3): omniGen produces media and the executor runs it, but it
    // was missing from canvasRunRequests' RUNNABLE_NODE_TYPES, so an MCP run summary never
    // mentioned it. Behaviour fix, not a widening.
    runnable: true,
    producesMedia: true,
  },
  extendVideo: {
    label: 'Extend Video',
    description: 'Continue existing footage',
    category: 'video',
    provider: 'google',
    purpose: 'extends an existing video by a few more seconds',
    runnable: true,
    producesMedia: true,
  },
  timelineEditor: {
    label: 'Video Editor',
    description: 'Full editor — trim, split & sequence clips + stills',
    category: 'video',
    provider: 'continuum',
    purpose:
      'Video Editor — the real timeline. Wire clips into its `media-in` pool, then place them as timeline items',
    runnable: true,
    producesMedia: true,
  },
  hyperframesAgent: {
    label: 'HyperFrames Agent',
    description: 'Agentic HTML video creation with media references',
    category: 'video',
    provider: 'continuum',
    purpose:
      'agentic HTML-to-video composer — accepts a prompt plus image, video, and audio references, then renders a video',
    // RECONCILIATION (Canvas V3): same as omniGen — produces media, runs, was absent from
    // the run-summary set.
    runnable: true,
    producesMedia: true,
  },
  video: {
    label: 'Video Reference',
    description: 'Video file input',
    category: 'video',
    provider: 'continuum',
    purpose: 'a reference video already in the brand library or uploaded',
    runnable: false,
    producesMedia: false,
  },
  videoDecode: {
    label: 'Video Decoder',
    description: 'Frame-by-frame creative breakdown',
    category: 'video',
    provider: 'google',
    purpose: 'decodes a video into a text description of its frames',
    runnable: true,
    producesMedia: false,
  },

  // ── audio / document ───────────────────────────────────────────────────────
  audio: {
    label: 'Audio Reference',
    description: 'Voice or sound input',
    category: 'audio',
    provider: 'continuum',
    purpose: 'a reference audio file',
    runnable: false,
    producesMedia: false,
  },
  document: {
    label: 'Document Context',
    description: 'PDF and text knowledge',
    category: 'document',
    provider: 'continuum',
    purpose: 'a reference document (pdf / txt) whose text can be read',
    runnable: false,
    producesMedia: false,
  },

  // ── action ─────────────────────────────────────────────────────────────────
  action: {
    label: 'Action',
    description: 'One deterministic operation — rotate, grade, reverse, subtitle, split…',
    category: 'action',
    provider: 'continuum',
    purpose:
      'runs one deterministic operation from the action catalog on what it is given. The op is `data.actionId` (e.g. "image.rotate", "video.speed", "text.findReplace"), and the op decides what the node accepts and what it emits — an action with no actionId set accepts nothing',
    runnable: true,
    // PER-TYPE SIMPLIFICATION, and the one place this registry is deliberately coarse:
    // most actions emit an image or a video, so the TYPE says producesMedia. A text
    // action (text.split, text.findReplace, text.concat) emits text and has nothing to
    // register. The runtime MUST key output handling off
    // `ACTION_DEFS[data.actionId].output`, never off this flag — this flag exists only so
    // the derived MEDIA_NODE_TYPES set behaves for the common case.
    producesMedia: true,
  },
  batch: {
    label: 'Batch',
    description: 'A list of inputs — run everything downstream once per item',
    category: 'action',
    provider: 'continuum',
    purpose:
      'holds a LIST of inputs (text, images or videos, one kind per batch) and fans the nodes downstream of it out over every item. Two batches can be combined pairwise ("zip") or as every combination ("cross"). Capped at 100 items',
    runnable: true,
    // A batch emits references to items that already exist. Nothing new to register.
    producesMedia: false,
  },
  router: {
    label: 'Router',
    description: 'Send one output to several places without running it twice',
    category: 'action',
    provider: 'continuum',
    purpose:
      'passes its single input straight through to as many consumers as you wire it to, so an expensive upstream node runs ONCE and feeds all of them. It changes nothing about what flows through it',
    runnable: true,
    // Identity. Registering its output would duplicate the upstream node's library row.
    producesMedia: false,
  },
  export: {
    label: 'Export',
    description: 'Save out — PNG/JPG/WEBP, MP4/MOV/GIF, or a ZIP of a batch',
    category: 'action',
    provider: 'continuum',
    purpose:
      'terminal node that writes what it is given to a file the user downloads — stills as PNG / JPG / WEBP, video as MP4 / MOV / GIF, and a whole batch as one ZIP',
    // Terminal, but NOT a `sink`: `sink` derives PUBLISHER_NODE_KINDS, and those are the
    // handoffs a run deliberately walks up to WITHOUT executing. Export executes.
    runnable: true,
    producesMedia: false,
  },
  frameExtract: {
    label: 'Continuity Frame',
    description: 'Extract a first, last, or exact video frame',
    category: 'action',
    provider: 'continuum',
    purpose:
      'extracts an exact first, last, or timestamped frame from a video in the browser for shot continuity',
    // RECONCILIATION (Canvas V3): third of the three types that produced media but were
    // absent from the run-summary set.
    runnable: true,
    producesMedia: true,
  },
  plannerDraft: {
    label: 'Planner Draft',
    description: 'Find or create an organic Planner draft, with caption, schedule and creative',
    category: 'action',
    provider: 'continuum',
    purpose:
      'organic Planner draft — finds an existing draft or creates a new one, and attaches image, carousel, or video creative plus a caption and a schedule to it. Outputs the saved draft on `draft` for a downstream organicPublish',
    runnable: false,
    producesMedia: false,
    sink: 'organic',
  },
  organicPublish: {
    label: 'Post to Platform',
    description: 'Post a saved Planner draft now, or arm its schedule',
    category: 'action',
    provider: 'continuum',
    purpose:
      'terminal sink — posts a saved Planner draft to its social account, now or on its schedule. Takes only a `plannerDraft` on `draft-in`; it never publishes a loose canvas asset',
    runnable: false,
    producesMedia: false,
    sink: 'organic',
  },
  paidPublisher: {
    label: 'Paid Ad',
    description: 'Replace creative on a paused or active Meta ad',
    category: 'action',
    provider: 'continuum',
    purpose: 'terminal sink — replaces image, carousel, or video creative on an existing Meta ad',
    runnable: false,
    producesMedia: false,
    sink: 'paid',
  },
  apiRender: {
    label: 'API Render',
    description: 'Discover a template, prepare variables, and hand off a PAUSED Meta delivery',
    category: 'action',
    provider: 'continuum',
    purpose:
      'terminal sink — prepares a version-pinned API template render and PAUSED Meta delivery for explicit confirmation',
    runnable: false,
    producesMedia: false,
    sink: 'render',
  },
} satisfies Record<StudioNodeType, StudioNodeDefinition>;

/** Palette order. Generators lead; the terminal and utility work sits at the bottom. */
export const STUDIO_NODE_CATEGORY_ORDER = [
  'text',
  'image',
  'video',
  'audio',
  'document',
  'action',
] as const;

export const studioNodeDefinition = (type: StudioNodeType): StudioNodeDefinition =>
  STUDIO_NODE_REGISTRY[type];

/** Every type whose definition satisfies `predicate`. The derived sets below are this
 *  function; call it directly for anything else rather than adding a fourth set. */
export const studioNodeTypesWhere = (
  predicate: (definition: StudioNodeDefinition, type: StudioNodeType) => boolean,
): Set<StudioNodeType> => {
  const types = Object.keys(STUDIO_NODE_REGISTRY) as StudioNodeType[];
  return new Set(types.filter((type) => predicate(STUDIO_NODE_REGISTRY[type], type)));
};

/** Replaces `executeWorkflow.MEDIA_NODE_TYPES`. */
export const STUDIO_MEDIA_NODE_TYPES: ReadonlySet<StudioNodeType> = studioNodeTypesWhere(
  (definition) => definition.producesMedia,
);

/** Replaces `canvasRunRequests.RUNNABLE_NODE_TYPES`. */
export const STUDIO_RUNNABLE_NODE_TYPES: ReadonlySet<StudioNodeType> = studioNodeTypesWhere(
  (definition) => definition.runnable,
);

/** Replaces `executeWorkflow.PUBLISHER_NODE_KINDS`. */
export const STUDIO_PUBLISHER_NODE_KINDS: Readonly<
  Partial<Record<StudioNodeType, StudioNodeSink>>
> = Object.fromEntries(
  (Object.keys(STUDIO_NODE_REGISTRY) as StudioNodeType[])
    .map((type) => [type, studioNodeDefinition(type).sink] as const)
    .filter((entry): entry is readonly [StudioNodeType, StudioNodeSink] => entry[1] !== undefined),
);

/** The signature recipe for a type, when it is signature-tracked. */
export const studioNodeSignatureFields = (type: StudioNodeType): readonly string[] | undefined =>
  studioNodeDefinition(type).signatureFields;
