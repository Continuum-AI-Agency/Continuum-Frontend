import { z } from 'zod';

/**
 * Usage metering — the `billing.record_usage_event` / `billing.check_allowance` seam.
 *
 * Canvas (`studio` bucket) usage is billed in whole credits: provider cost × 1.15, rounded
 * UP to the cent, drawn rollover → included → purchased; whatever is left is overage that
 * `billing-meter-report` pushes to the Stripe meter. Agent subsystems are tracked only —
 * never drawn from anything that could block, never overage.
 *
 * X API calls (`x` subsystem and bucket) bill the same way — X's list price × 1.15, whole
 * credits — but draw only the brand's prepaid X wallet; their overage goes to the
 * `continuum_x_usage` meter, and only while the owner opted in to X auto-billing.
 */

export const BILLING_MARKUP = 1.15;

/** Mirrors the `usage_events.subsystem` check constraint. */
export const USAGE_SUBSYSTEMS = [
  'studio',
  'organic_agent',
  'jaina',
  'trends',
  'edge',
  'mcp',
  /** X (Twitter) API calls, drawn from the separate prepaid X wallet. */
  'x',
] as const;
export const usageSubsystemSchema = z.enum(USAGE_SUBSYSTEMS);
export type UsageSubsystem = z.infer<typeof usageSubsystemSchema>;

/** Mirrors the `usage_events.modality` check constraint. */
export const USAGE_MODALITIES = ['text', 'image', 'video', 'provider_call'] as const;
export const usageModalitySchema = z.enum(USAGE_MODALITIES);
export type UsageModality = z.infer<typeof usageModalitySchema>;

export const USAGE_BUCKETS = ['studio', 'agent', 'x'] as const;

/**
 * The `billing.model_pricing` keys of X's pay-per-use API (provider_call, priced per resource).
 * A post that carries a link is X's $0.20 rate; `mediaUpload` has no pricing row yet, so it
 * records at $0 flagged `unpriced` until X's console shows a charge. Edge functions mirror these
 * by value (supabase/functions/fetch-organic-analytics/lib/x.ts).
 */
export const X_USAGE_MODELS = {
  postCreate: 'x:post_create',
  postCreateWithUrl: 'x:post_create_url',
  postRead: 'x:post_read',
  postReadOwned: 'x:post_read_owned',
  postDelete: 'x:post_delete',
  mediaUpload: 'x:media_upload',
} as const;
export type XUsageModel = (typeof X_USAGE_MODELS)[keyof typeof X_USAGE_MODELS];
export const usageBucketCodeSchema = z.enum(USAGE_BUCKETS);
export type UsageBucketCode = z.infer<typeof usageBucketCodeSchema>;

const count = z.number().int().nonnegative().nullable();

/**
 * `billing.record_usage_event` arguments, keyed by the RPC's parameter names. Service role
 * only. `p_model_id` for a generation is `toBillingModelId({ modelId, tier })`; the
 * idempotency key makes a retried call a no-op (`recorded: false`).
 */
export const recordUsageEventArgsSchema = z
  .object({
    p_brand_id: z.string().uuid(),
    p_user_id: z.string().uuid().nullable(),
    p_subsystem: usageSubsystemSchema,
    p_model_id: z.string().min(1),
    p_modality: usageModalitySchema,
    p_input_tokens: count,
    p_output_tokens: count,
    p_image_count: count,
    p_video_seconds: z.number().nonnegative().nullable(),
    p_provider_calls: count,
    p_idempotency_key: z.string().min(1),
    p_run_id: z.string().nullable(),
    p_session_id: z.string().nullable(),
    p_meta: z.record(z.string(), z.unknown()),
  })
  .strict();
export type RecordUsageEventArgs = z.infer<typeof recordUsageEventArgsSchema>;

/** `billing.record_usage_event` result. A replayed key returns the stored row with `recorded: false`. */
export const usageRecordResultSchema = z
  .object({
    recorded: z.boolean(),
    baseCostUsd: z.number().nonnegative(),
    billedCostUsd: z.number().nonnegative(),
    bucket: usageBucketCodeSchema,
    /** The part no credit covered — metered to Stripe for `stripe` brands, 0 for agents and Contract. */
    overageUsd: z.number().nonnegative(),
    /** The model has no `billing.model_pricing` row: recorded at $0, never silently. */
    unpriced: z.boolean(),
  })
  .strict();
export type UsageRecordResult = z.infer<typeof usageRecordResultSchema>;

export const ALLOWANCE_REASONS = [
  'ok',
  'credits_exhausted',
  'overage_cap_reached',
  'no_bucket',
  'contract',
] as const;
export const allowanceReasonSchema = z.enum(ALLOWANCE_REASONS);
export type AllowanceReason = z.infer<typeof allowanceReasonSchema>;

/**
 * `billing.check_allowance(p_brand_id, p_bucket)` result. Service role only. A denial
 * (`credits_exhausted` or `overage_cap_reached`) is answered with HTTP 402
 * `{ error: 'credits_exhausted', product: 'studio', planCode }` before any provider call.
 */
export const allowanceResultSchema = z
  .object({
    allowed: z.boolean(),
    reason: allowanceReasonSchema,
    /** Rollover + included remaining + purchased, in whole credits. */
    creditsAvailable: z.number().int().nonnegative(),
    /** This period's accrued overage, reported or not. */
    overageUsd: z.number().nonnegative(),
    capUsd: z.number().nonnegative().nullable(),
  })
  .strict();
export type AllowanceResult = z.infer<typeof allowanceResultSchema>;

/** What `record_usage_event` bills a Canvas generation, in whole credits. */
export function billedCreditsForBaseCost(baseCostUsd: number): number {
  // Round away float noise first, so 0.04 × 1.15 × 100 = 4.6000000001 is 5, never 6.
  return Math.ceil(Number((baseCostUsd * BILLING_MARKUP * 100).toFixed(6)));
}
