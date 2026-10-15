import { z } from 'zod';

/**
 * The delivery timing contract's shapes, shared by the Experimental Renderer wire (`micro-render.ts`)
 * and the render ledger (`api-renders.ts`). A leaf module: `micro-render.ts` already imports
 * `api-renders.ts`, so the ledger cannot import these from there.
 */

/** A rational rate, frames per second = num / den (never a rounded decimal). */
export const microRationalSchema = z
  .object({ num: z.number().int().positive(), den: z.number().int().positive() })
  .strict();

/**
 * The delivery timing contract (owner rule 2026-10-14, after the InYogo MP4 751 / MXF 749 split): every
 * video export of one render consumes this one timeline. For N frames at rate num/den:
 * - each export decodes to exactly N video frames, at that exact rational rate;
 * - presentation timestamps run 0, 1, ..., N - 1 in ticks of den/num seconds (first 0, last N - 1);
 * - the video duration is N ticks = N × den / num seconds;
 * - the source frames are the comp's [first, last] inclusive (aerender's `-s first -e last`), and
 *   `frames` is resolved once from them by the shared rule — never re-derived from a rounded label.
 * The delivery rate is `rate`; a renderer never takes it from `encode.fps`.
 * An interlaced profile (XDCAM 1080i59.94) carries the field rate 2 × num / den and top field first.
 * Container duration and audio priming/padding are measured separately and never replace this check.
 */
export const microDeliveryTimelineSchema = z
  .object({
    rate: microRationalSchema,
    frames: z.number().int().positive(),
    source: z
      .object({
        rate: microRationalSchema,
        first: z.number().int().nonnegative(),
        last: z.number().int().nonnegative(),
      })
      .strict(),
    /** The documented convention every planner, encoder and validator shares. */
    convention: z.literal('aerender-inclusive/cfr-v1'),
  })
  .strict();
export type MicroDeliveryTimeline = z.infer<typeof microDeliveryTimelineSchema>;

/** Broadcast profiles the renderer encodes; anything else is refused at preflight. */
export const MICRO_DELIVERY_PROFILES = ['web-h264', 'xdcam-hd422-1080i5994'] as const;

/** Files the renderer can be asked for; every one but a still is a video output on the timeline. */
export const MICRO_OUTPUT_FILES = ['mp4', 'mov', 'mxf', 'webm', 'gif', 'png', 'jpg'] as const;
export const MICRO_STILL_FILES = ['png', 'jpg'] as const;

/** An exact reduced fraction of seconds ("751751/30000"): a repeating decimal cannot be exact. */
const exactSecondsSchema = z.string().regex(/^\d+\/[1-9]\d*$/);

/** One output's measured video timing, from a FULL decode of the uploaded file (never a container string). */
export const microMeasuredVideoSchema = z
  .object({
    frames: z.number().int().nonnegative(),
    rate: microRationalSchema,
    /** The container's own time base; `firstPts`/`lastPts` are in its ticks. */
    timeBase: microRationalSchema,
    firstPts: z.number().int(),
    lastPts: z.number().int(),
    durationSeconds: exactSecondsSchema,
    /** sha256 of "0\n1\n…(N-1)\n": the decoded PTS sequence in delivery ticks, comparable across containers. */
    ptsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    fieldOrder: z.enum(['progressive', 'tff', 'bff']),
    decodeClean: z.boolean(),
  })
  .strict();

export const microMeasuredOutputSchema = z
  .object({
    file: z.enum(MICRO_OUTPUT_FILES),
    profile: z.enum(MICRO_DELIVERY_PROFILES).nullable(),
    bytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    uploaded: z.boolean(),
    video: microMeasuredVideoSchema.nullable(),
    /** Audio is reported beside, never instead of, the video timeline check. */
    audio: z
      .object({
        tracks: z.number().int().nonnegative(),
        channelsPerTrack: z.array(z.number().int()),
        sampleRate: z.number().int(),
        bitDepth: z.number().int().nullable(),
        codec: z.string(),
        trackSha256: z.array(z.string()),
        durationSeconds: exactSecondsSchema,
      })
      .strict()
      .nullable(),
    /** The container's own duration string, recorded for diagnosis only. */
    containerDurationSeconds: z.string().nullable(),
  })
  .strict();
export type MicroMeasuredOutput = z.infer<typeof microMeasuredOutputSchema>;

/** A pinned media tool: the build that encoded or verified a file, and its sha256. */
export const microMediaToolSchema = z
  .object({ name: z.string(), version: z.string(), sha256: z.string() })
  .strict();

/**
 * What the ledger keeps per delivered file of an Experimental Renderer job: the planned timeline, the
 * file's measurements, whether the job's timing check passed, and the tools that made and verified it.
 * A `failed` file stays on its job for diagnosis and is never delivered.
 */
export const microOutputTimingSchema = z
  .object({
    timeline: microDeliveryTimelineSchema.nullable(),
    measured: microMeasuredOutputSchema,
    validation: z.enum(['passed', 'failed']),
    encoder: microMediaToolSchema,
    probe: microMediaToolSchema,
  })
  .strict();
export type MicroOutputTiming = z.infer<typeof microOutputTimingSchema>;
