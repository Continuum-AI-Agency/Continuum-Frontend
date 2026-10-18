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
    transients: z
      .array(cutTransientKindSchema)
      .max(4)
      .default([...DEFAULT_CUT_TRANSIENTS]),
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
