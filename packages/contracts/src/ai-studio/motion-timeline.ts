// The HyperFrames motion timeline: element motion as typed keyframe data, compiled to CSS.
//
// A composition carries its motion as `<script type="application/json" data-hf-motion>` and
// the generated `<style data-hf-motion-css>` beside it, so the agent, the timeline UI, Render
// and the Forge exporter all read one model instead of reverse-engineering hand-written
// `@keyframes`. Keyframes are the video editor's `EditorKeyframe`, sampled by the same
// `sampleNumericTrack`; the one addition is a MotionMaxxing `ease` name, which CSS can draw
// (as `linear()`) and an EditorProjectV2 cannot store. No GSAP: its license forbids tools
// that let users build animations without code.

import { z } from 'zod';
import {
  type EditorKeyframe,
  type EditorTransform,
  editorKeyframeSchema,
} from './editor-project-v2';
import {
  MOTION_BEZIER_PRESETS,
  MOTION_SPRING_PRESETS,
  motionExpressionAtScale,
  type NumericKeyframe,
  sampleNumericTrack,
  springProgress,
} from './motion-eval';
import {
  CLIP_MOTION_PRESETS,
  clipMotionPresetIdSchema,
  motionPresetKeyframes,
} from './motion-presets';
import { MOTIONMAXXING_EASES, type MotionmaxxingEase } from './motionmaxxing-recipes';

/** A refusal the caller can show as-is (a 400, an agent tool error), unlike a bug. */
export class MotionTimelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MotionTimelineError';
  }
}

const MAX_ANIMATIONS = 200;
/** Points in the CSS `linear()` that draws a spring or MotionMaxxing curve. */
const CURVE_SAMPLES = 64;
const MIN_KEY_GAP_SEC = 0.001;
const TIME_EPSILON_SEC = 1e-6;
const DEFAULT_SPRING_BOUNCE = 0.4;
/** The HyperFrames SDK treats any `<script>` containing one of these as the GSAP timeline. */
const GSAP_SNIFF = /gsap|__timelines|ScrollTrigger/i;

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;
/** A CSS number: six decimals, no exponent, no `-0`. */
const css = (value: number) => String(round6(value) + 0);
const hasKey = <T extends object>(object: T, key: string): key is Extract<keyof T, string> =>
  Object.hasOwn(object, key);

// ── Schemas ───────────────────────────────────────────────────────────────────────────

const motionIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'motion ids use letters, digits, _ and - (at most 64)');
/** Preset keys are `<animation id>-<channel>-<stop>`, so a key id outgrows an animation id. */
const keyIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,96}$/, 'keyframe ids use letters, digits, _ and - (at most 96)');
const hfIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_.:-]{1,200}$/, 'data-hf-id values use letters, digits, _ . : and -');
const motionLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (label) => !/[<>=]/.test(label) && !GSAP_SNIFF.test(label),
    'motion labels may not contain <, > or =, or the words gsap, __timelines or ScrollTrigger',
  );
const secondsSchema = z.number().finite().nonnegative().max(86_400);

export const MOTION_PROPERTIES = [
  'transform.position',
  'transform.scaleX',
  'transform.scaleY',
  'transform.rotationDeg',
  'transform.opacity',
  'effect.parameter',
] as const;
export type MotionProperty = (typeof MOTION_PROPERTIES)[number];
export const motionPropertySchema = z.enum(MOTION_PROPERTIES, {
  error: (issue) =>
    `${String(issue.input)} cannot be animated: motion supports ${MOTION_PROPERTIES.join(', ')} (effect.parameter is blur or stroke.draw)`,
});

/**
 * What an op may name: the stored properties plus `stroke.draw`, an SVG stroke drawn from 0
 * (none) to 1 (the whole path) — a trim path. The editor keyframe enum has no stroke property,
 * so it is stored as an effect.parameter track whose keys carry parameterName "draw", and
 * compiles to stroke-dashoffset on a target that declares pathLength="1".
 */
export const MOTION_OP_PROPERTIES = [...MOTION_PROPERTIES, 'stroke.draw'] as const;
export type MotionOpProperty = (typeof MOTION_OP_PROPERTIES)[number];
const motionOpPropertySchema = z.enum(MOTION_OP_PROPERTIES, {
  error: (issue) =>
    `${String(issue.input)} cannot be animated: motion supports ${MOTION_OP_PROPERTIES.join(', ')} (effect.parameter is blur only)`,
});
const storedProperty = (property: MotionOpProperty): MotionProperty =>
  property === 'stroke.draw' ? 'effect.parameter' : property;

export const MOTIONMAXXING_EASE_NAMES = Object.keys(MOTIONMAXXING_EASES) as MotionmaxxingEase[];
const motionmaxxingEaseSchema = z.enum(
  MOTIONMAXXING_EASE_NAMES as [MotionmaxxingEase, ...MotionmaxxingEase[]],
);

type BezierEaseName = keyof typeof MOTION_BEZIER_PRESETS;
type SpringEaseName = keyof typeof MOTION_SPRING_PRESETS;
const EDITOR_EASE_NAMES = [
  'hold',
  'spring',
  ...(Object.keys(MOTION_BEZIER_PRESETS) as BezierEaseName[]),
  ...(Object.keys(MOTION_SPRING_PRESETS) as SpringEaseName[]),
];
const curveYSchema = z.number().finite().min(-4).max(4);
const curveXSchema = z.number().finite().min(0).max(1);

/**
 * An ease an EditorProjectV2 keyframe can store: `linear`, `hold`, a bezier preset
 * (easeOut, easeInOutBack…), `spring` or a spring preset (gentle, quick, bouncy, slow), or
 * explicit `{ bezier: [x1, y1, x2, y2] }`.
 */
/** The named editor eases as one string enum, for inputs a provider fills (no unions). */
export const editorEaseNameSchema = z.enum(
  EDITOR_EASE_NAMES as [BezierEaseName | SpringEaseName | 'hold' | 'spring'],
);
export type EditorEaseName = z.infer<typeof editorEaseNameSchema>;
export const editorEaseSchema = z.union([
  editorEaseNameSchema,
  z.object({ bezier: z.tuple([curveXSchema, curveYSchema, curveXSchema, curveYSchema]) }).strict(),
]);
export type EditorEase = z.infer<typeof editorEaseSchema>;
/** Every editor ease plus the twelve MotionMaxxing curves (crashIn, popOver, glide…). */
export const motionEaseSchema = z.union([editorEaseSchema, motionmaxxingEaseSchema]);
export type MotionEase = z.infer<typeof motionEaseSchema>;

/**
 * An `EditorKeyframe` with an optional MotionMaxxing `ease` for its outgoing segment. When
 * set it overrides the interpolation, which must then be `linear` so an editor-only reader
 * still sees a sane curve.
 */
export const motionKeyframeSchema = editorKeyframeSchema.safeExtend({
  ease: motionmaxxingEaseSchema.optional(),
});
export type MotionKeyframe = z.infer<typeof motionKeyframeSchema>;

const isPoint = (value: unknown): value is { x: number; y: number } =>
  typeof value === 'object' && value !== null && 'x' in value && 'y' in value;

