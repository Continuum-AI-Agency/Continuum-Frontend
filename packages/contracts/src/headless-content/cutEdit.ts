import { z } from 'zod';

/**
 * What a composition asks a fast cut for: the interval ladder, the pacing presets, the transients and
 * the edit itself. Kept apart from the planner (cutPlan.ts) so the many surfaces that only carry an
 * edit (headless compositions, the canvas graph) do not bundle the planner: on 10-15 it put the
 * Frontend's /organic first load 20 KiB over its budget.
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
/**
 * What an edit carries unless it says otherwise. No white flash: the council read it as a washed
 * grey frame on every round (r0 "transients too hot", r2 "grey ghost" on the downbeat cuts, J5
 * "neutral" against transients-off). A caller still asks for it by name.
 */
export const DEFAULT_CUT_TRANSIENTS: readonly CutTransientKind[] = ['punch', 'rgb-shift'];

/** How a montage draws its cuts: each filling the frame, or as tiles piling onto one canvas. */
export const cutLayoutSchema = z.enum(['cut', 'collage']);
export type CutLayout = z.infer<typeof cutLayoutSchema>;
/**
 * The most tiles a collage holds; Render refuses more (montage.ts mirrors it). 16 bars of 1 s cuts at
 * 70 BPM is 55, so the planner can always fit an edit's longest montage under it.
 */
export const MAX_COLLAGE_TILES = 64;
/** A collage tile's arrival colour when the composition names no accent: the recap-reel amber. */
export const DEFAULT_COLLAGE_ACCENT = '#FFB84D';

/** What a composition asks for. The planner decides the cuts. */
export const headlessEditSchema = z
  .object({
    pacing: cutPacingSchema,
    /** Steady's rung, or stutter's base rung. */
    rung: cutRungSchema
      .optional()
      .describe(
        "steady's one cut length, or stutter's base, in seconds: 1, 0.8, 0.6, 0.4, 0.2, 0.1 or 0.05. Absent, the pacing's own.",
      ),
    /** The silent shots whose footage the montage cuts from. */
    montageShotIds: z.array(z.string().min(1)).min(1).max(8),
    /** The spoken shot the montage follows; null opens the reel on the montage. */
    afterShotId: z.string().min(1).nullable(),
    bars: z.number().int().min(2).max(16).default(4),
    transients: z
      .array(cutTransientKindSchema)
      .max(4)
      .default([...DEFAULT_CUT_TRANSIENTS])
      .describe(
        'Hits on the beat over the cuts: punch (a zoom pulse), rgb-shift (a colour split on the fast bursts), shake, flash (a white frame on bar downbeats; it reads grey, so rarely). Default punch and rgb-shift; [] for clean cuts. A collage has none.',
      ),
    /**
     * `collage`: each cut lands as a tile in its own section of one canvas that keeps the earlier
     * ones, arriving in the brand accent and settling to black and white until the wall is full (the
     * photo-wall open of an event recap). Absent is `cut`: each cut fills the frame.
     */
    layout: cutLayoutSchema
      .optional()
      .describe(
        'cut (the default): each cut fills the frame. collage: each cut snaps in as a tile in its own section of one black canvas and stays, arriving in the brand accent and settling to black and white until the wall is full, then the whole wall flashes the accent: the photo-wall open of an event recap. Best with build or steady and 3 or more varied silent shots; it has no transients and no burst words.',
      ),
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
