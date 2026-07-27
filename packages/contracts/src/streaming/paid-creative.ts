import { z } from 'zod';
import { paidAdFormatSchema, paidAdFunnelStageSchema } from '../paid-creative/brief';
import { viralityGradeSchema } from '../virality/score';

/**
 * Orchestration-level stream frames for the paid-media creative sub-agent's
 * generation run. The per-scene clip generation leg REUSES `ReelVideoBatchFrame`
 * from `../media/reel-video` verbatim — these frames wrap that leg with the
 * paid-specific stages: grounding on what wins, the pre-spend virality gate, and
 * the terminal "landed in the Library, tagged ad-ready" state. No Meta write is
 * represented here — publishing is the optimizer's separate Phase-2 surface.
 *
 * Strict discriminated union on `type`, mirroring `reelVideoBatchFrameSchema`.
 */

/** Where the generation grounding came from, for provenance in the UI/telemetry. */
export const paidGroundingSourceSchema = z.enum([
  // Paid creative-intel win-rates were available and used.
  'paid_intel',
  // Materialized creative-strategy insights (organic+paid) were used.
  'insights',
  // Paid intel was unavailable (degraded); grounded on brand book alone.
  'brand_only',
]);
export type PaidGroundingSource = z.infer<typeof paidGroundingSourceSchema>;

/** A hook candidate with its virality verdict, used in scoring/ranking frames. */
export const paidCandidateScoreSchema = z
  .object({
    hookText: z.string().min(1),
    // 0-100 brand-percentile virality overall; null while pending.
    viralityOverall: z.number().min(0).max(100).nullable(),
    grade: viralityGradeSchema.nullable(),
  })
  .strict();
export type PaidCandidateScore = z.infer<typeof paidCandidateScoreSchema>;

export const paidCreativeRunFrameSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('run_started'),
      runId: z.string().min(1),
      brandId: z.string().min(1),
      format: paidAdFormatSchema,
      funnelStage: paidAdFunnelStageSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('brief_ready'),
      runId: z.string().min(1),
      angle: z.string(),
      hook: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal('grounding_ready'),
      runId: z.string().min(1),
      source: paidGroundingSourceSchema,
      // Whether the paid-intel reads degraded to unavailable (fail-open signal).
      paidIntelAvailable: z.boolean(),
      // Top winning angles that grounded the generation prompt, for provenance.
      winningAngles: z.array(z.string()).default([]),
    })
    .strict(),
  z
    .object({
      type: z.literal('candidate_scored'),
      runId: z.string().min(1),
      candidate: paidCandidateScoreSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('candidates_ranked'),
      runId: z.string().min(1),
      // Ranked best-first; only above-threshold candidates proceed to tagging.
      ranked: z.array(paidCandidateScoreSchema),
    })
    .strict(),
  z
    .object({
      type: z.literal('ad_ready_tagged'),
      runId: z.string().min(1),
      // The Library asset that was tagged ad-ready — the Phase-1 terminal artifact.
      assetId: z.string().min(1),
      // Whether this asset was a promoted organic winner (reused row) vs net-new.
      promotedFromOrganic: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      type: z.literal('run_completed'),
      runId: z.string().min(1),
      assetId: z.string().min(1).nullable(),
      adReady: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('run_failed'),
      runId: z.string().min(1),
      error: z.string(),
    })
    .strict(),
]);
export type PaidCreativeRunFrame = z.infer<typeof paidCreativeRunFrameSchema>;
