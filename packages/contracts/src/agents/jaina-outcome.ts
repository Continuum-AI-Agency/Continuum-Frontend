import { z } from 'zod';

export const jainaEvidenceOutcomeSchema = z
  .object({
    status: z.enum(['sufficient', 'partial_unavailable', 'missing_read']),
    missing_capability: z.string().nullable().default(null),
    limitation: z.string().nullable().default(null),
    dataset_ids: z.array(z.string()).max(100).default([]),
    dataset_count: z.number().int().nonnegative(),
    provenance_dataset_count: z.number().int().nonnegative(),
  })
  .strict();

export const jainaDeliveryAckSchema = z
  .object({
    kind: z.enum(['live_render', 'hydration_replay', 'pdf']),
    status: z.enum(['success', 'fallback']),
    report_id: z.string().min(1),
    acknowledged_at: z.string().datetime(),
  })
  .strict();
export type JainaDeliveryAck = z.infer<typeof jainaDeliveryAckSchema>;

export const jainaDeliveryAckRequestSchema = jainaDeliveryAckSchema.omit({
  acknowledged_at: true,
});
export type JainaDeliveryAckRequest = z.infer<typeof jainaDeliveryAckRequestSchema>;

const deliveryRecordSchema = z
  .object({
    live_render: jainaDeliveryAckSchema.nullable().default(null),
    hydration_replay: jainaDeliveryAckSchema.nullable().default(null),
    pdf: jainaDeliveryAckSchema.nullable().default(null),
  })
  .strict();

export const jainaRunOutcomeV1Schema = z
  .object({
    version: z.literal('1'),
    run_id: z.string().min(1),
    session_id: z.string().min(1),
    brand_id: z.string().nullable(),
    terminal_status: z.enum(['completed', 'failed', 'cancelled']),
    finish_reason: z.string().nullable(),
    model_usage: z
      .object({
        input_tokens: z.number().int().nonnegative(),
        output_tokens: z.number().int().nonnegative(),
        total_tokens: z.number().int().nonnegative(),
      })
      .strict(),
    step_count: z.number().int().nonnegative(),
    tool_call_count: z.number().int().nonnegative(),
    duration_ms: z.number().int().nonnegative(),
    timed_out: z.boolean(),
    aborted: z.boolean(),
    evidence: jainaEvidenceOutcomeSchema,
    report: z
      .object({
        schema_valid: z.boolean(),
        block_count: z.number().int().nonnegative(),
        category_counts: z.record(z.string(), z.number().int().nonnegative()),
      })
      .strict(),
    delivery: deliveryRecordSchema,
    correction_retry: z.boolean().nullable().default(null),
  })
  .strict();

export type JainaRunOutcomeV1 = z.infer<typeof jainaRunOutcomeV1Schema>;