/** One property of one animation; key times are animation-local seconds. */
export const motionTrackSchema = z
  .object({
    property: motionPropertySchema,
    keyframes: z.array(motionKeyframeSchema).min(2).max(500),
  })
  .strict()
  .superRefine((track, context) => {
    const issue = (index: number, message: string) =>
      context.addIssue({ code: 'custom', path: ['keyframes', index], message });
    const ids = new Set<string>();
    track.keyframes.forEach((key, index) => {
      if (key.property !== track.property)
        issue(index, `a ${track.property} track holds only ${track.property} keys`);
      if (
        track.property === 'effect.parameter' &&
        key.parameterName !== 'blur' &&
        key.parameterName !== 'draw'
      )
        issue(index, 'effect.parameter motion animates blur (parameterName "blur") or stroke.draw');
      if (key.parameterName !== track.keyframes[0]?.parameterName)
        issue(index, 'one track animates blur or stroke.draw, never both');
      if (key.parameterName === 'draw' && Number(key.value) > 1)
        issue(index, 'stroke.draw keys lie between 0 and 1');
      if (track.property !== 'effect.parameter' && key.parameterName !== undefined)
        issue(index, 'parameterName belongs to effect.parameter keys only');
      if (key.expression !== undefined) issue(index, 'motion keys cannot carry expressions');
      if (key.ease !== undefined && key.interpolation !== 'linear')
        issue(index, 'a key with a MotionMaxxing ease must use linear interpolation');
      if (
        track.property === 'transform.position' ? !isPoint(key.value) : !Number.isFinite(key.value)
      )
        issue(
          index,
          track.property === 'transform.position'
            ? 'position keys are { x, y } pixel offsets'
            : `${track.property} keys are numbers`,
        );
      if (track.property === 'transform.opacity' && Number(key.value) > 1) {
        issue(index, 'opacity keys lie between 0 and 1');
      }
      if (
        (track.property === 'transform.opacity' || track.property === 'effect.parameter') &&
        Number(key.value) < 0
      )
        issue(index, `${track.property} keys cannot be negative`);
      if (!keyIdSchema.safeParse(key.id).success || ids.has(key.id))
        issue(index, `keyframe id ${key.id} must be unique and use letters, digits, _ and -`);
      ids.add(key.id);
      if (key.timeSec < 0) issue(index, 'key times are animation-local seconds, never negative');
      const previous = track.keyframes[index - 1];
      if (previous && key.timeSec - previous.timeSec < MIN_KEY_GAP_SEC)
        issue(index, 'keys are in time order, at least 1 ms apart');
    });
  });
export type MotionTrack = z.infer<typeof motionTrackSchema>;

export const motionStaggerSchema = z
  .object({
    eachSec: z.number().finite().positive().max(10),
    from: z.enum(['start', 'end', 'center']).default('start'),
  })
  .strict();
export type MotionStagger = z.infer<typeof motionStaggerSchema>;

const sameTiming = (left: MotionKeyframe, right: MotionKeyframe) =>
  left.timeSec === right.timeSec &&
  left.interpolation === right.interpolation &&
  left.ease === right.ease &&
  JSON.stringify(left.easing) === JSON.stringify(right.easing) &&
  left.spring?.bounce === right.spring?.bounce;

export const motionAnimationSchema = z
  .object({
    id: motionIdSchema,
    label: motionLabelSchema,
    /** `data-hf-id`s, in stagger order. Never a clip, the root, or an element with data-start. */
    targets: z.array(hfIdSchema).min(1).max(100),
    startSec: secondsSchema,
    tracks: z.array(motionTrackSchema).min(1).max(MOTION_PROPERTIES.length),
    stagger: motionStaggerSchema.optional(),
  })
  .strict()
  .superRefine((animation, context) => {
    if (new Set(animation.targets).size !== animation.targets.length)
      context.addIssue({ code: 'custom', path: ['targets'], message: 'targets repeat' });
    const properties = animation.tracks.map((track) => track.property);
    if (new Set(properties).size !== properties.length)
      context.addIssue({ code: 'custom', path: ['tracks'], message: 'one track per property' });
    const scaleX = animation.tracks.find((track) => track.property === 'transform.scaleX');
    const scaleY = animation.tracks.find((track) => track.property === 'transform.scaleY');
    if (
      scaleX &&
      scaleY &&
      (scaleX.keyframes.length !== scaleY.keyframes.length ||
        scaleX.keyframes.some((key, index) => {
          const other = scaleY.keyframes[index];
          return !other || !sameTiming(key, other);
        }))
    )
      context.addIssue({
        code: 'custom',
        path: ['tracks'],
        message: 'scaleX and scaleY compile to one CSS scale: their key times and eases must match',
      });
  });
export type MotionAnimation = z.infer<typeof motionAnimationSchema>;

export const motionDocSchema = z
  .object({
    version: z.literal(1),
    animations: z.array(motionAnimationSchema).max(MAX_ANIMATIONS),
  })
  .strict()
  .superRefine((doc, context) => {
    const ids = doc.animations.map((animation) => animation.id);
    if (new Set(ids).size !== ids.length)
      context.addIssue({ code: 'custom', path: ['animations'], message: 'animation ids repeat' });
  });
export type MotionDoc = z.infer<typeof motionDocSchema>;

export const EMPTY_MOTION_DOC: MotionDoc = { version: 1, animations: [] };

const refusal = (error: z.ZodError) =>
  new MotionTimelineError(
    error.issues
      .map((issue) => `${issue.path.length ? `${issue.path.join('.')}: ` : ''}${issue.message}`)
      .join('; '),
  );

export function parseMotionDoc(value: unknown): MotionDoc {
  const parsed = motionDocSchema.safeParse(value);
  if (!parsed.success) throw refusal(parsed.error);
  return parsed.data;
}

// ── Ops ───────────────────────────────────────────────────────────────────────────────

/** A hand-written key: `t` animation-local seconds, `v` a number or `{ x, y }` px offset. */
const motionKeyInputSchema = z
  .object({
    t: secondsSchema,
    v: z.union([
      z.number().finite(),
      z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
    ]),
    ease: motionEaseSchema.optional(),
  })
  .strict();
export type MotionKeyInput = z.infer<typeof motionKeyInputSchema>;
const motionTrackInputSchema = z
  .object({ property: motionOpPropertySchema, keys: z.array(motionKeyInputSchema).min(2).max(500) })
  .strict();
const animationRef = { animationId: motionIdSchema };

export const motionOpSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('add_animation'),
      id: motionIdSchema.optional(),
      label: motionLabelSchema,
      targets: z.array(hfIdSchema).min(1).max(100),
      startSec: secondsSchema.default(0),
      stagger: motionStaggerSchema.optional(),
      /** A clip motion preset; position offsets are composition fractions → px. */
      preset: clipMotionPresetIdSchema.optional(),
      durationSec: z.number().finite().positive().max(60).optional(),
      tracks: z.array(motionTrackInputSchema).min(1).max(MOTION_PROPERTIES.length).optional(),
    })
    .strict()
    .refine(
      (op) => (op.preset === undefined) !== (op.tracks === undefined),
      'add_animation takes either a preset or tracks',
    )
    .refine(
      (op) => op.tracks === undefined || op.durationSec === undefined,
      'durationSec sizes a preset; hand-written tracks carry their own key times',
    ),
  z.object({ type: z.literal('remove_animation'), ...animationRef }).strict(),
  z
    .object({
      type: z.literal('stagger'),
      ...animationRef,
      /** 0 removes the stagger. */
      eachSec: z.number().finite().min(0).max(10),
      from: z.enum(['start', 'end', 'center']).default('start'),
    })
    .strict(),
  z
    .object({
      type: z.literal('retime'),
      ...animationRef,
      startSec: secondsSchema.optional(),
      /** The span from the earliest to the latest key, stagger excluded. */
      durationSec: z.number().finite().positive().max(60).optional(),
    })
    .strict()
    .refine(
      (op) => op.startSec !== undefined || op.durationSec !== undefined,
      'retime needs startSec or durationSec',
    ),
  z
    .object({
      type: z.literal('ease'),
      ...animationRef,
      /** Omit to ease every track of the animation. */
      property: motionOpPropertySchema.optional(),
      ease: motionEaseSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('set_keyframes'),
      ...animationRef,
      property: motionOpPropertySchema,
      keys: z.array(motionKeyInputSchema).min(2).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal('upsert_keyframe'),
      ...animationRef,
      property: motionOpPropertySchema,
      /** Replaces the key within half a frame of `t`, else inserts one. */
      key: motionKeyInputSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('remove_keyframes'),
      ...animationRef,
      property: motionOpPropertySchema,
      keyIds: z.array(keyIdSchema).min(1).max(500),
    })
    .strict(),
  /**
   * Wraps each word of a text-only element in an inline-block span `<hfId>-w<n>`, or with
   * `by: char` each character in `<hfId>-c<n>` (words kept unbreakable) for per-letter motion.
   */
  z
    .object({
      type: z.literal('split_text'),
      hfId: hfIdSchema,
      by: z.enum(['word', 'char']).default('word'),
    })
    .strict(),
]);
export type MotionOp = z.infer<typeof motionOpSchema>;
export type MotionOpInput = z.input<typeof motionOpSchema>;

