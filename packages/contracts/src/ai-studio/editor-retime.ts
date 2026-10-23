// Retiming a clip: speed ramps, freeze frames and reverse, as data.
//
// A clip's source clock is one of three things (see editor-clip-edits.ts): a constant
// `playbackRate`, `reverse`, or a `timeRemap` curve. These builders turn an intent ("20% around
// the hit", "hold this frame for a second") into that curve, once, so the workspace, the agent
// and MCP all write the same one. Every time here is CLIP-LOCAL seconds on the clock the clip
// has right now; the op layer converts from and to timeline seconds.

import { z } from 'zod';
import { type EditorClipTiming, editorClipSourceAt, editorClipWindow } from './editor-clip-edits';
import type { EditorKeyframe, EditorTimeRemapPoint, EditorTransform } from './editor-project-v2';
import { EASE_OUT } from './motion-presets';

const timelineSecSchema = z.number().finite().nonnegative().max(86_400);

// ── Op schemas (the entries in VIDEO_EDITOR_OPS pull these in) ─────────────────────────────

export const speedRampKeySchema = z
  .object({
    /** Timeline seconds, on the timeline as it is now (before the ramp). */
    atSec: timelineSecSchema,
    /** Speed multiplier there: 1 = as the clip plays now, 0.2 = 20% slow motion, 3 = triple. */
    rate: z.number().finite().min(0.05).max(20),
  })
  .strict();
export type SpeedRampKey = z.infer<typeof speedRampKeySchema>;

