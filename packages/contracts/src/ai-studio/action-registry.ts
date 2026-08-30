import { z } from 'zod';

import {
  burnInAnchorSchema,
  VERNE_TITLE_ANCHOR_OFFSET_Y,
  VERNE_TITLE_MEASURE,
  VERNE_TITLE_MIN_CONTRAST,
  VERNE_TITLE_RIGHT_MARGIN,
} from '../design-system/placement';

// The Canvas action catalog — every deterministic operation an `action` node can run,
// declared in one place so a new op is a registry entry rather than a node type.
//
// Declared UP FRONT, all of them: the ids here are the contract the menu, the node
// component and the runner agree on. An op with no runner yet simply has no Frontend
// entry — declaring it costs nothing and keeps the later shells at one line each. The
// alternative (grow the list as ops land) is how `MEDIA_NODE_TYPES`, `RUNNABLE_NODE_TYPES`
// and `OWN_FIELDS_BY_TYPE` drifted into three disagreeing copies of "which nodes run".
//
// Data only — no React, no engine code. The Backend imports this through the root entry.

/** What flows through an action port. Deliberately NOT `StudioPortDataType`: an action
 *  never moves audio or documents, and collection-ness is a runtime output SHAPE
 *  (`outputsCollection`), never a port type. */
export type ActionModality = 'image' | 'video' | 'text';

/** One input port on an action. `max` is the connection limit that handle enforces. */
export interface ActionPort {
  readonly handle: string;
  readonly modality: ActionModality;
  readonly max: number;
}

export interface ActionDef {
  readonly id: ActionId;
  /** The id's prefix, and the menu family. Asserted equal to the prefix in the test. */
  readonly family: ActionModality;
  readonly label: string;
  readonly description: string;
  /** Menu grouping inside the family — two hover levels, never three (#260). */
  readonly group: string;
  /**
   * Where the work happens. The rule, asserted in the test: an op that RE-ENCODES video
   * goes through the splicer worker; anything whose output is a still or text runs sync
   * in-node (the `frameExtract` branch is the template). Equivalent to
   * `execution === 'worker'` ⟺ `output === 'video'`.
   */
  readonly execution: 'sync' | 'worker';
  readonly inputs: readonly ActionPort[];
  readonly output: ActionModality;
  /** True when the runner emits a collection of `output` rather than a single item. */
  readonly outputsCollection?: boolean;
  /** Schema for `node.data.config`. Every op's defaults must parse from `{}`. */
  readonly config: z.ZodType;
}

export const ACTION_IDS = [
  'image.grade',
  'image.filter',
  'image.tint',
  'image.blur',
  'image.rotate',
  'image.flip',
  'image.duplicate',
  'image.chromaKey',
  'image.crop',
  'image.pad',
  'image.text',
  'video.grade',
  'video.filter',
  'video.effect',
  'video.blur',
  'video.speed',
  'video.kenBurns',
  'video.stitch',
  'video.split',
  'video.crop',
  'video.pad',
  'video.watermark',
  'video.greenscreen',
  'video.reverse',
  'video.boomerang',
  'video.longExposure',
  'video.overlay',
  'video.subtitles',
  'video.extractFrames',
  'video.frameGrid',
  'text.split',
  'text.findReplace',
  'text.concat',
] as const;

export type ActionId = (typeof ACTION_IDS)[number];

export const isActionId = (value?: unknown): value is ActionId =>
  typeof value === 'string' && (ACTION_IDS as readonly string[]).includes(value);

// ---------------------------------------------------------------------------
// Shared config fragments
// ---------------------------------------------------------------------------

/** The eight adjustments effectSpec already resolves, so preview == export. */
const gradeConfig = z.object({
  brightness: z.number().min(0).max(3).default(1),
  contrast: z.number().min(0).max(3).default(1),
  saturation: z.number().min(0).max(3).default(1),
  hueRotate: z.number().min(-180).max(180).default(0),
  sepia: z.number().min(0).max(1).default(0),
  grayscale: z.number().min(0).max(1).default(0),
  invert: z.number().min(0).max(1).default(0),
  opacity: z.number().min(0).max(1).default(1),
  warmth: z.number().min(-1).max(1).default(0),
});

const filterConfig = z.object({
  preset: z
    .enum([
      'none',
      'noir',
      'vivid',
      'faded',
      'fade',
      'warm',
      'cool',
      'mono',
      'grayscale',
      'sepia',
      'duotone',
      'clarendon',
      'moon',
      'nashville',
    ])
    .default('none'),
  intensity: z.number().min(0).max(1).default(1),
});