export function parseMotionOp(value: unknown): MotionOp {
  const parsed = motionOpSchema.safeParse(value);
  if (!parsed.success) throw refusal(parsed.error);
  return parsed.data;
}

/** Agent tools take ops as a JSON string: the op union is not a provider-safe tool schema. */
export function parseMotionOpsJson(json: string): MotionOp[] {
  let ops: unknown;
  try {
    ops = JSON.parse(json);
  } catch {
    throw new MotionTimelineError('The motion ops must be a JSON array of op objects.');
  }
  if (!Array.isArray(ops) || ops.length < 1 || ops.length > 50)
    throw new MotionTimelineError('The motion ops must be a JSON array of 1 to 50 op objects.');
  return ops.map((op, index) => {
    try {
      return parseMotionOp(op);
    } catch (error) {
      throw new MotionTimelineError(
        `Motion op ${index}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}

export type MotionOpContext = { width: number; height: number; fps: number; durationSec: number };

// ── Shared editor helpers (the video editor reuses these on EditorKeyframe) ───────────

/** Each target's delay under a stagger; the earliest target always starts at 0. */
export function staggerOffsets(
  count: number,
  eachSec: number,
  from: MotionStagger['from'] = 'start',
): number[] {
  const center = (count - 1) / 2;
  const steps = Array.from({ length: count }, (_, index) =>
    from === 'start' ? index : from === 'end' ? count - 1 - index : Math.abs(index - center),
  );
  const first = Math.min(...steps);
  return steps.map((step) => round6((step - first) * eachSec));
}

/** Scale key times about `pivotSec` (default: the earliest key), then shift them. */
export function retimeKeyframes<K extends { timeSec: number; expression?: string }>(
  keys: readonly K[],
  options: { shiftSec?: number; scale?: number; pivotSec?: number },
): K[] {
  const { shiftSec = 0, scale = 1 } = options;
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(shiftSec))
    throw new MotionTimelineError('retime needs a finite shift and a positive scale');
  if (keys.length === 0) return [];
  const pivot = options.pivotSec ?? Math.min(...keys.map((key) => key.timeSec));
  return keys.map((key) => ({
    ...key,
    timeSec: round6(pivot + (key.timeSec - pivot) * scale + shiftSec),
    ...(key.expression ? { expression: motionExpressionAtScale(key.expression, scale) } : {}),
  }));
}

type KeyTiming = Pick<MotionKeyframe, 'interpolation' | 'easing' | 'spring' | 'ease'>;

function easeTiming(ease: MotionEase): KeyTiming {
  if (typeof ease === 'object') {
    const [x1, y1, x2, y2] = ease.bezier;
    return { interpolation: 'bezier', easing: { x1, y1, x2, y2 } };
  }
  if (ease === 'linear' || ease === 'hold') return { interpolation: ease };
  if (ease === 'spring')
    return { interpolation: 'spring', spring: { bounce: DEFAULT_SPRING_BOUNCE } };
  if (hasKey(MOTION_SPRING_PRESETS, ease))
    return { interpolation: 'spring', spring: { bounce: MOTION_SPRING_PRESETS[ease] } };
  if (hasKey(MOTION_BEZIER_PRESETS, ease))
    return { interpolation: 'bezier', easing: { ...MOTION_BEZIER_PRESETS[ease] } };
  return { interpolation: 'linear', ease };
}

const timingOf = (key: MotionKeyframe): KeyTiming => ({
  interpolation: key.interpolation,
  ...(key.easing ? { easing: key.easing } : {}),
  ...(key.spring ? { spring: key.spring } : {}),
  ...(key.ease ? { ease: key.ease } : {}),
});

/** Give every key the same outgoing ease. */
export function easeKeyframes(keys: readonly EditorKeyframe[], ease: EditorEase): EditorKeyframe[];
export function easeKeyframes(keys: readonly MotionKeyframe[], ease: MotionEase): MotionKeyframe[];
export function easeKeyframes(keys: readonly MotionKeyframe[], ease: MotionEase): MotionKeyframe[] {
  const timing = easeTiming(ease);
  return keys.map(({ easing: _easing, spring: _spring, ease: _ease, ...key }) => ({
    ...key,
    ...timing,
  }));
}

// ── Reading an animation ──────────────────────────────────────────────────────────────

/** When an animation's first key plays and its last target settles, in composition seconds. */
export function motionAnimationWindow(animation: MotionAnimation): {
  startSec: number;
  endSec: number;
} {
  const keys = animation.tracks.flatMap((track) => track.keyframes.map((key) => key.timeSec));
  const offsets = animation.stagger
    ? staggerOffsets(animation.targets.length, animation.stagger.eachSec, animation.stagger.from)
    : [0];
  return {
    startSec: round6(animation.startSec + Math.min(...keys)),
    endSec: round6(animation.startSec + Math.max(...offsets) + Math.max(...keys)),
  };
}

const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).toSorted(([a], [b]) => (a < b ? -1 : 1)))
      : entry,
  );

/** Ids of animations added, removed or changed between two docs, sorted. */
export function diffMotion(before: MotionDoc, after: MotionDoc): string[] {
  const left = new Map(
    before.animations.map((animation) => [animation.id, canonicalJson(animation)]),
  );
  const right = new Map(
    after.animations.map((animation) => [animation.id, canonicalJson(animation)]),
  );
  return [...new Set([...left.keys(), ...right.keys()])]
    .filter((id) => left.get(id) !== right.get(id))
    .toSorted();
}

// ── Applying ops ──────────────────────────────────────────────────────────────────────

const IDENTITY_TRANSFORM: EditorTransform = {
  position: { x: 0, y: 0, unit: 'normalized' },
  scaleX: 1,
  scaleY: 1,
  rotationDeg: 0,
  rotateXDeg: 0,
  rotateYDeg: 0,
  perspective: 0,
  anchorX: 0.5,
  anchorY: 0.5,
  opacity: 1,
};

function keyFromInput(
  property: MotionOpProperty,
  key: MotionKeyInput,
  id: string,
  timing: KeyTiming,
) {
  return {
    id,
    property: storedProperty(property),
    ...(property === 'effect.parameter' ? { parameterName: 'blur' } : {}),
    ...(property === 'stroke.draw' ? { parameterName: 'draw' } : {}),
    timeSec: key.t,
    value: key.v,
    ...timing,
  } as MotionKeyframe;
}

const trackFromInput = (
  property: MotionOpProperty,
  keys: readonly MotionKeyInput[],
): MotionTrack => ({
  property: storedProperty(property),
  keyframes: keys
    .toSorted((left, right) => left.t - right.t)
    .map((key, index) =>
      keyFromInput(property, key, `k${index}`, easeTiming(key.ease ?? 'linear')),
    ),
});

function presetTracks(
  op: Extract<MotionOp, { type: 'add_animation' }> & { preset: keyof typeof CLIP_MOTION_PRESETS },
  id: string,
  context: MotionOpContext,
): MotionTrack[] {
  const durationSec =
    op.durationSec ??
    (CLIP_MOTION_PRESETS[op.preset].defaultDurationSec || context.durationSec - op.startSec);
  if (durationSec <= 0)
    throw new MotionTimelineError(`${op.preset} would start after the composition ends`);
  const tracks = new Map<MotionProperty, MotionKeyframe[]>();
  for (const key of motionPresetKeyframes(op.preset, {
    clipDurationSec: durationSec,
    base: IDENTITY_TRANSFORM,
    idPrefix: id,
    durationSec,
  })) {
    const property = key.property as MotionProperty;
    const value = isPoint(key.value)
      ? { x: round6(key.value.x * context.width), y: round6(key.value.y * context.height) }
      : key.value;
    tracks.set(property, [...(tracks.get(property) ?? []), { ...key, value }]);
  }
  return [...tracks].map(([property, keyframes]) => ({ property, keyframes }));
}

function newAnimationId(label: string, taken: ReadonlySet<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 56) || 'animation';
  let id = base;
  for (let suffix = 2; taken.has(id); suffix += 1) id = `${base}-${suffix}`;
  return id;
}

function nextKeyId(track: MotionTrack): string {
  const taken = new Set(track.keyframes.map((key) => key.id));
  let index = track.keyframes.length;
  while (taken.has(`k${index}`)) index += 1;
  return `k${index}`;
}

function mapAnimation(
  animations: readonly MotionAnimation[],
  id: string,
  update: (animation: MotionAnimation) => MotionAnimation,
): MotionAnimation[] {
  const index = animations.findIndex((animation) => animation.id === id);
  const animation = animations[index];
  if (!animation) throw new MotionTimelineError(`no animation ${id}`);
  return animations.with(index, update(animation));
}

function mapTrack(
  animation: MotionAnimation,
  property: MotionOpProperty,
  update: (track: MotionTrack | undefined) => MotionTrack,
): MotionAnimation {
  const index = animation.tracks.findIndex((track) => track.property === storedProperty(property));
  const next = update(animation.tracks[index]);
  return {
    ...animation,
    tracks: index < 0 ? [...animation.tracks, next] : animation.tracks.with(index, next),
  };
}

const requireTrack = (track: MotionTrack | undefined, animationId: string, property: string) => {
  if (!track) throw new MotionTimelineError(`animation ${animationId} has no ${property} track`);
  return track;
};

function applyToAnimations(
  animations: readonly MotionAnimation[],
  op: Exclude<MotionOp, { type: 'split_text' }>,
  context: MotionOpContext,
): MotionAnimation[] {
  switch (op.type) {
    case 'add_animation': {
      const taken = new Set(animations.map((animation) => animation.id));
      if (op.id !== undefined && taken.has(op.id))
        throw new MotionTimelineError(`animation ${op.id} already exists`);
      const id = op.id ?? newAnimationId(op.label, taken);
      const tracks = op.preset
        ? presetTracks({ ...op, preset: op.preset }, id, context)
        : (op.tracks ?? []).map((track) => trackFromInput(track.property, track.keys));
      return [
        ...animations,
        {
          id,
          label: op.label,
          targets: op.targets,
          startSec: op.startSec,
          tracks,
          ...(op.stagger ? { stagger: op.stagger } : {}),
        },
      ];
    }
    case 'remove_animation':
      if (!animations.some((animation) => animation.id === op.animationId))
        throw new MotionTimelineError(`no animation ${op.animationId}`);
      return animations.filter((animation) => animation.id !== op.animationId);
    case 'stagger':
      return mapAnimation(animations, op.animationId, ({ stagger: _stagger, ...animation }) =>
        op.eachSec > 0
          ? { ...animation, stagger: { eachSec: op.eachSec, from: op.from } }
          : animation,
      );
    case 'retime':
      return mapAnimation(animations, op.animationId, (animation) => {
        const times = animation.tracks.flatMap((track) =>
          track.keyframes.map((key) => key.timeSec),
        );
        const pivotSec = Math.min(...times);
        const scale =
          op.durationSec === undefined ? 1 : op.durationSec / (Math.max(...times) - pivotSec);
        return {
          ...animation,
          startSec: op.startSec ?? animation.startSec,
          tracks: animation.tracks.map((track) => ({
            ...track,
            keyframes: retimeKeyframes(track.keyframes, { scale, pivotSec }),
          })),
        };
      });
    case 'ease':
      return mapAnimation(animations, op.animationId, (animation) => {
        const property = op.property && storedProperty(op.property);
        if (op.property !== undefined)
          requireTrack(
            animation.tracks.find((track) => track.property === property),
            animation.id,
            op.property,
          );
        return {
          ...animation,
          tracks: animation.tracks.map((track) =>
            property === undefined || track.property === property
              ? { ...track, keyframes: easeKeyframes(track.keyframes, op.ease) }
              : track,
          ),
        };
      });
    case 'set_keyframes':
      return mapAnimation(animations, op.animationId, (animation) =>
        mapTrack(animation, op.property, () => trackFromInput(op.property, op.keys)),
      );
    case 'upsert_keyframe':
      return mapAnimation(animations, op.animationId, (animation) =>
        mapTrack(animation, op.property, (existing) => {
          const track = requireTrack(existing, animation.id, op.property);
          const same = track.keyframes.find(
            (key) => Math.abs(key.timeSec - op.key.t) < 0.5 / context.fps,
          );
          const before =
            track.keyframes.findLast((key) => key.timeSec < op.key.t) ?? track.keyframes[0];
          const source = same ?? before;
          const timing = op.key.ease ? easeTiming(op.key.ease) : source ? timingOf(source) : {};
          const key = keyFromInput(op.property, op.key, same?.id ?? nextKeyId(track), {
            interpolation: 'linear',
            ...timing,
          });
          return {
            ...track,
            keyframes: [...track.keyframes.filter((other) => other !== same), key].toSorted(
              (left, right) => left.timeSec - right.timeSec,
            ),
          };
        }),
      );
    case 'remove_keyframes':
      return mapAnimation(animations, op.animationId, (animation) =>
        mapTrack(animation, op.property, (existing) => {
          const track = requireTrack(existing, animation.id, op.property);
          const known = new Set(track.keyframes.map((key) => key.id));
          const unknown = op.keyIds.filter((id) => !known.has(id));
          if (unknown.length > 0)
            throw new MotionTimelineError(`no ${op.property} keys ${unknown.join(', ')}`);
          const keyframes = track.keyframes.filter((key) => !op.keyIds.includes(key.id));
          if (keyframes.length < 2)
            throw new MotionTimelineError(
              'a track keeps at least two keys; use set_keyframes or remove_animation',
            );
          return { ...track, keyframes };
        }),
      );
  }
}

/**
 * One op on the motion data. Refuses unknown ids and any changed animation that would
 * still be moving after the composition ends. `split_text` edits HTML: see
 * `applyMotionOpsToHtml`.
 */
export function applyMotionOp(
  doc: MotionDoc,
  input: MotionOpInput,
  context: MotionOpContext,
): MotionDoc {
  const op = parseMotionOp(input);
  if (op.type === 'split_text')
    throw new MotionTimelineError(
      'split_text edits the composition HTML: use applyMotionOpsToHtml',
    );
  const next = parseMotionDoc({
    version: 1,
    animations: applyToAnimations(doc.animations, op, context),
  });
  for (const id of diffMotion(doc, next)) {
    const animation = next.animations.find((candidate) => candidate.id === id);
    const endSec = animation ? motionAnimationWindow(animation).endSec : 0;
    if (endSec > context.durationSec + TIME_EPSILON_SEC)
      throw new MotionTimelineError(
        `animation ${id} would end at ${css(endSec)}s, after the composition ends at ${css(context.durationSec)}s`,
      );
  }
  return next;
}

// ── Compiling to CSS ──────────────────────────────────────────────────────────────────

/** Appended only: an animation's CSS name carries its channel's index. */
const CSS_CHANNELS = ['translate', 'scale', 'rotate', 'opacity', 'filter', 'draw'] as const;
type CssChannel = (typeof CSS_CHANNELS)[number];

/** One CSS keyframe: its time, the key whose outgoing ease it carries, its component values. */
type ChannelKey = { timeSec: number; timing: MotionKeyframe; values: number[] };

const numberOf = (key: MotionKeyframe | undefined, fallback: number) =>
  typeof key?.value === 'number' ? key.value : fallback;

function channelKeys(animation: MotionAnimation): { channel: CssChannel; keys: ChannelKey[] }[] {
  const track = (property: MotionProperty) =>
    animation.tracks.find((candidate) => candidate.property === property)?.keyframes;
  const single = (keys: MotionKeyframe[] | undefined) =>
    keys?.map((key) => ({ timeSec: key.timeSec, timing: key, values: [numberOf(key, 0)] }));
  const position = track('transform.position');
  const scaleX = track('transform.scaleX');
  const scaleY = track('transform.scaleY');
  const scaleTiming = scaleX ?? scaleY;
  const effect = track('effect.parameter');
  const drawn = effect?.[0]?.parameterName === 'draw';
  const channels: Record<CssChannel, ChannelKey[] | undefined> = {
    translate: position?.map((key) => ({
      timeSec: key.timeSec,
      timing: key,
      values: isPoint(key.value) ? [key.value.x, key.value.y] : [0, 0],
    })),
    scale: scaleTiming?.map((key, index) => ({
      timeSec: key.timeSec,
      timing: key,
      values: [numberOf(scaleX?.[index], 1), numberOf(scaleY?.[index], 1)],
    })),
    rotate: single(track('transform.rotationDeg')),
    opacity: single(track('transform.opacity')),
    filter: drawn ? undefined : single(effect),
    draw: drawn ? single(effect) : undefined,
  };
  return CSS_CHANNELS.flatMap((channel) => {
    const keys = channels[channel];
    return keys ? [{ channel, keys }] : [];
  });
}

/** The progress curve CSS cannot express natively, drawn as `linear()` points. */
function segmentCurve(key: MotionKeyframe): ((progress: number) => number) | null {
  if (key.ease) return MOTIONMAXXING_EASES[key.ease];
  if (key.interpolation === 'spring') {
    const bounce = key.spring?.bounce ?? DEFAULT_SPRING_BOUNCE;
    return (progress) => springProgress(progress, bounce);
  }
  return null;
}

const curvePoints = (curve: (progress: number) => number) =>
  Array.from({ length: CURVE_SAMPLES }, (_, index) => round6(curve(index / (CURVE_SAMPLES - 1))));

function timingFunction(key: MotionKeyframe): string {
  const curve = segmentCurve(key);
  if (curve) return `linear(${curvePoints(curve).map(css).join(',')})`;
  if (key.interpolation === 'hold') return 'step-start';
  if (key.interpolation === 'bezier' && key.easing) {
    const { x1, y1, x2, y2 } = key.easing;
    return `cubic-bezier(${[x1, y1, x2, y2].map(css).join(',')})`;
  }
  return 'linear';
}

const cssValue = (channel: CssChannel, [a = 0, b = 0]: number[]): string => {
  switch (channel) {
    case 'translate':
      return `translate:${css(a)}px ${css(b)}px`;
    case 'scale':
      return `scale:${css(a)} ${css(b)}`;
    case 'rotate':
      return `rotate:${css(a)}deg`;
    case 'opacity':
      return `opacity:${css(a)}`;
    case 'filter':
      return `filter:blur(${css(a)}px)`;
    // With pathLength="1" a dash of 1 then a gap of 1, offset 1 − v, shows the path's first v.
    case 'draw':
      return `stroke-dasharray:1 1;stroke-dashoffset:${css(round6(1 - a))}`;
  }
};

/** One `animation` list entry: a channel of one animation on one target. */
type MotionEntry = {
  name: string;
  channel: CssChannel;
  keys: ChannelKey[];
  /** When the first key plays, in composition seconds. */
  delaySec: number;
  durationSec: number;
};

/** Every target's entries in CSS list order. Compile and sample both read this. */
function motionEntries(doc: MotionDoc): Map<string, MotionEntry[]> {
  const byTarget = new Map<string, MotionEntry[]>();
  for (const animation of doc.animations) {
    const offsets = animation.stagger
      ? staggerOffsets(animation.targets.length, animation.stagger.eachSec, animation.stagger.from)
      : animation.targets.map(() => 0);
    const channels = channelKeys(animation);
    animation.targets.forEach((target, index) => {
      const originSec = round6(animation.startSec + (offsets[index] ?? 0));
      const entries = byTarget.get(target) ?? [];
      for (const { channel, keys } of channels) {
        const first = keys[0]?.timeSec ?? 0;
        entries.push({
          name: `hfm-${animation.id}-${CSS_CHANNELS.indexOf(channel)}`,
          channel,
          keys,
          delaySec: round6(originSec + first),
          durationSec: round6((keys.at(-1)?.timeSec ?? first) - first),
        });
      }
      byTarget.set(target, entries);
    });
  }
  for (const entries of byTarget.values())
    entries.sort((left, right) => left.delaySec - right.delaySec);
  return byTarget;
}

/**
 * The motion as CSS: one `@keyframes hfm-<animation>-<channel>` per animation and CSS
 * property, each key carrying its own timing function, and one `!important` animation list
 * per target sorted by start. Individual `translate`/`scale`/`rotate`, never `transform`, so
 * an element's own transform is left alone.
 */
export function compileMotionCss(doc: MotionDoc): string {
  const rules: string[] = [];
  for (const animation of doc.animations) {
    for (const { channel, keys } of channelKeys(animation)) {
      const first = keys[0]?.timeSec ?? 0;
      const span = (keys.at(-1)?.timeSec ?? first) - first;
      const frames = keys.map((key, index) => {
        const offset = css(((key.timeSec - first) / span) * 100);
        const easing =
          index < keys.length - 1 ? `;animation-timing-function:${timingFunction(key.timing)}` : '';
        return `${offset}%{${cssValue(channel, key.values)}${easing}}`;
      });
      rules.push(
        `@keyframes hfm-${animation.id}-${CSS_CHANNELS.indexOf(channel)}{${frames.join('')}}`,
      );
    }
  }
  for (const [target, entries] of motionEntries(doc)) {
    const filled = new Set<CssChannel>();
    const list = entries.map((entry) => {
      const fill = filled.has(entry.channel) ? 'forwards' : 'both';
      filled.add(entry.channel);
      return `${entry.name} ${css(entry.durationSec)}s linear ${css(entry.delaySec)}s 1 normal ${fill}`;
    });
    rules.push(`[data-hf-id="${target}"]{animation:${list.join(',')} !important}`);
  }
  return rules.join('\n');
}

// ── Sampling (what the compiled CSS shows at a time) ──────────────────────────────────

export type MotionSample = {
  translateX: number;
  translateY: number;
  scale: [number, number];
  rotateDeg: number;
  opacity: number;
  blurPx: number;
};

/**
 * One component of a channel as numeric keys. Springs and MotionMaxxing eases become the
 * same polyline the CSS `linear()` draws, so the sample is what renders, not an ideal curve.
 */
function componentTrack(keys: readonly ChannelKey[], component: number): NumericKeyframe[] {
  return keys.flatMap((key, index): NumericKeyframe[] => {
    const value = key.values[component] ?? 0;
    const next = keys[index + 1];
    const curve = segmentCurve(key.timing);
    if (!next || !curve)
      return [
        {
          timeSec: key.timeSec,
          value,
          interpolation: key.timing.interpolation,
          ...(key.timing.easing ? { easing: key.timing.easing } : {}),
        },
      ];
    const span = next.timeSec - key.timeSec;
    const delta = (next.values[component] ?? 0) - value;
    return curvePoints(curve)
      .slice(0, -1)
      .map((progress, step) => ({
        timeSec: key.timeSec + (span * step) / (CURVE_SAMPLES - 1),
        value: value + delta * progress,
        interpolation: 'linear',
      }));
  });
}

/**
 * The motion values on `hfId` at `tSec`. Per CSS property the latest-started entry wins;
 * before any has started the first one's first key shows (CSS fill `both`).
 */
export function sampleMotion(doc: MotionDoc, hfId: string, tSec: number): MotionSample {
  const sample: MotionSample = {
    translateX: 0,
    translateY: 0,
    scale: [1, 1],
    rotateDeg: 0,
    opacity: 1,
    blurPx: 0,
  };
  const entries = motionEntries(doc).get(hfId) ?? [];
  for (const channel of CSS_CHANNELS) {
    const own = entries.filter((entry) => entry.channel === channel);
    const entry =
      own.findLast((candidate) => candidate.delaySec <= tSec + TIME_EPSILON_SEC) ?? own[0];
    if (!entry) continue;
    // Measured from the entry's own delay, so a frame exactly on it is active as in CSS.
    const sinceDelay = tSec - entry.delaySec;
    const localSec =
      (entry.keys[0]?.timeSec ?? 0) + (Math.abs(sinceDelay) < TIME_EPSILON_SEC ? 0 : sinceDelay);
    const values = [0, 1].map((component) => {
      const track = componentTrack(entry.keys, component);
      return sampleNumericTrack(track, localSec, track[0]?.value ?? 0);
    });
    const [a = 0, b = 0] = values;
    if (channel === 'translate') [sample.translateX, sample.translateY] = [a, b];
    else if (channel === 'scale') sample.scale = [a, b];
    else if (channel === 'rotate') sample.rotateDeg = a;
    else if (channel === 'opacity') sample.opacity = Math.min(1, Math.max(0, a));
    else if (channel === 'filter') sample.blurPx = Math.max(0, a);
  }
  return sample;
}

// ── The composition HTML ──────────────────────────────────────────────────────────────

const MOTION_SCRIPT = /<script\b[^>]*\sdata-hf-motion(?![\w-])[^>]*>([\s\S]*?)<\/script\s*>\n?/gi;
const MOTION_STYLE = /<style\b[^>]*\sdata-hf-motion-css(?![\w-])[^>]*>[\s\S]*?<\/style\s*>\n?/gi;

/** The composition without its motion blocks. */
export function stripMotionBlocks(html: string): string {
  return html.replace(MOTION_SCRIPT, '').replace(MOTION_STYLE, '');
}

/** The composition's motion data; a composition without a block has none. */
export function readMotionFromHtml(html: string): MotionDoc {
  const blocks = [...html.matchAll(MOTION_SCRIPT)];
  if (blocks.length > 1)
    throw new MotionTimelineError('the composition has more than one motion block');
  const json = blocks[0]?.[1];
  if (json === undefined) return EMPTY_MOTION_DOC;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new MotionTimelineError('the composition motion block is not valid JSON');
  }
  return parseMotionDoc(value);
}

/**
 * The composition with `doc` as its motion: the data block and its compiled CSS, replacing
 * any previous pair, before `</body>` (or at the end). Idempotent.
 */
export function writeMotionToHtml(html: string, doc: MotionDoc): string {
  const motion = parseMotionDoc(doc);
  const base = stripMotionBlocks(html);
  if (motion.animations.length === 0) return base;
  const json = JSON.stringify(motion).replace(/</g, '\\u003c');
  if (GSAP_SNIFF.test(json))
    throw new MotionTimelineError(
      'motion data may not contain gsap, __timelines or ScrollTrigger: the HyperFrames SDK would read it as a GSAP script',
    );
  // `=""` is how the HyperFrames SDK serializes these attributes, so a write over a stored
  // (SDK-normalized) composition gives back the same bytes.
  const block =
    `<script type="application/json" data-hf-motion="">${json}</script>\n` +
    `<style data-hf-motion-css="">${compileMotionCss(motion)}</style>\n`;
  const body = base.toLowerCase().lastIndexOf('</body');
  return body < 0 ? `${base}${block}` : `${base.slice(0, body)}${block}${base.slice(body)}`;
}

/**
 * Wrap each word of the text-only element `hfId` in
 * `<span data-hf-id="<hfId>-w<n>" style="display:inline-block">`, keeping the spaces. `by: char`
 * wraps each character in `<hfId>-c<n>` instead, inside a nowrap span per word so a line still
 * breaks only between words; an entity (`&amp;`) is one character.
 */
export function splitTextInHtml(html: string, hfId: string, by: 'word' | 'char' = 'word'): string {
  const id = hfIdSchema.parse(hfId);
  const opening = new RegExp(
    `<([A-Za-z][\\w-]*)\\b[^>]*?\\sdata-hf-id=(["'])${id.replace(/[.]/g, '\\.')}\\2[^>]*>`,
    'g',
  );
  const matches = [...html.matchAll(opening)];
  const match = matches[0];
  if (!match || matches.length > 1)
    throw new MotionTimelineError(
      match ? `${id} names more than one element` : `no element with data-hf-id ${id}`,
    );
  const start = match.index + match[0].length;
  const closing = `</${(match[1] ?? '').toLowerCase()}`;
  const end = html.indexOf('<', start);
  if (end < 0 || html.slice(end, end + closing.length).toLowerCase() !== closing)
    throw new MotionTimelineError(`${id} is not a text-only element: only its words can be split`);
  if (html.includes(`data-hf-id="${id}-w1"`) || html.includes(`data-hf-id="${id}-c1"`))
    throw new MotionTimelineError(`${id} is already split`);
  let words = 0;
  let chars = 0;
  const wrapChars = (word: string) =>
    `<span style="display:inline-block;white-space:nowrap">${(word.match(/&[#\w]+;|[\s\S]/gu) ?? [])
      .map(
        (char) =>
          `<span data-hf-id="${id}-c${++chars}" style="display:inline-block">${char}</span>`,
      )
      .join('')}</span>`;
  const split = html
    .slice(start, end)
    .split(/(\s+)/)
    .map((part) => {
      if (part === '' || /^\s+$/.test(part)) return part;
      words += 1;
      return by === 'char'
        ? wrapChars(part)
        : `<span data-hf-id="${id}-w${words}" style="display:inline-block">${part}</span>`;
    })
    .join('');
  if (words === 0) throw new MotionTimelineError(`${id} has no words to split`);
  return `${html.slice(0, start)}${split}${html.slice(end)}`;
}

/** Ops in order against a composition: `split_text` on the HTML, the rest on its motion. */
export function applyMotionOpsToHtml(
  html: string,
  ops: readonly MotionOpInput[],
  context: MotionOpContext,
): { html: string; doc: MotionDoc } {
  let doc = readMotionFromHtml(html);
  let body = stripMotionBlocks(html);
  for (const input of ops) {
    const op = parseMotionOp(input);
    if (op.type === 'split_text') body = splitTextInHtml(body, op.hfId, op.by);
    else doc = applyMotionOp(doc, op, context);
  }
  return { html: writeMotionToHtml(body, doc), doc };
}

/**
 * Whether an element (by its attributes) may carry motion: it needs a data-hf-id and must
 * not be a clip, the root, or carry data-start — those belong to the clip visibility timing
 * the runtime seeks at `t − data-start`.
 */
export function isValidMotionTarget(
  attributes: Readonly<Record<string, string | null | undefined>>,
): boolean {
  const present = (name: string) => attributes[name] !== undefined && attributes[name] !== null;
  return (
    present('data-hf-id') &&
    !present('data-start') &&
    !present('data-composition-id') &&
    !(attributes.class ?? '').split(/\s+/).includes('clip')
  );
}

// ── Wire schemas Wave 1 wires into the shared contracts ───────────────────────────────

/** The timeline selection a motion-only HyperFrames agent turn may change. */
export const motionTargetSchema = z
  .object({
    revisionId: z.string().min(1),
    animationIds: z.array(motionIdSchema).max(MAX_ANIMATIONS).default([]),
    hfIds: z.array(hfIdSchema).max(500).default([]),
  })
  .strict()
  .refine(
    (target) => target.animationIds.length + target.hfIds.length > 0,
    'select at least one animation or element',
  );
export type MotionTarget = z.infer<typeof motionTargetSchema>;

/** `POST /api/ai-studio/hyperframes-agent/revisions/:revisionId/motion`. */
export const hyperframesMotionCommitRequestSchema = z
  .object({
    ops: z.array(motionOpSchema).min(1).max(50),
    expectedFingerprint: z.string().length(64),
  })
  .strict();
export type HyperframesMotionCommitRequest = z.infer<typeof hyperframesMotionCommitRequestSchema>;
export const hyperframesMotionCommitResponseSchema = z
  .object({
    revision: z.object({ id: z.string().min(1), fingerprint: z.string().length(64) }).strict(),
  })
  .strict();
export type HyperframesMotionCommitResponse = z.infer<typeof hyperframesMotionCommitResponseSchema>;

// Video-editor ops. Times are timeline seconds; positions are normalized canvas fractions.
// The video-editor contract adds `projectId` (`.extend(projectRef)`) and the commit
// (`committed(<output>.shape)`). Agent tools see these inputs, so they hold no union (a
// provider cannot fill one) and no object-level refinement (the tool builder `.omit`s
// projectId): a key's value is `v` or `x`/`y`, its ease a name or `bezier` points, and the
// rules between them live in `editorKeyframeFromKeyInput` and `validateRetimeMotionInput`.

const clipIdSchema = z.string().min(1).max(200);
const uniqueClipIds = (ids: readonly string[]) => new Set(ids).size === ids.length;
const bezierPointsSchema = z
  .array(z.number().finite())
  .length(4)
  .describe('A custom ease as [x1, y1, x2, y2] (x1, x2 in 0..1), instead of ease');
const editorKeyInputSchema = z
  .object({
    t: secondsSchema.describe('Timeline seconds'),
    v: z.number().finite().optional().describe('The value, for every property but position'),
    x: z
      .number()
      .finite()
      .optional()
      .describe('transform.position only: normalized x, 0.5 = centre'),
    y: z
      .number()
      .finite()
      .optional()
      .describe('transform.position only: normalized y, 0.5 = centre'),
    ease: editorEaseNameSchema
      .optional()
      .describe('How this key eases into the next; default linear'),
    bezier: bezierPointsSchema.optional(),
  })
  .strict();
export type EditorKeyInput = z.infer<typeof editorKeyInputSchema>;

/** A name or `bezier` points as one ease; refuses both at once and points out of range. */
function editorEaseFromInput(input: {
  ease?: EditorEaseName;
  bezier?: number[];
}): EditorEase | undefined {
  if (input.bezier === undefined) return input.ease;
  if (input.ease !== undefined) throw new MotionTimelineError('give ease or bezier, not both');
  const parsed = editorEaseSchema.safeParse({ bezier: input.bezier });
  if (!parsed.success)
    throw new MotionTimelineError(
      'bezier is [x1, y1, x2, y2] with x1, x2 in 0..1, y1, y2 in -4..4',
    );
  return parsed.data;
}

export const getMotionInputSchema = z
  .object({ clipIds: z.array(clipIdSchema).min(1).max(200).optional() })
  .strict();
export const getMotionOutputSchema = z
  .object({
    clips: z.array(
      z
        .object({
          clipId: z.string(),
          startSec: secondsSchema,
          durationSec: secondsSchema,
          /** `timeSec` on the timeline, not the clip clock. */
          keyframes: z.array(editorKeyframeSchema),
        })
        .strict(),
    ),
  })
  .strict();

export const keyframeClipInputSchema = z
  .object({
    clipId: clipIdSchema,
    property: editorKeyframeSchema.shape.property,
    parameterName: z.string().min(1).max(200).optional(),
    effectInstanceId: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('effect.parameter only: which of the clip effects; default the first with it'),
    keys: z.array(editorKeyInputSchema).min(1).max(500),
    /** true clears the property's keys first; false replaces only keys at the same times. */
    replace: z.boolean().default(false),
  })
  .strict();
export type KeyframeClipInput = z.infer<typeof keyframeClipInputSchema>;
export const keyframeClipOutputSchema = z
  .object({ keyframes: z.number().int().nonnegative() })
  .strict();

/**
 * One keyframe_clip key as an `EditorKeyframe` (timeline seconds). The handler calls it for
 * every key: it refuses `v` on position or `x`/`y` elsewhere, ease with bezier, and anything
 * `editorKeyframeSchema` refuses (effect.parameter without parameterName).
 */
export function editorKeyframeFromKeyInput(
  input: Pick<KeyframeClipInput, 'property' | 'parameterName' | 'effectInstanceId'>,
  key: EditorKeyInput,
  id: string,
): EditorKeyframe {
  const position = input.property === 'transform.position';
  const shapeOk = position
    ? key.x !== undefined && key.y !== undefined && key.v === undefined
    : key.v !== undefined && key.x === undefined && key.y === undefined;
  if (!shapeOk)
    throw new MotionTimelineError(
      position
        ? 'transform.position keys take x and y, not v'
        : `${input.property} keys take v, not x or y`,
    );
  const parsed = editorKeyframeSchema.safeParse({
    id,
    property: input.property,
    ...(input.parameterName !== undefined ? { parameterName: input.parameterName } : {}),
    ...(input.effectInstanceId !== undefined ? { effectInstanceId: input.effectInstanceId } : {}),
    timeSec: key.t,
    value: position ? { x: key.x, y: key.y } : key.v,
    ...easeTiming(editorEaseFromInput(key) ?? 'linear'),
  });
  if (!parsed.success) throw refusal(parsed.error);
  return parsed.data;
}

export const staggerClipsInputSchema = z
  .object({
    /** In stagger order: the on-screen order of the selection. */
    clipIds: z.array(clipIdSchema).min(2).max(50).refine(uniqueClipIds, 'Select different clips'),
    eachSec: z.number().finite().min(0).max(10),
    from: z.enum(['start', 'end', 'center']).default('start'),
  })
  .strict();
export const staggerClipsOutputSchema = z
  .object({ clips: z.array(z.object({ clipId: z.string(), startSec: secondsSchema }).strict()) })
  .strict();

export const retimeMotionInputSchema = z
  .object({
    clipIds: z.array(clipIdSchema).min(1).max(50).refine(uniqueClipIds, 'Select different clips'),
    /** Omit to retime every keyframed property of each clip. */
    property: editorKeyframeSchema.shape.property.optional(),
    shiftSec: z.number().finite().min(-3_600).max(3_600).optional(),
    durationSec: z.number().finite().positive().max(3_600).optional(),
    ease: editorEaseNameSchema.optional(),
    bezier: bezierPointsSchema.optional(),
  })
  .strict();
export type RetimeMotionInput = z.infer<typeof retimeMotionInputSchema>;
export const retimeMotionOutputSchema = z
  .object({ clipIds: z.array(z.string()), keyframes: z.number().int().nonnegative() })
  .strict();

/** retime_motion's rules the schema cannot hold: something to change, and at most one ease. */
export function validateRetimeMotionInput(
  input: Pick<RetimeMotionInput, 'shiftSec' | 'durationSec' | 'ease' | 'bezier'>,
): { shiftSec?: number; durationSec?: number; ease?: EditorEase } {
  const ease = editorEaseFromInput(input);
  if (input.shiftSec === undefined && input.durationSec === undefined && ease === undefined)
    throw new MotionTimelineError('retime_motion needs shiftSec, durationSec, ease or bezier');
  return { shiftSec: input.shiftSec, durationSec: input.durationSec, ease };
}

// HyperFrames films as editor clips. A clip carries `hyperframes {revisionId, fingerprint}`; its
// source stays the pinned Library version of the rendered film (an overlay clip's film is
// transparent VP9 WebM, a video clip's an opaque MP4).

export const addHyperframesClipInputSchema = z
  .object({
    revisionId: z.string().min(1),
    atSec: secondsSchema.default(0),
    trackId: z.string().optional(),
    newTrack: z.boolean().default(false),
  })
  .strict();
export type AddHyperframesClipInput = z.infer<typeof addHyperframesClipInputSchema>;
export const addHyperframesClipOutputSchema = z
  .object({
    clipId: z.string(),
    trackId: z.string(),
    assetId: z.string(),
    versionId: z.string(),
  })
  .strict();

// A HyperFrames edit the agent authors over a talking head: its graphics, captions and card
// states keyed to the words the speaker says, then rendered and placed like add_hyperframes_clip.
export const HYPERFRAMES_EDIT_MODES = ['overlay', 'composition'] as const;
export const addHyperframesEditInputSchema = z
  .object({
    brief: z
      .string()
      .trim()
      .min(1)
      .max(4_000)
      .describe(
        'What the edit shows on which spoken words: captions, lists, pills, charts, card switches, punch-ins. Name the words; the agent times every graphic to them from the transcript.',
      ),
    mode: z
      .enum(HYPERFRAMES_EDIT_MODES)
      .default('overlay')
      .describe(
        'overlay: a transparent film of graphics and captions over the footage, on its own track. composition: the whole edit as one film with the footage inside it (split screens, cards, a tilted raw copy), laid over the main clip, which keeps the sound.',
      ),
    atSec: secondsSchema
      .optional()
      .describe('Timeline second the edit starts, inside one main-track clip; default its start'),
    durationSec: z
      .number()
      .min(5)
      .max(60)
      .optional()
      .describe('How long it runs; default to the end of that clip, at most 60 s'),
    energy: z.enum(['calm', 'balanced', 'high-energy']).default('high-energy'),
    trackId: z.string().optional(),
    newTrack: z.boolean().default(false),
  })
  .strict();
export type AddHyperframesEditInput = z.infer<typeof addHyperframesEditInputSchema>;
export const addHyperframesEditOutputSchema = addHyperframesClipOutputSchema
  .extend({
    revisionId: z.string(),
    /** Spoken words the edit was timed to. */
    words: z.number().int().nonnegative(),
  })
  .strict();

// Motion graphics the editor composes in code — no model writes them — then files as a HyperFrames
// revision and places like add_hyperframes_clip. The input is flat, not a union: the agent's
// provider cannot fill a declared union, so each recipe's fields are optional here and
// `motionGraphicParamsSchema` holds a recipe to its own.
export const MOTION_GRAPHIC_RECIPES = [
  'glass_graph',
  'particle_push',
  'dot_matrix',
  'word_lock',
  'screen_push',
  'over_shoulder',
] as const;
export type MotionGraphicRecipe = (typeof MOTION_GRAPHIC_RECIPES)[number];

const graphicText = (max: number) => z.string().trim().min(1).max(max);
const shoulderCardSchema = z
  .object({
    label: z.string().trim().max(24).default(''),
    big: graphicText(24),
    small: z.string().trim().max(32).default(''),
  })
  .strict();
const unitFraction = z.number().min(0).max(1);

export const addMotionGraphicInputSchema = z
  .object({
    recipe: z
      .enum(MOTION_GRAPHIC_RECIPES)
      .describe(
        'glass_graph: a liquid glass card that refracts the footage under it while a line graph climbs to a figure (label, value, unit, points). particle_push: particles pour into a box that opens into up to 3 numbered steps (steps). dot_matrix: words in LED dots, one after another (words). word_lock: newspaper pages cut fast with one highlighted word locked in the centre (keyword, lines). screen_push: cuts to an extreme close-up of a monitor that shows the exact words, hard-cutting to each word as the speaker says it (text; it times itself from the transcript). over_shoulder: the camera pushes in, looks to a card over one shoulder, whips to a card over the other, then pulls back, 4.6 s (cards, faceX, faceWidth, eyeY, lightSpeed).',
      ),
    atSec: secondsSchema
      .default(0)
      .describe(
        'Where it starts; screen_push starts on the first of its words said at or after it',
      ),
    durationSec: z
      .number()
      .min(1)
      .max(15)
      .default(4)
      .describe('How long it shows; screen_push and over_shoulder set their own'),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional()
      .describe(
        'The accent as #RRGGBB: the glass_graph line, the screen_push letters, the over_shoulder outline; omit for the brand accent',
      ),
    label: graphicText(24).optional().describe('glass_graph: the metric, 1–3 words ("Retention")'),
    value: z.number().finite().optional().describe('glass_graph: the figure the graph climbs to'),
    unit: z.string().trim().max(4).optional().describe('glass_graph: "%", "$", "k", "x" or empty'),
    points: z
      .array(z.number().finite())
      .min(2)
      .max(12)
      .optional()
      .describe('glass_graph: the line, 2–12 values in order; omit for a steady climb'),
    steps: z
      .array(graphicText(18))
      .min(1)
      .max(3)
      .optional()
      .describe('particle_push: 1–3 step labels of one or two words'),
    words: z
      .array(graphicText(12))
      .min(1)
      .max(6)
      .optional()
      .describe('dot_matrix: 1–6 words, shown one after another'),
    keyword: graphicText(20).optional().describe('word_lock: the one word locked in the centre'),
    lines: z
      .array(graphicText(160))
      .min(3)
      .max(10)
      .optional()
      .describe('word_lock: 3–10 sentences, each containing the keyword'),
    text: graphicText(120)
      .optional()
      .describe('screen_push: 1–15 words the speaker says, shown exactly as written'),
    cards: z
      .array(shoulderCardSchema)
      .length(2)
      .optional()
      .describe(
        'over_shoulder: the start card (over the left shoulder) then the end card, each { label, big, small } — "BEFORE" | "$3,200" | "per month"',
      ),
    lightSpeed: z
      .boolean()
      .optional()
      .describe("over_shoulder: the start card's big text flies into the end card at light speed"),
    faceX: unitFraction
      .optional()
      .describe('over_shoulder: the middle of the face across the frame, 0–1, read from get_frame'),
    faceWidth: unitFraction
      .optional()
      .describe("over_shoulder: the head's width ear to ear as a share of the frame width"),
    eyeY: unitFraction.optional().describe("over_shoulder: the eyes' height in the frame, 0 = top"),
    trackId: z.string().optional(),
    newTrack: z.boolean().default(false),
  })
  .strict();
export type AddMotionGraphicInput = z.infer<typeof addMotionGraphicInputSchema>;

export const motionGraphicParamsSchema = z.discriminatedUnion('recipe', [
  z.object({
    recipe: z.literal('glass_graph'),
    label: graphicText(24),
    value: z.number().finite(),
    unit: z.string().trim().max(4).default(''),
    points: z.array(z.number().finite()).min(2).max(12).optional(),
  }),
  z.object({ recipe: z.literal('particle_push'), steps: z.array(graphicText(18)).min(1).max(3) }),
  z.object({ recipe: z.literal('dot_matrix'), words: z.array(graphicText(12)).min(1).max(6) }),
  z.object({
    recipe: z.literal('word_lock'),
    keyword: graphicText(20),
    lines: z.array(graphicText(160)).min(3).max(10),
  }),
  z.object({
    recipe: z.literal('screen_push'),
    text: graphicText(120).refine((text) => text.split(/\s+/).length <= 15, 'At most 15 words.'),
  }),
  z.object({
    recipe: z.literal('over_shoulder'),
    cards: z.array(shoulderCardSchema).length(2),
    lightSpeed: z.boolean().default(false),
    faceX: unitFraction.default(0.5),
    faceWidth: unitFraction.default(0.32),
    eyeY: unitFraction.default(0.255),
  }),
]);
export type MotionGraphicParams = z.infer<typeof motionGraphicParamsSchema>;

export const getHyperframesClipMotionInputSchema = z.object({ clipId: clipIdSchema }).strict();
export const getHyperframesClipMotionOutputSchema = z
  .object({
    clipId: z.string(),
    revisionId: z.string(),
    fingerprint: z.string().length(64),
    /** Timeline seconds of the composition's t = 0; add it to a composition time. */
    compositionStartSec: z.number().finite(),
    durationSec: secondsSchema,
    animations: z.array(
      z
        .object({
          id: z.string(),
          label: z.string(),
          targets: z.array(z.string()),
          /** Composition seconds. */
          startSec: secondsSchema,
          endSec: secondsSchema,
          staggerEachSec: z.number().finite().optional(),
          properties: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict();
export type GetHyperframesClipMotionOutput = z.infer<typeof getHyperframesClipMotionOutputSchema>;

export const editHyperframesClipMotionInputSchema = z
  .object({
    clipId: clipIdSchema,
    opsJson: z
      .string()
      .min(2)
      .max(50_000)
      .describe(
        'A JSON array of 1 to 50 HyperFrames motion ops in composition seconds: add_animation, stagger, retime, ease, set_keyframes, upsert_keyframe, remove_keyframes, remove_animation, split_text',
      ),
  })
  .strict();
export const editHyperframesClipMotionOutputSchema = z
  .object({
    /** Every clip of the project that showed the edited film, now on the new render. */
    clipIds: z.array(z.string()),
    revisionId: z.string(),
    versionId: z.string(),
  })
  .strict();