export const speedRampInputSchema = z
  .object({
    clipId: z.string().min(1),
    keys: z.array(speedRampKeySchema).min(1).max(24),
    ease: z.enum(['smooth', 'linear']).default('smooth'),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export const speedRampOutputSchema = z
  .object({
    clipId: z.string(),
    /** The clip's new length: slow motion makes it longer, a fast pass shorter. */
    durationSec: timelineSecSchema,
    points: z.number().int().nonnegative(),
  })
  .strict();

export const freezeFrameInputSchema = z
  .object({
    clipId: z.string().min(1),
    /** Timeline seconds of the frame to hold; it must lie inside the clip. */
    atSec: timelineSecSchema,
    holdSec: z.number().finite().min(0.1).max(30),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export const freezeFrameOutputSchema = z
  .object({ clipId: z.string(), durationSec: timelineSecSchema, heldSourceSec: timelineSecSchema })
  .strict();

export const reverseClipInputSchema = z
  .object({
    clipId: z.string().min(1),
    /** Both or neither: a timeline-seconds range inside the clip to reverse on its own. */
    fromSec: timelineSecSchema.optional(),
    toSec: timelineSecSchema.optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();

/** Why a reverse range is not one, or undefined (a plain object schema keeps `.shape` for the op door). */
export const reverseRangeIssue = (input: {
  fromSec?: number;
  toSec?: number;
}): string | undefined =>
  (input.fromSec === undefined) !== (input.toSec === undefined)
    ? 'Give both fromSec and toSec, or neither to reverse the whole clip.'
    : input.fromSec !== undefined && input.toSec! <= input.fromSec
      ? 'toSec must be after fromSec.'
      : undefined;
export const reverseClipOutputSchema = z
  .object({
    /** The clip that now plays backwards (the middle piece when a range was cut out). */
    clipId: z.string(),
    /** Every piece the clip is now, in timeline order. */
    clipIds: z.array(z.string()),
    reversed: z.boolean(),
  })
  .strict();

// ── Curve builders ────────────────────────────────────────────────────────────────────────

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;
const MAX_POINTS = 480;
/** Samples per second laid across a stretch whose speed is changing. */
const RAMP_SAMPLES_PER_SEC = 12;
const MIN_SAMPLES = 2;
const MAX_SAMPLES = 16;
/** Midpoint steps inside one sample when integrating time = distance / speed. */
const INTEGRATION_STEPS = 8;
const BEZIER_SAMPLES = 8;

type Point = EditorTimeRemapPoint;

export type Retimed = {
  /** The new curve; its last point sits at `durationSec`. */
  timeRemap: Point[];
  durationSec: number;
  /** Where a moment of the OLD clip lands on the new one (monotone). */
  mapLocal: (oldLocalSec: number) => number;
};

/** The clip's current clock as a curve: its own points, or the two ends of plain playback. */
export function editorClipTimeRemap(clip: EditorClipTiming): Point[] {
  if (clip.timeRemap?.length)
    return clip.timeRemap.map((point) => ({
      ...point,
      interpolation: point.interpolation ?? 'linear',
    }));
  return [
    { timeSec: 0, sourceSec: editorClipSourceAt(clip, 0), interpolation: 'linear' },
    {
      timeSec: clip.durationSec,
      sourceSec: editorClipSourceAt(clip, clip.durationSec),
      interpolation: 'linear',
    },
  ];
}

const hasHold = (clip: EditorClipTiming) =>
  clip.timeRemap?.some((point) => point.interpolation === 'hold');

/** Interpolates (old time -> new time) pairs piecewise linearly; flat outside them. */
const pieceMap = (pairs: readonly { old: number; next: number }[]) => (oldSec: number) => {
  const first = pairs[0];
  const last = pairs[pairs.length - 1];
  if (oldSec <= first.old) return first.next;
  if (oldSec >= last.old) return last.next;
  let low = 0;
  let high = pairs.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (pairs[mid].old <= oldSec) low = mid;
    else high = mid;
  }
  const a = pairs[low];
  const b = pairs[high];
  return a.next + ((b.next - a.next) * (oldSec - a.old)) / (b.old - a.old);
};

/**
 * Ramp a clip's speed. `keys` (clip-local seconds, strictly rising, each inside the clip) say
 * how fast it plays there; between keys the speed eases (smoothstep) or runs linearly, before
 * the first and after the last it holds. Speeds multiply what the clip does now, so a ramp
 * composes with an earlier one. The new clip length is the integral of 1 / speed.
 */
export function speedRampRemap(
  clip: EditorClipTiming,
  keys: readonly { t: number; rate: number }[],
  ease: 'smooth' | 'linear' = 'smooth',
): Retimed {
  if (hasHold(clip))
    throw new Error('A clip with a frozen hold cannot also be ramped; undo the freeze first.');
  const D = clip.durationSec;
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  for (const [index, key] of sorted.entries()) {
    if (key.t < -1e-9 || key.t > D + 1e-9)
      throw new Error('Every speed key must lie inside the clip.');
    if (index > 0 && key.t - sorted[index - 1].t < 1e-3)
      throw new Error('Speed keys must be at least a millisecond apart.');
  }
  const rateAt = (t: number): number => {
    if (t <= sorted[0].t) return sorted[0].rate;
    const last = sorted[sorted.length - 1];
    if (t >= last.t) return last.rate;
    let index = 0;
    while (sorted[index + 1].t <= t) index += 1;
    const a = sorted[index];
    const b = sorted[index + 1];
    const u = (t - a.t) / (b.t - a.t);
    const k = ease === 'smooth' ? u * u * (3 - 2 * u) : u;
    return a.rate + (b.rate - a.rate) * k;
  };
  const oldPoints = clip.timeRemap?.length ? editorClipTimeRemap(clip) : [];
  const knots = [
    ...new Set([0, D, ...sorted.map((key) => key.t), ...oldPoints.map((point) => point.timeSec)]),
  ].sort((a, b) => a - b);
  const nodes: number[] = [];
  for (let index = 0; index < knots.length - 1; index += 1) {
    const a = knots[index];
    const b = knots[index + 1];
    const changing = Math.abs(rateAt(a) - rateAt(b)) > 1e-9;
    const segment = oldPoints.findIndex(
      (point, i) => point.timeSec <= a + 1e-9 && (oldPoints[i + 1]?.timeSec ?? -1) > a + 1e-9,
    );
    const bendy = segment >= 0 && oldPoints[segment].interpolation === 'bezier';
    const steps = Math.max(
      bendy ? BEZIER_SAMPLES : 1,
      changing
        ? Math.min(MAX_SAMPLES, Math.max(MIN_SAMPLES, Math.ceil((b - a) * RAMP_SAMPLES_PER_SEC)))
        : 1,
    );
    for (let step = 0; step < steps; step += 1) nodes.push(a + ((b - a) * step) / steps);
  }
  nodes.push(D);
  if (nodes.length > MAX_POINTS)
    throw new Error('That ramp needs more points than a clip can hold; use fewer keys.');
  const times: number[] = [0];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const a = nodes[index];
    const b = nodes[index + 1];
    let span = 0;
    for (let step = 0; step < INTEGRATION_STEPS; step += 1) {
      const mid = a + ((b - a) * (step + 0.5)) / INTEGRATION_STEPS;
      span += (b - a) / INTEGRATION_STEPS / rateAt(mid);
    }
    times.push(times[index] + span);
  }
  const durationSec = round6(times[times.length - 1]);
  const timeRemap: Point[] = nodes.map((node, index) => ({
    timeSec: index === nodes.length - 1 ? durationSec : round6(times[index]),
    sourceSec: round6(editorClipSourceAt(clip, node)),
    interpolation: 'linear',
  }));
  const mapLocal = pieceMap(
    nodes.map((node, index) => ({ old: node, next: timeRemap[index].timeSec })),
  );
  return { timeRemap, durationSec, mapLocal };
}

/**
 * Hold the frame showing at clip-local `atSec` for `holdSec`; everything after it plays on
 * `holdSec` later. Exactly the frames before and after are unchanged.
 */
export function freezeRemap(
  clip: EditorClipTiming,
  atSec: number,
  holdSec: number,
): Retimed & { heldSourceSec: number } {
  if (hasHold(clip))
    throw new Error('A clip with a frozen hold cannot be frozen again; undo the freeze first.');
  const D = clip.durationSec;
  if (atSec < 0 || atSec > D) throw new Error('The frozen frame must lie inside the clip.');
  const base: EditorClipTiming = { ...clip, timeRemap: editorClipTimeRemap(clip) };
  const held = editorClipSourceAt(base, atSec);
  const before: Point[] =
    atSec > 1e-6
      ? editorClipTimeRemap(editorClipWindow(base, 0, atSec))
      : [{ timeSec: 0, sourceSec: held, interpolation: 'linear' }];
  const after: Point[] =
    atSec < D - 1e-6
      ? editorClipTimeRemap(editorClipWindow(base, atSec, D)).map((point) => ({
          ...point,
          timeSec: point.timeSec + atSec + holdSec,
        }))
      : [{ timeSec: atSec + holdSec, sourceSec: held, interpolation: 'linear' }];
  const durationSec = round6(D + holdSec);
  const timeRemap = [...before, ...after].map((point, index, all) => ({
    ...point,
    timeSec: index === all.length - 1 ? durationSec : round6(point.timeSec),
    sourceSec: round6(point.sourceSec),
  }));
  return {
    timeRemap,
    durationSec,
    heldSourceSec: round6(held),
    mapLocal: (oldSec) => (oldSec < atSec ? oldSec : oldSec + holdSec),
  };
}

/** A curve played backwards: same frames, mirrored in clip time. Hold segments cannot mirror. */
export function mirrorRemap(points: readonly Point[], durationSec: number): Point[] {
  if (points.some((point) => point.interpolation === 'hold'))
    throw new Error('A clip with a frozen hold cannot be reversed.');
  const n = points.length;
  return points.map((_, j) => {
    const point = points[n - 1 - j];
    return {
      timeSec: j === 0 ? 0 : j === n - 1 ? durationSec : round6(durationSec - point.timeSec),
      sourceSec: point.sourceSec,
      // Smoothstep and straight segments are symmetric, so the segment keeps its kind.
      interpolation: j < n - 1 ? (points[n - 2 - j].interpolation ?? 'linear') : 'linear',
    };
  });
}

// ── Punch-in that releases ────────────────────────────────────────────────────────────────

export const PUNCH_ATTACK_SEC = 0.12;
export const PUNCH_DEFAULTS = { amount: 1.15, holdSec: 0.3, releaseSec: 0.25 } as const;

/**
 * A punch-in that lets go: scale rises to `amount` x the clip's own scale over the attack,
 * holds, then settles back to the scale the clip rests at, so a talking head can punch on a
 * word and be back to normal for the next. Clip-local times, absolute values from `base`.
 */
export function punchReleaseKeyframes(input: {
  base: Pick<EditorTransform, 'scaleX' | 'scaleY'>;
  startSec: number;
  idPrefix: string;
  amount?: number;
  holdSec?: number;
  releaseSec?: number;
}): EditorKeyframe[] {
  const amount = input.amount ?? PUNCH_DEFAULTS.amount;
  const hold = input.holdSec ?? PUNCH_DEFAULTS.holdSec;
  const release = input.releaseSec ?? PUNCH_DEFAULTS.releaseSec;
  const stops = [
    { at: 0, factor: 1 },
    { at: PUNCH_ATTACK_SEC, factor: amount },
    { at: PUNCH_ATTACK_SEC + hold, factor: amount },
    { at: PUNCH_ATTACK_SEC + hold + release, factor: 1 },
  ];
  return (['transform.scaleX', 'transform.scaleY'] as const).flatMap((property, channel) =>
    stops.map(
      (stop, index): EditorKeyframe => ({
        id: `${input.idPrefix}-${channel}-${index}`,
        property,
        timeSec: round6(input.startSec + stop.at),
        value: round6(
          (property === 'transform.scaleX' ? input.base.scaleX : input.base.scaleY) * stop.factor,
        ),
        interpolation: 'bezier',
        easing: EASE_OUT,
      }),
    ),
  );
}