const tintConfig = z.object({
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#ffffff'),
  amount: z.number().min(0).max(1).default(0.25),
  blend: z.enum(['multiply', 'screen', 'overlay', 'soft-light']).default('multiply'),
});

// Shared with video.blur, whose engine reads radiusPx only — the kind-specific
// fields are inert there until the video engine wires them.
const blurConfig = z.object({
  kind: z
    .enum(['gaussian', 'box', 'motion', 'radial', 'bilateral', 'bokeh', 'tiltShift', 'targetColor'])
    .default('gaussian'),
  radiusPx: z.number().min(0).max(200).default(8),
  angleDeg: z.number().min(-180).max(180).default(0),
  centerX: z.number().min(0).max(1).default(0.5),
  centerY: z.number().min(0).max(1).default(0.5),
  focusY: z.number().min(0).max(1).default(0.5),
  focusHeight: z.number().min(0).max(1).default(0.25),
  edgeThreshold: z.number().min(0).max(1).default(0.12),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#00ff00'),
  tolerance: z.number().min(0).max(1).default(0.3),
  softness: z.number().min(0).max(1).default(0.1),
});

const chromaKeyConfig = z.object({
  mode: z.enum(['remove', 'isolate', 'replace']).default('remove'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#00ff00'),
  replacement: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#ffffff'),
  tolerance: z.number().min(0).max(1).default(0.3),
  softness: z.number().min(0).max(1).default(0.1),
});

const aspectConfig = z.object({
  aspectRatio: z
    .string()
    .regex(/^\d+(\.\d+)?:\d+(\.\d+)?$/)
    .default('1:1'),
});

const padConfig = z.object({
  aspectRatio: z
    .string()
    .regex(/^\d+(\.\d+)?:\d+(\.\d+)?$/)
    .default('1:1'),
  background: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#000000'),
});

/**
 * `image.text` — the placement INTENT, never the placement.
 *
 * The plan is COMPUTED at run time by `planPlacement` (design-system/placement.ts) from the
 * image, the text and these settings: the line breaks, the per-line sizes, the anchor pixel
 * and the contrast ladder all depend on pixels and font metrics that contracts cannot see.
 * Storing a `PlacementPlan` here would freeze a decision against an image that has since been
 * regenerated, and a stale plan is worse than none — it looks authoritative.
 *
 * Three rules shape the fields:
 *
 *   • PLACEMENT IS DIRECT MANIPULATION, not a form. An anchor plus a nudge is what a drag
 *     writes and what a snap clears, so the panel and the runner share one representation.
 *     An earlier cut of this schema exposed `typeSection`/`inkSection` as raw
 *     `designSectionSchema` enums purely so the generic Zod panel could render SOMETHING;
 *     that offered `motion` and `iconography` as the source of a text colour. Type comes
 *     from typography and ink comes from the palette — neither is a question with a second
 *     right answer, so neither is a field. `image.text` gets its own panel instead
 *     (`nodes/action/BurnInConfig.tsx`), the way `video.overlay` and `video.subtitles` do.
 *   • FRACTIONS, NEVER PIXELS. The same node has to hold when it runs against a 1080×1350
 *     and a 1080×1920 frame; a pixel offset silently means something different in each.
 *   • Calibrated defaults come from the `VERNE_*` constants rather than being retyped, so a
 *     retune moves both the planner and the node's default in one edit.
 */
const textPlacementConfig = z.object({
  /** Which of the nine anchor points the measure is pinned to. */
  anchor: burnInAnchorSchema.default('top-right'),
  /**
   * Nudge off the anchor, as a fraction of the frame's width and height.
   *
   * ZERO IS THE ANCHOR, and that is load-bearing: a snapped placement carries no offset, so
   * it stays anchor-relative and survives a change of output size. Only a hand-dragged block
   * that landed outside the snap radius keeps a residual here, expressed against whichever
   * anchor it ended up nearest.
   */
  offsetX: z.number().min(-1).max(1).default(0),
  offsetY: z.number().min(-1).max(1).default(VERNE_TITLE_ANCHOR_OFFSET_Y),
  /** Clear space between the block and the frame edge, as a fraction of the axis it is on. */
  marginFrac: z.number().min(0).max(0.45).default(VERNE_TITLE_RIGHT_MARGIN),
  /**
   * Token NAME in the brand's PALETTE — the one thing about the ink a user gets to choose.
   * Empty means the palette's default ink. A REFERENCE, not a value: re-tinting the palette
   * re-tints every headline instead of leaving hand-typed hexes behind.
   */
  inkToken: z.string().max(120).default(''),
  /**
   * A literal ink, picked by hand, that opts OUT of the palette chain above.
   *
   * MUTUALLY EXCLUSIVE with `inkToken` and deliberately the lesser of the two: a token is a
   * REFERENCE, so re-tinting the palette re-tints every headline, while a hex set here stays
   * whatever it was. Null — the default — means the token chain decides, which is what almost
   * every piece should do. Set, it also short-circuits the substitution ladder in
   * `setImageText`: a colour chosen by hand cannot fail to resolve, so there is nothing for
   * `fallbackInk` to fall back FROM.
   */
  inkHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null),
  /** Composition measure — the width lines break to — as a fraction of the image width. */
  measure: z.number().min(0.1).max(1).default(VERNE_TITLE_MEASURE),
  /** WCAG ratio the headline must hold against whatever is behind it. */
  minContrast: z.number().min(1).max(21).default(VERNE_TITLE_MIN_CONTRAST),
  /**
   * May the treatment ladder touch the BACKGROUND (harmonise, then veil) to reach
   * `minContrast`? False pins the piece at rung 0: the plan comes back with the ratio it
   * actually measured and `cleared: false`, rather than a photo quietly washed out.
   *
   * The ladder outranks the placement, always: a hand-dragged block over a dark patch
   * escalates the BACKGROUND rather than moving the type somewhere friendlier.
   */
  escalate: z.boolean().default(true),
  /**
   * May the op set the headline in a face Continuum ships when the brand names none anywhere?
   *
   * DEFAULT ON, because a node that refuses to draw is worth less than one that draws and says
   * what it drew — and it says so: the resolved face and its rung are on the node and in the
   * panel either way. OFF restores a hard refusal, which is the right setting for a piece where
   * a substitute typeface is worse than no piece at all.
   */
  fallbackType: z.boolean().default(true),
  /**
   * May the op MEASURE a legible ink off the photo when no brand shape carries a colour?
   *
   * Same trade, and the same default. The fallback is never a hard-coded hex — `deriveLegibleInk`
   * compares near-black against the box's darkest slice and white against its brightest, and
   * takes the winner — so OFF is not "avoid a guess", it is "this piece must be in a brand
   * colour or not exist".
   */
  fallbackInk: z.boolean().default(true),
});

