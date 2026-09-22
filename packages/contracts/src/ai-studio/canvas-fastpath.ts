import { z } from 'zod';

/**
 * The Canvas Composer's Laya fast path: one referential edit ("rename the image
 * generator to Hero", "cortá el segundo clip en 2s") resolved by a System-1 operation +
 * target choice over a code-indexed action space, executed through the same CAS mutation
 * paths the agent uses. Everything else falls through to the agent, and this is the
 * record of which way a turn went and why.
 *
 * It is persisted on the run row (`request.fastPathDecision`), NEVER streamed: the
 * browser parses composer frames through a strict union, and a Backend that emitted a
 * frame the live Frontend does not know would make it reject every composer stream until
 * a Frontend deploy landed.
 */
export const CANVAS_FASTPATH_REASONS = [
  'prefilter',
  'laya_unavailable',
  'laya_timeout',
  'op_defer',
  'op_margin',
  'target_margin',
  'null_distribution',
  'incompatible',
  'state_too_large',
  'params',
  'executor_rejected',
] as const;
export type CanvasFastPathReason = (typeof CANVAS_FASTPATH_REASONS)[number];

export const canvasFastPathDecisionSchema = z
  .object({
    decision: z.enum(['accepted', 'deferred']),
    reason: z.enum(CANVAS_FASTPATH_REASONS).optional(),
    operation: z.string().optional(),
    opMargin: z.number().nullable().optional(),
    targetMargin: z.number().nullable().optional(),
    /** Wall time of the Laya call(s), including any queueing behind the single instance. */
    layaMs: z.number().optional(),
    /** Laya's own reported service time for the same call(s) — wall minus this is queueing. */
    layaServiceMs: z.number().optional(),
    totalMs: z.number(),
  })
  .strict();
export type CanvasFastPathDecision = z.infer<typeof canvasFastPathDecisionSchema>;
