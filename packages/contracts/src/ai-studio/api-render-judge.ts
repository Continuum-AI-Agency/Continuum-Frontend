import { z } from 'zod';

/**
 * The visual judge's verdict, as it crosses into Continuum.
 *
 * Mirrors `forge-judge/src/schema.ts` rather than importing it: forge-judge is a separate repo
 * run by bun on the fleet, and nothing crosses between the two trees. Copied deliberately and
 * kept narrow — the nine finding kinds are a CLOSED set on both sides, so a tenth arriving here
 * is a version skew worth failing on rather than rendering as an unlabelled chip.
 *
 * The judge is the residue, not the gate. `asset_fit` predicts placement in closed form,
 * `product_footprint` locates the product in the rendered pixels, `frame_measure` compares ink
 * against the authored spread; each answers with a number. This answers the frames those could
 * not, and confirms the ones they answered badly. Its own 2026-09-03 bench put recall at 55.6%
 * with precision 93.2% — trustworthy when it speaks, silent too often to be relied on alone.
 */

export const judgeFindingKindSchema = z.enum([
  'occluded',
  'clipped',
  'overlap',
  'unreadable_text',
  'off_brand',
  'placeholder',
  'missing',
  'stray_element',
  'text_overflow',
]);
export type JudgeFindingKind = z.infer<typeof judgeFindingKindSchema>;

export const judgeFindingSchema = z
  .object({
    kind: judgeFindingKindSchema,
    layerHint: z.string(),
    /** Present once the fleet has mapped the hint onto a real measured layer. */
    layerId: z.number().int().nullable().default(null),
    severity: z.enum(['low', 'medium', 'high']),
    /**
     * `[ymin, xmin, ymax, xmax]` on a 0..1000 grid — Gemini's native ordering, kept rather than
     * normalised so a frame drawn from it cannot silently transpose.
     */
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable().default(null),
    note: z.string().nullable().default(null),
  })
  .strict();
export type JudgeFinding = z.infer<typeof judgeFindingSchema>;

export const judgeVerdictSchema = z
  .object({
    findings: z.array(judgeFindingSchema).default([]),
    overall: z.enum(['pass', 'fail']),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;

/**
 * What Continuum stores against a job.
 *
 * `state` is three-valued and `unknown` is load-bearing: exit 2 from the judge means it could
 * not RUN — no Vertex credential, no bun, unparseable output — and treating that as a pass is
 * the one mistake that turns an unchecked frame into a checked one. Everything downstream
 * branches on this word.
 */
export const apiRenderJudgeSchema = z
  .object({
    state: z.enum(['pass', 'fail', 'unknown']),
    verdict: judgeVerdictSchema.nullable().default(null),
    why: z.string().nullable().default(null),
    model: z.string().nullable().default(null),
    level: z.string().nullable().default(null),
    votes: z.number().int().positive().nullable().default(null),
    /** Why this frame was escalated at all — the deterministic check's own words. */
    escalatedBecause: z.string().nullable().default(null),
    judgedAt: z.string().nullable().default(null),
  })
  .strict();
export type ApiRenderJudge = z.infer<typeof apiRenderJudgeSchema>;