const overlayTransformConfig = z.object({
  position: z
    .enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'])
    .default('top-right'),
  scale: z.number().min(0.01).max(1).default(0.15),
  marginFrac: z.number().min(0).max(0.5).default(0.04),
  opacity: z.number().min(0).max(1).default(1),
  startSec: z.number().min(0).nullable().default(null),
  endSec: z.number().min(0).nullable().default(null),
});

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

const singleImageIn: readonly ActionPort[] = [{ handle: 'in', modality: 'image', max: 1 }];
const singleVideoIn: readonly ActionPort[] = [{ handle: 'in', modality: 'video', max: 1 }];
const singleTextIn: readonly ActionPort[] = [{ handle: 'in', modality: 'text', max: 1 }];

export const ACTION_DEFS = {
  // ── image (sync canvas work) ───────────────────────────────────────────────
  'image.grade': {
    id: 'image.grade',
    family: 'image',
    label: 'Colour Grade',
    description: 'Brightness, contrast, saturation and hue, applied to a still.',
    group: 'Colour',
    execution: 'sync',
    inputs: singleImageIn,
    output: 'image',
    config: gradeConfig,
  },
  'image.filter': {
    id: 'image.filter',
    family: 'image',
    label: 'Filter',
    description: 'A named look — noir, vivid, faded, warm, cool or mono.',
    group: 'Colour',
    execution: 'sync',
    inputs: singleImageIn,
    output: 'image',
    config: filterConfig,
  },
  'image.tint': {
    id: 'image.tint',
    family: 'image',
    label: 'Tint',
    description: 'Washes the image toward one colour, by amount.',
    group: 'Colour',
    execution: 'sync',
    inputs: singleImageIn,
    output: 'image',
    config: tintConfig,
  },
  'image.blur': {
    id: 'image.blur',
    family: 'image',
    label: 'Blur',
    description: 'Gaussian blur at a pixel radius.',
    group: 'Colour',
    execution: 'sync',
    inputs: singleImageIn,
    output: 'image',
    config: blurConfig,
  },
  'image.rotate': {
    id: 'image.rotate',
    family: 'image',
    label: 'Rotate',
    description: 'Rotates the image by a quarter turn, or any angle.',
    group: 'Transform',
    execution: 'sync',
    inputs: singleImageIn,
    output: 'image',
    config: z.object({
      degrees: z.number().min(-360).max(360).default(90),
      expand: z.boolean().default(true),
      background: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .nullable()
        .default(null),
    }),
  },
  'image.flip': {
    id: 'image.flip',
    family: 'image',
    label: 'Flip',
    description: 'Mirrors the image horizontally, vertically, or both.',
    group: 'Transform',
    execution: 'sync',
    inputs: singleImageIn,
    output: 'image',
    config: z.object({
      horizontal: z.boolean().default(true),
      vertical: z.boolean().default(false),
    }),
  },
  'image.chromaKey': {
    id: 'image.chromaKey',
    family: 'image',
    label: 'Chroma Key',
    description: 'Knocks a background colour out to transparency.',
    group: 'Transform',
    execution: 'sync',
    inputs: singleImageIn,
    output: 'image',
    config: chromaKeyConfig,
  },
  'image.crop': {
    id: 'image.crop',
    family: 'image',
    label: 'Crop to Ratio',
    description: 'Fills a new aspect ratio, cropping what does not fit.',
    group: 'Transform',
    execution: 'sync',
    inputs: singleImageIn,
    output: 'image',
    config: aspectConfig,
  },
  'image.pad': {
    id: 'image.pad',
    family: 'image',
    label: 'Pad to Ratio',
    description: 'Fits a new aspect ratio, filling the margins with a colour.',
    group: 'Transform',
    execution: 'sync',
    inputs: singleImageIn,
    output: 'image',
    config: padConfig,
  },
  'image.text': {
    id: 'image.text',
    family: 'image',
    label: 'Burn In Text',
    description:
      'Burns brand type into a still. The placement is measured from the image — line breaks, size and contrast — rather than guessed, and the ink is always the brand token.',
    group: 'Overlay',
    execution: 'sync',
    inputs: [
      { handle: 'in', modality: 'image', max: 1 },
      { handle: 'text-in', modality: 'text', max: 1 },
    ],
    output: 'image',
    config: textPlacementConfig,
  },
  'image.duplicate': {
    id: 'image.duplicate',
    family: 'image',
    label: 'Duplicate',
    description: 'Emits N copies of its input, as a collection the batch fan-out loops over.',
    group: 'Transform',
    execution: 'sync',
    inputs: singleImageIn,
    output: 'image',
    outputsCollection: true,
    config: z.object({ copies: z.number().int().min(1).max(100).default(2) }),
  },

  // ── video: re-encoding ops go through the splicer worker ───────────────────
  'video.grade': {
    id: 'video.grade',
    family: 'video',
    label: 'Colour Grade',
    description: 'Brightness, contrast, saturation and hue, applied to every frame.',
    group: 'Colour',
    execution: 'worker',
    inputs: singleVideoIn,
    output: 'video',
    config: gradeConfig,
  },
  'video.filter': {
    id: 'video.filter',
    family: 'video',
    label: 'Filter',
    description: 'A named look applied across the clip.',
    group: 'Colour',
    execution: 'worker',
    inputs: singleVideoIn,
    output: 'video',
    config: filterConfig,
  },
  'video.effect': {
    id: 'video.effect',
    family: 'video',
    label: 'Effect',
    description: 'A transform, flip or blend from the clip effect spec.',
    group: 'Colour',
    execution: 'worker',
    inputs: singleVideoIn,
    output: 'video',
    config: z.object({
      preset: z.string().min(1).default('none'),
      intensity: z.number().min(0).max(1).default(1),
    }),
  },
  'video.blur': {
    id: 'video.blur',
    family: 'video',
    label: 'Blur',
    description: 'Gaussian blur across every frame.',
    group: 'Colour',
    execution: 'worker',
    inputs: singleVideoIn,
    output: 'video',
    config: blurConfig,
  },
  'video.speed': {
    id: 'video.speed',
    family: 'video',
    label: 'Speed',
    description:
      'Speeds the clip up or slows it down. Audio is dropped on a speed change — pitch-preserving resampling is not implemented.',
    group: 'Time',
    execution: 'worker',
    inputs: singleVideoIn,
    output: 'video',
    config: z.object({ rate: z.number().min(0.1).max(8).default(2) }),
  },
  'video.kenBurns': {
    id: 'video.kenBurns',
    family: 'video',
    label: 'Ken Burns',
    description: 'Slow push or pull across the frame.',
    group: 'Time',
    execution: 'worker',
    inputs: singleVideoIn,
    output: 'video',
    config: z.object({
      direction: z.enum(['in', 'out', 'left', 'right', 'up', 'down']).default('in'),
      amount: z.number().min(0).max(1).default(0.2),
    }),
  },
  'video.stitch': {
    id: 'video.stitch',
    family: 'video',
    label: 'Stitch',
    description: 'Joins clips end to end, in wiring order.',
    group: 'Assembly',
    execution: 'worker',
    inputs: [{ handle: 'in', modality: 'video', max: 20 }],
    output: 'video',
    config: z.object({
      transition: z.enum(['none', 'crossDissolve']).default('none'),
      transitionSec: z.number().min(0).max(3).default(0.5),
    }),
  },
  'video.split': {
    id: 'video.split',
    family: 'video',
    label: 'Split',
    description: 'Cuts one clip at a timestamp into two clips.',
    group: 'Assembly',
    execution: 'worker',
    inputs: singleVideoIn,
    output: 'video',
    outputsCollection: true,
    config: z.object({ atSec: z.number().min(0).default(1) }),
  },
  'video.crop': {
    id: 'video.crop',
    family: 'video',
    label: 'Crop to Ratio',
    description: 'Fills a new aspect ratio, cropping what does not fit.',
    group: 'Transform',
    execution: 'worker',
    inputs: singleVideoIn,
    output: 'video',
    config: aspectConfig,
  },
  'video.pad': {
    id: 'video.pad',
    family: 'video',
    label: 'Pad to Ratio',
    description: 'Fits a new aspect ratio, filling the margins with a colour.',
    group: 'Transform',
    execution: 'worker',
    inputs: singleVideoIn,
    output: 'video',
    config: padConfig,
  },
  'video.watermark': {
    id: 'video.watermark',
    family: 'video',
    label: 'Watermark',
    description: 'Burns an image into every frame at a corner.',
    group: 'Overlay',
    execution: 'worker',
    inputs: [
      { handle: 'in', modality: 'video', max: 1 },
      { handle: 'overlay-in', modality: 'image', max: 1 },
    ],
    output: 'video',
    config: overlayTransformConfig,
  },
  'video.greenscreen': {
    id: 'video.greenscreen',
    family: 'video',
    label: 'Greenscreen',
    description: 'Keys a background colour out and replaces it with another clip or image.',
    group: 'Overlay',
    execution: 'worker',
    inputs: [
      { handle: 'in', modality: 'video', max: 1 },
      { handle: 'background-in', modality: 'image', max: 1 },
    ],
    output: 'video',
    config: chromaKeyConfig,
  },
  'video.reverse': {
    id: 'video.reverse',
    family: 'video',
    label: 'Reverse',
    description: 'Plays the clip backwards. Audio is dropped — reversed PCM is not implemented.',
    group: 'Time',
    execution: 'worker',
    inputs: singleVideoIn,
    output: 'video',
    config: z.object({}),
  },
  'video.boomerang': {
    id: 'video.boomerang',
    family: 'video',
    label: 'Boomerang',
    description: 'Plays the clip forward, then backward.',
    group: 'Time',
    execution: 'worker',
    inputs: singleVideoIn,
    output: 'video',
    config: z.object({ overlapSec: z.number().min(0).max(2).default(0) }),
  },
  'video.longExposure': {
    id: 'video.longExposure',
    family: 'video',
    label: 'Long Exposure',
    description: 'Blends every frame into one still — light trails from motion.',
    group: 'Time',
    execution: 'sync',
    inputs: singleVideoIn,
    output: 'image',
    config: z.object({
      mode: z.enum(['average', 'lighten', 'darken']).default('average'),
      sampleFps: z.number().min(1).max(60).default(12),
    }),
  },
  'video.overlay': {
    id: 'video.overlay',
    family: 'video',
    label: 'Burn In',
    description: 'Composites an image or clip over the video for a timed window.',
    group: 'Overlay',
    execution: 'worker',
    inputs: [
      { handle: 'in', modality: 'video', max: 1 },
      { handle: 'overlay-in', modality: 'image', max: 4 },
    ],
    output: 'video',
    config: overlayTransformConfig,
  },
  'video.subtitles': {
    id: 'video.subtitles',
    family: 'video',
    label: 'Subtitles',
    description: 'Transcribes the clip and burns word-synced captions in.',
    group: 'Overlay',
    execution: 'worker',
    inputs: singleVideoIn,
    output: 'video',
    config: z.object({
      preset: z.enum(['pop', 'pulse', 'glide', 'fusion', 'classic', 'boxed']).default('pop'),
      emphasize: z.boolean().default(true),
      language: z.string().nullable().default(null),
    }),
  },
  'video.extractFrames': {
    id: 'video.extractFrames',
    family: 'video',
    label: 'Extract Frames',
    description: 'Pulls stills out of a clip — evenly spaced, on an interval, or at cuts.',
    group: 'Frames',
    execution: 'sync',
    inputs: singleVideoIn,
    output: 'image',
    outputsCollection: true,
    config: z.object({
      mode: z.enum(['single', 'evenly', 'interval', 'sceneChange']).default('evenly'),
      count: z.number().int().min(1).max(60).default(6),
      intervalSec: z.number().min(0.1).max(60).default(1),
      atSec: z.number().min(0).default(0),
      threshold: z.number().min(0).max(1).default(0.12),
    }),
  },
  'video.frameGrid': {
    id: 'video.frameGrid',
    family: 'video',
    label: 'Frame Grid',
    description: 'Tiles sampled frames into one contact-sheet image.',
    group: 'Frames',
    execution: 'sync',
    inputs: singleVideoIn,
    output: 'image',
    config: z.object({
      columns: z.number().int().min(1).max(8).default(3),
      rows: z.number().int().min(1).max(8).default(3),
      cellWidth: z.number().int().min(64).max(1024).default(480),
      gap: z.number().int().min(0).max(64).default(8),
      background: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default('#000000'),
    }),
  },

  // ── text (pure) ────────────────────────────────────────────────────────────
  'text.split': {
    id: 'text.split',
    family: 'text',
    label: 'Split Text',
    description: 'Breaks text into a list — by line, by comma, or on your own separator.',
    group: 'Text',
    execution: 'sync',
    inputs: singleTextIn,
    output: 'text',
    outputsCollection: true,
    config: z.object({
      mode: z
        .enum(['newline', 'comma', 'custom', 'regex', 'paragraph', 'lineCount', 'charCount'])
        .default('newline'),
      separator: z.string().default(''),
      trim: z.boolean().default(true),
      skipEmpty: z.boolean().default(true),
      size: z.number().int().min(1).max(10_000).default(1),
      maxParts: z.number().int().min(1).max(100).nullable().default(null),
    }),
  },
  'text.findReplace': {
    id: 'text.findReplace',
    family: 'text',
    label: 'Find & Replace',
    description: 'Swaps every occurrence of one string for another.',
    group: 'Text',
    execution: 'sync',
    inputs: singleTextIn,
    output: 'text',
    config: z.object({
      find: z.string().default(''),
      replace: z.string().default(''),
      caseSensitive: z.boolean().default(false),
      regex: z.boolean().default(false),
      wholeWord: z.boolean().default(false),
    }),
  },
  'text.concat': {
    id: 'text.concat',
    family: 'text',
    label: 'Join Text',
    description: 'Joins several text inputs into one, in wiring order.',
    group: 'Text',
    execution: 'sync',
    inputs: [{ handle: 'in', modality: 'text', max: 10 }],
    output: 'text',
    config: z.object({
      separator: z.string().default('\n'),
      prefix: z.string().default(''),
      suffix: z.string().default(''),
      trim: z.boolean().default(false),
      skipEmpty: z.boolean().default(true),
    }),
  },
} satisfies Record<ActionId, ActionDef>;

/** The definition for an id, when it is one. Accepts `unknown` so callers can hand it
 *  raw node data without narrowing first. */
export const actionDef = (id?: unknown): ActionDef | undefined =>
  isActionId(id) ? ACTION_DEFS[id] : undefined;

/** The modality an action node emits, or undefined when its op is not set yet. */
export const actionOutputModality = (id?: unknown): ActionModality | undefined =>
  actionDef(id)?.output;

/** The input port an action exposes under `handle`, when it has one. */
export const actionInputPort = (id: unknown, handle: string): ActionPort | undefined =>
  actionDef(id)?.inputs.find((port) => port.handle === handle);
