import { z } from 'zod';

/**
 * A fast-cut montage: cuts placed on the measured beat grid of a music bed, paced along the
 * owner's interval ladder. The Backend measures the bed and asks for an edit; the planner turns
 * that into frame-exact cuts; Render encodes each cut and joins them by stream copy.
 */

/** The interval ladder, longest first. At 60 fps every rung is a whole number of frames. */
export const CUT_RUNGS_SEC = [1, 0.8, 0.6, 0.4, 0.2, 0.1, 0.05] as const;
export type CutRungSec = (typeof CUT_RUNGS_SEC)[number];
export const cutRungSchema = z
  .number()
  .refine((value): value is CutRungSec => (CUT_RUNGS_SEC as readonly number[]).includes(value), {
    message: `a rung is one of ${CUT_RUNGS_SEC.join(' / ')} s`,
  });

export const cutPacingSchema = z.enum(['steady', 'build', 'stutter', 'drop-hit']);
export type CutPacing = z.infer<typeof cutPacingSchema>;

export const cutTransientKindSchema = z.enum(['flash', 'punch', 'rgb-shift', 'shake']);
export type CutTransientKind = z.infer<typeof cutTransientKindSchema>;

/** What a composition asks for. The planner decides the cuts. */
export const headlessEditSchema = z
  .object({
    pacing: cutPacingSchema,
    /** Steady's rung, or stutter's base rung. */
    rung: cutRungSchema.optional(),
    /** The silent shots whose footage the montage cuts from. */
    montageShotIds: z.array(z.string().min(1)).min(1).max(8),
    /** The spoken shot the montage follows; null opens the reel on the montage. */
    afterShotId: z.string().min(1).nullable(),
    bars: z.number().int().min(2).max(16).default(4),
    transients: z.array(cutTransientKindSchema).max(4).default(['flash', 'punch', 'rgb-shift']),
    /** A generated bed at this tempo; null uses the composition's `audioBed`. */
    music: z
      .object({
        bpm: z.number().int().min(70).max(180).default(150),
        prompt: z.string().trim().min(1).max(400),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type HeadlessEdit = z.infer<typeof headlessEditSchema>;

/** A source that shows the product or the presenter; absent is b-roll. */
export const cutSourceRoleSchema = z.enum(['product', 'presenter']);
export type CutSourceRole = z.infer<typeof cutSourceRoleSchema>;
/** A burst token is one short word or figure: it is set to fill the frame's width. */
export const CUT_TYPE_TOKEN_CHARS = 16;
const MAX_TYPE_BEATS = 64;

const timeSpanSchema = z
  .object({ startSec: z.number().nonnegative(), endSec: z.number().nonnegative() })
  .strict()
  .refine((span) => span.endSec > span.startSec, { message: 'a span ends after it starts' });

/** The planner's input: the measured grid, the footage, and the edit. */
export const cutPlanInputSchema = z
  .object({
    beat: z
      .object({
        periodSec: z.number().positive().max(2),
        /** The bed time, on a downbeat, where montage frame 0 lands. */
        bedAtSec: z.number().nonnegative(),
        /** RMS per beat, normalised to the loudest: where the drop is. */
        energy: z.array(z.number().min(0).max(1)).max(4000).optional(),
      })
      .strict(),
    bars: z.number().int().min(2).max(16),
    pacing: cutPacingSchema,
    rung: cutRungSchema.optional(),
    sources: z
      .array(
        z
          .object({
            id: z.string().min(1),
            durationSec: z.number().positive(),
            still: z.boolean(),
            /** Spoken windows: no cut of 0.4 s or longer comes from inside one. */
            speech: z.array(timeSpanSchema).max(64),
            /** What it shows when it is more than b-roll: the fast rungs draw from these first. */
            role: cutSourceRoleSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(24),
    transients: z.array(cutTransientKindSchema).max(4),
    /**
     * Words the composition already carries (its offer's price, the brand, a heard display word),
     * set big on the burst beats, one per beat. Absent or empty: no type.
     */
    tokens: z.array(z.string().trim().min(1).max(CUT_TYPE_TOKEN_CHARS)).max(6).optional(),
  })
  .strict();
export type CutPlanInput = z.infer<typeof cutPlanInputSchema>;

export const cutGridSchema = z.enum(['bar', 'beat', '1/2', '1/4', '1/8', 'stutter']);

export const plannedCutSchema = z
  .object({
    sourceId: z.string().min(1),
    inSec: z.number().nonnegative(),
    frames: z.number().int().positive(),
    rung: cutRungSchema,
    grid: cutGridSchema,
  })
  .strict();
export type PlannedCut = z.infer<typeof plannedCutSchema>;

export const plannedTransientSchema = z
  .object({
    kind: cutTransientKindSchema,
    atFrame: z.number().int().nonnegative(),
    frames: z.number().int().positive(),
  })
  .strict();
export type PlannedTransient = z.infer<typeof plannedTransientSchema>;

/** One token over whole beats of a burst, in montage frames: it lands on a tick and never flickers. */
export const plannedTypeSchema = z
  .object({
    text: z.string().min(1).max(CUT_TYPE_TOKEN_CHARS),
    atFrame: z.number().int().nonnegative(),
    frames: z.number().int().positive(),
  })
  .strict();
export type PlannedType = z.infer<typeof plannedTypeSchema>;

/** The planner's output: every cut a whole number of frames, summing to the montage. */
export const cutPlanSchema = z
  .object({
    version: z.literal(1),
    fps: z.union([z.literal(30), z.literal(60)]),
    frames: z.number().int().positive(),
    bedAtSec: z.number().nonnegative(),
    cuts: z.array(plannedCutSchema).min(1).max(720),
    transients: z.array(plannedTransientSchema).max(720),
    /** Present only when the input carried tokens. */
    type: z.array(plannedTypeSchema).max(MAX_TYPE_BEATS).optional(),
  })
  .strict()
  .refine((plan) => plan.cuts.reduce((sum, cut) => sum + cut.frames, 0) === plan.frames, {
    message: 'the cuts add up to the montage',
  })
  .refine((plan) => (plan.type ?? []).every((beat) => beat.atFrame + beat.frames <= plan.frames), {
    message: 'every type beat sits inside the montage',
  });
export type CutPlan = z.infer<typeof cutPlanSchema>;

/** The grid: one eighth of a beat. At the default 150 BPM a tick is 50 ms, so every rung lands on it. */
export const CUT_TICKS_PER_BEAT = 8;
const TICKS_PER_BAR = 4 * CUT_TICKS_PER_BEAT;
/** 0.05 s is not drawable at 30 fps, so a plan that cuts this fast or faster runs at 60. */
const SIXTY_FPS_RUNG = 0.1;
/** A source reused jumps its in-point at least this far, so a repeat never reads as the same shot. */
const REUSE_JUMP_SEC = 0.5;
/** At this length silent lips show, so these cuts never come from inside a speech window. */
const SILENT_LIPS_SEC = 0.4;
/** One frame: two washed the only frames a 0.05–0.2 s cut has. */
const FLASH_FRAMES = 1;
const PULSE_FRAMES = 6;
/** A still is read, not glimpsed: it lands on rungs of 0.4 s and up (or the drop), never 0.05–0.2 s. */
const STILL_RUNG_SEC = 0.4;
/** Below this a still's cut is a grid remainder of its rung, not the rung itself. */
const STILL_MIN_SEC = 0.3;
/**
 * A cut this fast is a glimpse (the council's r1 legibility 4: generic b-roll on the fastest cuts):
 * it draws the product or the presenter when there is one, and its beats carry the burst's type.
 */
const FAST_RUNG_SEC = 0.2;
const MAX_CUTS = 720;
const EPSILON = 1e-9;

/** Stutter's base is 0.4 or 0.8; its bursts are 0.05 (under 0.4) or 0.1 (under 0.8). */
function stutterRungs(rung: CutRungSec | undefined): { base: CutRungSec; burst: CutRungSec } {
  const base: CutRungSec = rung !== undefined && rung >= 0.2 ? rung : 0.4;
  const burst: CutRungSec =
    rung !== undefined && rung <= SIXTY_FPS_RUNG ? rung : base >= 0.8 ? 0.1 : 0.05;
  return { base, burst };
}

const LADDER: readonly CutRungSec[] = CUT_RUNGS_SEC;

function pacingRungs(pacing: CutPacing, rung: CutRungSec | undefined): CutRungSec[] {
  if (pacing === 'steady') return [rung ?? 0.4];
  if (pacing === 'build') return [...LADDER];
  if (pacing === 'stutter') return Object.values(stutterRungs(rung));
  return [1, 0.8, 0.2, 0.4];
}

/** 60 when the plan cuts at 0.1 s or faster (build and stutter always do), else 30. */
export function fastCutFps(pacing: CutPacing, rung?: CutRungSec): 30 | 60 {
  return Math.min(...pacingRungs(pacing, rung)) <= SIXTY_FPS_RUNG + EPSILON ? 60 : 30;
}

/** A run of whole ticks, or a burst of sub-tick stutters of exactly round(rung × fps) frames. */
type Slot = { from: number; to: number; rung: CutRungSec; stutter: boolean };

/**
 * Stutter's bursts in beats, escalating: one beat for the first, growing to a whole bar for the
 * last, so the montage builds instead of repeating the same hiccup.
 */
export function stutterBurstBeats(count: number): number[] {
  const longest = Math.min(4, Math.max(1, count));
  return Array.from({ length: count }, (_, index) =>
    count === 1 ? 1 : 1 + Math.round((index * (longest - 1)) / (count - 1)),
  );
}

function gridOf(tick: number): z.infer<typeof cutGridSchema> {
  if (tick % TICKS_PER_BAR === 0) return 'bar';
  if (tick % CUT_TICKS_PER_BEAT === 0) return 'beat';
  if (tick % 4 === 0) return '1/2';
  if (tick % 2 === 0) return '1/4';
  return '1/8';
}

/**
 * Turns a measured beat grid, the footage and a pacing preset into a frame-exact cut list.
 *
 * Every boundary is frame round(tick × tickSec × fps) from `bedAtSec`, computed from the tick
 * itself, so it sits within half a frame of its tick and the error never accumulates. A rung of
 * a tick or more is round(rung / tickSec) ticks; one under a tick is a stutter of exactly
 * round(rung × fps) frames inside a burst that starts and ends on ticks.
 *
 * Footage goes round-robin: never the same source twice running, a reuse jumps its in-point by
 * ≥ 0.5 s, no cut of 0.4 s or longer comes from inside a speech window, and a still lands only on a
 * rung of 0.4 s or longer, or on the drop.
 */
export function planCuts(input: CutPlanInput): CutPlan {
  const { beat, bars, pacing, rung, sources, transients } = input;
  const fps = fastCutFps(pacing, rung);
  const totalTicks = bars * TICKS_PER_BAR;
  const frameAt = (tick: number) =>
    Math.round((tick * beat.periodSec * fps) / CUT_TICKS_PER_BEAT + EPSILON);
  const ticksOf = (value: CutRungSec) => (value * CUT_TICKS_PER_BEAT) / beat.periodSec;
  const subTick = (value: CutRungSec) => ticksOf(value) < 1 - EPSILON;
  const wholeTicks = (value: CutRungSec) => Math.max(1, Math.round(ticksOf(value)));
  const stutterFrames = (value: CutRungSec) => Math.max(1, Math.round(value * fps));

  const slots: Slot[] = [];
  /** Whole-tick cuts of one rung over [from, to); a short remainder joins the last cut. */
  const fillWhole = (from: number, to: number, value: CutRungSec) => {
    const step = wholeTicks(value);
    const first = slots.length;
    let at = from;
    while (to - at >= step) {
      slots.push({ from: at, to: at + step, rung: value, stutter: false });
      at += step;
    }
    if (at >= to) return;
    const last = slots.at(-1);
    if (last && slots.length > first && (to - at) * 2 < step) last.to = to;
    else slots.push({ from: at, to, rung: value, stutter: false });
  };
  /** The longest tick-bounded burst from `from` whose frames divide into stutters; whole ticks after. */
  const fillStutter = (from: number, to: number, value: CutRungSec) => {
    const size = stutterFrames(value);
    let end = to;
    while (end > from && (frameAt(end) - frameAt(from)) % size !== 0) end--;
    if (end > from && frameAt(end) - frameAt(from) >= size)
      slots.push({ from, to: end, rung: value, stutter: true });
    else end = from;
    for (let tick = end; tick < to; tick++)
      slots.push({ from: tick, to: tick + 1, rung: value, stutter: false });
  };
  const fill = (from: number, to: number, value: CutRungSec) => {
    if (to <= from) return;
    if (subTick(value)) fillStutter(from, to, value);
    else fillWhole(from, to, value);
  };

  /** The ticks one cut of a rung spans; a sub-tick rung's stutter is a fraction of one. */
  const cutTicks = (value: CutRungSec) =>
    subTick(value)
      ? (stutterFrames(value) * CUT_TICKS_PER_BEAT) / (beat.periodSec * fps)
      : wholeTicks(value);
  /** The whole ticks `count` cuts of a rung take. */
  const rowTicks = (value: CutRungSec, count: number) =>
    Math.max(1, Math.ceil(count * cutTicks(value) - EPSILON));
  const rise = (bar: number) => {
    const energy = beat.energy ?? [];
    const at = bar * 4;
    return at < energy.length
      ? (energy[at] ?? 0) - (energy[at - 1] ?? 0)
      : Number.NEGATIVE_INFINITY;
  };
  /** The drop: the downbeat with the biggest energy rise, or `fallback` with no energy to read. */
  const dropBar = (earliest: number, latest: number, fallback: number) => {
    let best = fallback;
    for (let bar = earliest; bar <= latest; bar++)
      if (rise(bar) > Number.NEGATIVE_INFINITY && rise(bar) > rise(best)) best = bar;
    return Math.min(latest, Math.max(earliest, best));
  };
  /** Stutter bursts, in ticks: the only stretches that carry an RGB shift. */
  const bursts: Array<{ from: number; to: number }> = [];
  let dropTick: number | null = null;

  if (pacing === 'steady') fill(0, totalTicks, rung ?? 0.4);
  else if (pacing === 'stutter') {
    const { base, burst } = stutterRungs(rung);
    const beats = stutterBurstBeats(Math.floor(bars / 2));
    let at = 0;
    for (const [index, length] of beats.entries()) {
      const end = (index + 1) * 2 * TICKS_PER_BAR;
      const burstAt = end - length * CUT_TICKS_PER_BEAT;
      fill(at, burstAt, base);
      fill(burstAt, end, burst);
      bursts.push({ from: burstAt, to: end });
      at = end;
    }
    fill(at, totalTicks, base);
  } else if (pacing === 'drop-hit') {
    const drop = dropBar(1, bars - 1, Math.max(1, Math.floor(bars / 2))) * TICKS_PER_BAR;
    dropTick = drop;
    let at = 0;
    for (let index = 0; at < drop; index++) {
      const value: CutRungSec = index % 2 === 0 ? 1 : 0.8;
      const to = Math.min(drop, at + wholeTicks(value));
      const last = slots.at(-1);
      if (last && (to - at) * 2 < wholeTicks(value)) last.to = to;
      else slots.push({ from: at, to, rung: value, stutter: false });
      at = to;
    }
    const barEnd = Math.min(totalTicks, drop + TICKS_PER_BAR);
    fill(drop, barEnd, 0.2);
    fill(barEnd, totalTicks, 0.4);
  } else {
    // Build: a sustained accelerando. Every rung holds the screen for about the same time, so the
    // fast rungs get many cuts, and the fastest lands exactly on the drop: the last bar line, so
    // one bar of 0.4 on the beats hits the drop and hands over to the CTA. The slowest rungs go
    // when even one cut of each does not fit.
    const drop = (bars - 1) * TICKS_PER_BAR;
    dropTick = drop;
    let rows = [...LADDER];
    while (rows.length > 1 && rows.reduce((sum, value) => sum + rowTicks(value, 1), 0) > drop)
      rows = rows.slice(1);
    let at = 0;
    let count = 1;
    for (const [index, value] of rows.entries()) {
      // An equal share of what is left, never fewer cuts than the slower rung before it, and always
      // room for the faster rungs to match it: the cut count only ever climbs.
      const faster = rows.slice(index + 1);
      const fits = (cuts: number) =>
        at + [value, ...faster].reduce((sum, each) => sum + rowTicks(each, cuts), 0) <= drop;
      const floor = count;
      count = Math.max(floor, Math.round((drop - at) / (rows.length - index) / cutTicks(value)));
      while (count > floor && !fits(count)) count--;
      const end = faster.length ? at + rowTicks(value, count) : drop;
      fill(at, end, value);
      at = end;
    }
    fill(drop, totalTicks, 0.4);
  }

  type Placed = {
    frame: number;
    frames: number;
    rung: CutRungSec;
    grid: PlannedCut['grid'];
    slot: Slot;
  };
  const placed: Placed[] = [];
  for (const slot of slots) {
    const start = frameAt(slot.from);
    const end = frameAt(slot.to);
    if (!slot.stutter) {
      if (end > start)
        placed.push({
          frame: start,
          frames: end - start,
          rung: slot.rung,
          grid: gridOf(slot.from),
          slot,
        });
      continue;
    }
    const size = stutterFrames(slot.rung);
    for (let frame = start; frame < end; frame += size)
      placed.push({ frame, frames: size, rung: slot.rung, grid: 'stutter', slot });
  }
  if (placed.length > MAX_CUTS)
    throw new Error(`cut_plan_too_many_cuts: ${placed.length} cuts, at most ${MAX_CUTS}`);

  const dropFrame = dropTick === null ? null : frameAt(dropTick);
  const cuts = assignFootage(
    placed.map((cut) => ({
      ...cut,
      still:
        cut.frame === dropFrame ||
        (cut.rung >= STILL_RUNG_SEC - EPSILON && cut.frames / fps >= STILL_MIN_SEC - EPSILON),
      fast: cut.rung <= FAST_RUNG_SEC + EPSILON,
    })),
    sources,
    fps,
  );
  const type = input.tokens?.length
    ? burstType({
        tokens: input.tokens,
        fast: slots.filter((slot) => slot.rung <= FAST_RUNG_SEC + EPSILON),
        stills: placed.flatMap((cut, index) =>
          sources.find((source) => source.id === cuts[index]?.sourceId)?.still
            ? [{ from: cut.frame, to: cut.frame + cut.frames }]
            : [],
        ),
        frameAt,
      })
    : null;

  // Transients never wash a short frame: a one-frame flash only on the drop and on bar downbeats
  // held 0.4 s or longer, an RGB shift only inside a stutter burst, and on every other cut at most
  // a punch (Render draws it subtle on a cut under 0.4 s).
  const wanted = new Set(transients);
  const planned: PlannedTransient[] = [];
  const add = (kind: CutTransientKind, atFrame: number, frames: number) => {
    if (wanted.has(kind) && frames > 0) planned.push({ kind, atFrame, frames });
  };
  const pulse = (['shake', 'punch'] as const).find((kind) => wanted.has(kind)) ?? null;
  for (const cut of placed) {
    const seconds = cut.frames / fps;
    // Frame 0 is the join from the hook, which stays a plain cut.
    const flash =
      cut.frame > 0 &&
      (cut.frame === dropFrame ||
        (!cut.slot.stutter &&
          cut.slot.from % TICKS_PER_BAR === 0 &&
          cut.frame === frameAt(cut.slot.from) &&
          seconds >= SILENT_LIPS_SEC - EPSILON));
    if (flash) add('flash', cut.frame, Math.min(FLASH_FRAMES, cut.frames));
    if (seconds >= 0.2 - EPSILON) add('punch', cut.frame, Math.min(PULSE_FRAMES, cut.frames));
    if (pulse && !cut.slot.stutter) {
      const firstBeat = Math.floor(cut.slot.from / CUT_TICKS_PER_BEAT + 1) * CUT_TICKS_PER_BEAT;
      for (let tick = firstBeat; tick < cut.slot.to; tick += CUT_TICKS_PER_BEAT) {
        const at = frameAt(tick);
        if (at > cut.frame && at < cut.frame + cut.frames)
          add(pulse, at, Math.min(PULSE_FRAMES, cut.frame + cut.frames - at));
      }
    }
  }
  for (const burst of bursts)
    add('rgb-shift', frameAt(burst.from), frameAt(burst.to) - frameAt(burst.from));
  planned.sort((a, b) => a.atFrame - b.atFrame);

  return cutPlanSchema.parse({
    version: 1,
    fps,
    frames: frameAt(totalTicks),
    bedAtSec: beat.bedAtSec,
    cuts,
    transients: planned.slice(0, MAX_CUTS),
    ...(type ? { type } : {}),
  });
}

/**
 * The burst's type: the beats lying wholly inside the fast stretches, one token each in turn. A
 * token lands on the beat's tick and holds the whole beat (two beats running with one token are
 * one), so it changes with the music, never with a 3-frame cut; a beat with a still in it carries
 * none, so the type never covers the packshot.
 */
function burstType(input: {
  tokens: readonly string[];
  fast: ReadonlyArray<{ from: number; to: number }>;
  stills: ReadonlyArray<{ from: number; to: number }>;
  frameAt: (tick: number) => number;
}): PlannedType[] {
  const { tokens, frameAt } = input;
  // Fast slots abut, so a beat split across two fast rungs (0.2 into 0.1) still counts whole.
  const fast = [...input.fast].sort((a, b) => a.from - b.from);
  const covered = (from: number, to: number) => {
    let at = from;
    for (const slot of fast) if (slot.from <= at && slot.to > at) at = slot.to;
    return at >= to;
  };
  const beats = new Set<number>();
  for (const slot of fast)
    for (
      let beat = Math.floor(slot.from / CUT_TICKS_PER_BEAT);
      beat * CUT_TICKS_PER_BEAT < slot.to;
      beat++
    )
      if (covered(beat * CUT_TICKS_PER_BEAT, (beat + 1) * CUT_TICKS_PER_BEAT)) beats.add(beat);
  const type: PlannedType[] = [];
  let turn = 0;
  for (const beat of [...beats].sort((a, b) => a - b)) {
    const from = frameAt(beat * CUT_TICKS_PER_BEAT);
    const to = frameAt((beat + 1) * CUT_TICKS_PER_BEAT);
    if (input.stills.some((still) => still.from < to && still.to > from)) continue;
    const text = tokens[turn++ % tokens.length] as string;
    const last = type.at(-1);
    if (last && last.text === text && last.atFrame + last.frames === from) last.frames += to - from;
    else type.push({ text, atFrame: from, frames: to - from });
  }
  return type.slice(0, MAX_TYPE_BEATS);
}

type FootageSource = CutPlanInput['sources'][number];

/**
 * Round-robin over the sources, the idea of the editor's switchShotClips: each cut takes the next
 * source that fits, never the one just used, at a cursor that moves on by ≥ 0.5 s per use. A still
 * fits only the cuts long enough to read it. A fast cut tries the product and presenter sources
 * first (b-roll then falls to the longer rungs); with no role on any source it is plain round-robin.
 */
function assignFootage(
  placed: ReadonlyArray<{
    frames: number;
    rung: CutRungSec;
    grid: PlannedCut['grid'];
    /** Whether a still may hold this cut (see STILL_RUNG_SEC). */
    still: boolean;
    /** A rung of 0.2 s or faster (see FAST_RUNG_SEC). */
    fast: boolean;
  }>,
  sources: readonly FootageSource[],
  fps: number,
): PlannedCut[] {
  const cursor = new Map<string, number>();
  const lastIn = new Map<string, number>();
  const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;
  /** The in-points a cut of `seconds` may start at: inside the take, and clear of speech when long. */
  const allowed = (source: FootageSource, seconds: number): Array<[number, number]> => {
    const usable = source.durationSec - seconds;
    if (usable < -EPSILON) return [];
    let spans: Array<[number, number]> = [[0, Math.max(0, usable)]];
    if (seconds < SILENT_LIPS_SEC - EPSILON) return spans;
    for (const speech of source.speech) {
      const [from, to] = [speech.startSec - seconds, speech.endSec];
      spans = spans.flatMap(([a, b]): Array<[number, number]> => {
        if (to <= a || from >= b) return [[a, b]];
        return [
          ...(from > a ? [[a, from] as [number, number]] : []),
          ...(to < b ? [[to, b] as [number, number]] : []),
        ];
      });
    }
    return spans;
  };
  const inPoint = (
    source: FootageSource,
    seconds: number,
    strict: boolean,
    stillFits: boolean,
  ): number | null => {
    if (source.still) return stillFits ? 0 : null;
    const previous = lastIn.get(source.id);
    const far = (at: number) =>
      !strict || previous === undefined || Math.abs(at - previous) >= REUSE_JUMP_SEC - EPSILON;
    const candidates = allowed(source, seconds).flatMap(([a, b]) => {
      const points = [Math.ceil(a * 1000) / 1000];
      if (previous !== undefined) points.push(Math.ceil((previous + REUSE_JUMP_SEC) * 1000) / 1000);
      const from = cursor.get(source.id) ?? 0;
      points.push(Math.ceil(from * 1000) / 1000);
      return points.filter((at) => at >= a - EPSILON && at <= b + EPSILON && far(at));
    });
    if (!candidates.length) return null;
    const from = cursor.get(source.id) ?? 0;
    const ahead = candidates.filter((at) => at >= from - EPSILON).sort((a, b) => a - b);
    return ahead[0] ?? candidates.sort((a, b) => a - b)[0];
  };

  let turn = 0;
  let previous: string | null = null;
  const featuring = sources.some((source) => source.role !== undefined);
  return placed.map((cut) => {
    const seconds = cut.frames / fps;
    let chosen: { index: number; inSec: number } | null = null;
    // A reuse's in-point jump outranks the preference: featured, then b-roll, strictly first.
    const passes = cut.fast && featuring ? [true, false] : [null];
    for (const strict of [true, false]) {
      for (const featured of passes)
        for (let offset = 0; offset < sources.length && !chosen; offset++) {
          const index = (turn + offset) % sources.length;
          const source = sources[index];
          if (sources.length > 1 && source.id === previous) continue;
          if (featured !== null && (source.role !== undefined) !== featured) continue;
          const at = inPoint(source, seconds, strict, cut.still);
          if (at !== null) chosen = { index, inSec: at };
        }
      if (chosen) break;
    }
    if (!chosen)
      throw new Error(
        `cut_plan_no_footage_fits: no source holds a ${seconds.toFixed(3)} s cut clear of speech`,
      );
    const source = sources[chosen.index];
    turn = chosen.index + 1;
    previous = source.id;
    if (!source.still) {
      lastIn.set(source.id, chosen.inSec);
      cursor.set(source.id, chosen.inSec + Math.max(seconds, REUSE_JUMP_SEC));
    }
    return {
      sourceId: source.id,
      inSec: ms(chosen.inSec),
      frames: cut.frames,
      rung: cut.rung,
      grid: cut.grid,
    };
  });
}
