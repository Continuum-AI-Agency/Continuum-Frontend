import { z } from 'zod';
import { goalExecutionRefSchema } from '../goals/execution';
import { goalWorkNodeStatusSchema } from '../goals/supervisor';

const idSchema = z.string().trim().min(1).max(240);
const timestampSchema = z.iso.datetime({ offset: true });
const versionSchema = z.number().int().nonnegative();

/** A teammate's responsibility is independent of its underlying execution lane. */
export const WATCHMAN_ROLES = ['content', 'performance', 'gtm', 'lead'] as const;
export const watchmanRoleSchema = z.enum(WATCHMAN_ROLES);
export type WatchmanRole = z.infer<typeof watchmanRoleSchema>;

export const watchmanLifecycleSchema = z.enum([
  'ready',
  'working',
  'waiting',
  'blocked',
  'paused',
  'failed',
]);
export type WatchmanLifecycle = z.infer<typeof watchmanLifecycleSchema>;

export const watchmanTeammateProfileSchema = z
  .object({
    id: z.string().uuid(),
    brand_id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    role: watchmanRoleSchema,
    execution_lane: z.enum(['organic', 'paid']),
    instructions: z.string().max(8_000),
    timezone: z.string().min(1).max(64),
    status: z.enum(['active', 'paused']),
  })
  .strict();
export type WatchmanTeammateProfile = z.infer<typeof watchmanTeammateProfileSchema>;

export const WATCHMAN_READINESS_CHECKS = [
  'worker',
  'runtime',
  'credential',
  'account',
  'budget',
  'entitlement',
] as const;
export const watchmanReadinessCheckSchema = z
  .object({
    key: z.enum(WATCHMAN_READINESS_CHECKS),
    status: z.enum(['ready', 'not_required', 'missing', 'expired', 'unavailable', 'unknown']),
    reason: z.string().max(1_000).nullable(),
    recovery_action: z
      .enum([
        'connect_account',
        'reconnect_account',
        'resume_setup',
        'adjust_budget',
        'contact_support',
      ])
      .nullable(),
  })
  .strict();
export const watchmanReadinessSchema = z
  .object({
    state: z.enum(['ready', 'blocked', 'unknown']),
    checked_at: timestampSchema,
    checks: z.array(watchmanReadinessCheckSchema).length(WATCHMAN_READINESS_CHECKS.length),
  })
  .strict()
  .superRefine((readiness, context) => {
    const keys = new Set(readiness.checks.map((check) => check.key));
    if (keys.size !== WATCHMAN_READINESS_CHECKS.length) {
      context.addIssue({
        code: 'custom',
        path: ['checks'],
        message: 'Every readiness check must occur exactly once.',
      });
    }
    if (
      readiness.state === 'ready' &&
      readiness.checks.some((check) => check.status !== 'ready' && check.status !== 'not_required')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['state'],
        message: 'Unverified readiness cannot be ready.',
      });
    }
  });
export type WatchmanReadiness = z.infer<typeof watchmanReadinessSchema>;

export const watchmanSetupAttemptSchema = z
  .object({
    request_id: z.string().uuid(),
    brand_id: z.string().uuid(),
    watchman_id: z.string().uuid().nullable(),
    version: versionSchema,
    status: z.enum(['pending', 'provisioning', 'needs_connection', 'ready', 'failed']),
    completed_stages: z
      .array(z.enum(['principal', 'teammate', 'credential', 'responsibilities']))
      .max(4),
    readiness: watchmanReadinessSchema.nullable(),
    error: z.string().max(2_000).nullable(),
    updated_at: timestampSchema,
  })
  .strict()
  .superRefine((attempt, context) => {
    if (new Set(attempt.completed_stages).size !== attempt.completed_stages.length) {
      context.addIssue({
        code: 'custom',
        path: ['completed_stages'],
        message: 'A setup stage may be completed only once.',
      });
    }
    if (
      attempt.status === 'ready' &&
      (!attempt.watchman_id ||
        attempt.completed_stages.length !== 4 ||
        attempt.readiness?.state !== 'ready')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'Ready setup requires all verified stages and readiness.',
      });
    }
  });
export type WatchmanSetupAttempt = z.infer<typeof watchmanSetupAttemptSchema>;

/** Goal identity remains execution authority; a conversation is only a presentation link. */
export const watchmanWorkSchema = z
  .object({
    execution: goalExecutionRefSchema,
    brand_id: z.string().uuid(),
    owner_watchman_id: z.string().uuid(),
    title: z.string().trim().min(1).max(300),
    objective: z.string().trim().min(1).max(8_000),
    status: goalWorkNodeStatusSchema,
    conversation_id: idSchema.nullable(),
    artifact_ids: z.array(idSchema).max(100),
    updated_at: timestampSchema,
  })
  .strict();
export type WatchmanWork = z.infer<typeof watchmanWorkSchema>;

export const watchmanContinuationSchema = z
  .object({
    execution: goalExecutionRefSchema,
    version: versionSchema,
    note_to_self: z.string().max(4_000).nullable(),
    pending_operation_ids: z.array(idSchema).max(100),
    pending_request_ids: z.array(idSchema).max(100),
    next_check_at: timestampSchema.nullable(),
    capability_state: z.record(z.string(), z.unknown()).optional(),
    evidence: z
      .array(z.lazy(() => watchmanMetricEvidenceSchema))
      .max(100)
      .optional(),
    evidence_truncated: z.boolean().optional(),
    proposal_decisions: z
      .array(
        z
          .object({
            id: idSchema,
            status: z.enum(['pending', 'approved', 'rejected', 'executed', 'failed', 'expired']),
            note: z.string().max(1_000).nullable(),
            receipt: z.lazy(() => watchmanExecutionReceiptSchema).optional(),
          })
          .strict(),
      )
      .max(50)
      .optional(),
    proposal_decisions_truncated: z.boolean().optional(),
    standing_task: z
      .object({
        task_id: z.string().uuid(),
        fired_for: timestampSchema,
        title: z.string().max(120),
        instruction: z.string().max(2_000),
        condition: z.record(z.string(), z.unknown()),
        observed: z.unknown(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type WatchmanContinuation = z.infer<typeof watchmanContinuationSchema>;

export const watchmanHandoffSchema = z
  .object({
    id: idSchema,
    source_execution: goalExecutionRefSchema,
    target_execution: goalExecutionRefSchema.nullable(),
    from_watchman_id: z.string().uuid(),
    to_watchman_id: z.string().uuid(),
    objective: z.string().trim().min(1).max(8_000),
    status: z.enum(['requested', 'accepted', 'declined', 'completed', 'cancelled']),
    version: versionSchema,
    created_at: timestampSchema,
  })
  .strict()
  .superRefine((handoff, context) => {
    if (handoff.from_watchman_id === handoff.to_watchman_id) {
      context.addIssue({
        code: 'custom',
        path: ['to_watchman_id'],
        message: 'A handoff must name another teammate.',
      });
    }
    if (
      handoff.target_execution &&
      handoff.target_execution.goalId !== handoff.source_execution.goalId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['target_execution'],
        message: 'A handoff retains the owning Goal.',
      });
    }
    if (
      (handoff.status === 'accepted' || handoff.status === 'completed') &&
      !handoff.target_execution
    ) {
      context.addIssue({
        code: 'custom',
        path: ['target_execution'],
        message: 'An accepted handoff requires durable target work.',
      });
    }
  });
export type WatchmanHandoff = z.infer<typeof watchmanHandoffSchema>;

const executionReceiptBaseSchema = z.object({
  operation_id: idSchema,
  execution: goalExecutionRefSchema.optional(),
});
/** A transport success or an enqueued job is never a verified business completion. */
export const watchmanExecutionReceiptSchema = z.discriminatedUnion('status', [
  executionReceiptBaseSchema
    .extend({ status: z.literal('refused'), code: idSchema, reason: z.string().min(1).max(2_000) })
    .strict(),
  executionReceiptBaseSchema
    .extend({ status: z.literal('queued'), external_job_id: idSchema })
    .strict(),
  executionReceiptBaseSchema
    .extend({ status: z.literal('running'), external_job_id: idSchema })
    .strict(),
  executionReceiptBaseSchema
    .extend({
      status: z.literal('completed'),
      verified_at: timestampSchema,
      artifact_ids: z.array(idSchema).max(100),
    })
    .strict(),
  executionReceiptBaseSchema
    .extend({ status: z.literal('failed'), code: idSchema, reason: z.string().min(1).max(2_000) })
    .strict(),
  executionReceiptBaseSchema
    .extend({ status: z.literal('unknown'), reason: z.string().min(1).max(2_000) })
    .strict(),
]);
export type WatchmanExecutionReceipt = z.infer<typeof watchmanExecutionReceiptSchema>;

/** Immutable approval identity. The server still rechecks authority and claims the effect. */
export const watchmanEffectBindingSchema = z
  .object({
    operation_id: idSchema,
    proposal_id: z.string().uuid(),
    brand_id: z.string().uuid(),
    watchman_id: z.string().uuid(),
    tool: z.string().min(1).max(80),
    input_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    target: z.object({ kind: idSchema, id: idSchema, version: idSchema }).strict(),
    max_usd: z.number().nonnegative().nullable(),
    expires_at: timestampSchema,
    version: versionSchema,
  })
  .strict();
export type WatchmanEffectBinding = z.infer<typeof watchmanEffectBindingSchema>;

export const watchmanMetricEvidenceSchema = z
  .object({
    id: idSchema,
    provider: idSchema,
    account_id: idSchema,
    entity_type: idSchema,
    entity_id: idSchema,
    metric: idSchema,
    unit: z.enum(['count', 'currency', 'ratio', 'percent', 'seconds']),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    value: z.number(),
    period: z.object({ start: timestampSchema, end: timestampSchema }).strict(),
    captured_at: timestampSchema,
  })
  .strict()
  .superRefine((evidence, context) => {
    if (Date.parse(evidence.period.start) > Date.parse(evidence.period.end)) {
      context.addIssue({
        code: 'custom',
        path: ['period'],
        message: 'An evidence period must be ordered.',
      });
    }
    if ((evidence.unit === 'currency') !== (evidence.currency !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['currency'],
        message: 'Currency units require a currency; other units carry none.',
      });
    }
  });
export type WatchmanMetricEvidence = z.infer<typeof watchmanMetricEvidenceSchema>;

/** A claim names its evidence and comparison operands; numerical validation is an execution concern. */
export const watchmanEvidenceClaimSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('value'), evidence_id: idSchema, text: z.string().min(1).max(2_000) })
    .strict(),
  z
    .object({
      kind: z.literal('comparison'),
      baseline_evidence_id: idSchema,
      current_evidence_id: idSchema,
      absolute_change: z.number(),
      /** Signed (current - baseline) / baseline, as a fraction; null when baseline is zero. */
      relative_change: z.number().nullable(),
      text: z.string().min(1).max(2_000),
    })
    .strict(),
]);
export type WatchmanEvidenceClaim = z.infer<typeof watchmanEvidenceClaimSchema>;

const metricIdentity = (evidence: WatchmanMetricEvidence): string =>
  JSON.stringify([
    evidence.provider,
    evidence.account_id,
    evidence.entity_type,
    evidence.entity_id,
    evidence.metric,
    evidence.unit,
    evidence.currency,
  ]);

const evidenceIdentity = (evidence: WatchmanMetricEvidence): string =>
  JSON.stringify([
    metricIdentity(evidence),
    evidence.value,
    evidence.period.start,
    evidence.period.end,
    evidence.captured_at,
  ]);

/** Roundoff tolerance only: this does not permit rounded, swapped or unsigned report figures. */
const sameComputedNumber = (actual: number, expected: number): boolean =>
  Number.isFinite(actual) &&
  Number.isFinite(expected) &&
  Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected));

/**
 * Validate structured claims against evidence observed by the execution boundary.
 * `text` is untrusted presentation: callers render values from validated operands,
 * and must not treat this result as validation of free-form prose.
 */
export const validateWatchmanEvidenceClaims = (
  observed: readonly WatchmanMetricEvidence[],
  submitted: readonly WatchmanMetricEvidence[],
  claims: readonly WatchmanEvidenceClaim[],
): string[] => {
  const errors = new Set<string>();
  const observedById = new Map<string, WatchmanMetricEvidence>();
  const submittedById = new Map<string, WatchmanMetricEvidence>();
  for (const evidence of observed) {
    const existing = observedById.get(evidence.id);
    if (existing && evidenceIdentity(existing) !== evidenceIdentity(evidence)) {
      errors.add(`evidence_conflict:${evidence.id}`);
    }
    observedById.set(evidence.id, evidence);
  }
  for (const evidence of submitted) {
    const existing = submittedById.get(evidence.id);
    if (existing && evidenceIdentity(existing) !== evidenceIdentity(evidence)) {
      errors.add(`evidence_conflict:${evidence.id}`);
    }
    submittedById.set(evidence.id, evidence);
    const source = observedById.get(evidence.id);
    if (!source) errors.add(`evidence_unobserved:${evidence.id}`);
    else if (evidenceIdentity(source) !== evidenceIdentity(evidence)) {
      errors.add(`evidence_mismatch:${evidence.id}`);
    }
  }
  for (const claim of claims) {
    if (claim.kind === 'value') {
      if (!submittedById.has(claim.evidence_id))
        errors.add(`claim_evidence_missing:${claim.evidence_id}`);
      continue;
    }
    const baseline = submittedById.get(claim.baseline_evidence_id);
    const current = submittedById.get(claim.current_evidence_id);
    if (!baseline) errors.add(`claim_evidence_missing:${claim.baseline_evidence_id}`);
    if (!current) errors.add(`claim_evidence_missing:${claim.current_evidence_id}`);
    if (!baseline || !current) continue;
    if (metricIdentity(baseline) !== metricIdentity(current)) {
      errors.add(`comparison_metric_mismatch:${claim.current_evidence_id}`);
    }
    if (
      baseline.id === current.id ||
      Date.parse(baseline.period.end) > Date.parse(current.period.start)
    ) {
      errors.add(`comparison_period_mismatch:${claim.current_evidence_id}`);
    }
    const absolute = current.value - baseline.value;
    if (!sameComputedNumber(claim.absolute_change, absolute)) {
      errors.add(`comparison_absolute_mismatch:${claim.current_evidence_id}`);
    }
    if (
      baseline.value === 0
        ? claim.relative_change !== null
        : claim.relative_change === null ||
          !sameComputedNumber(claim.relative_change, absolute / baseline.value)
    ) {
      errors.add(`comparison_relative_mismatch:${claim.current_evidence_id}`);
    }
  }
  return [...errors];
};

const conversationEventBaseSchema = z.object({
  id: idSchema,
  brand_id: z.string().uuid(),
  conversation_id: idSchema,
  watchman_id: z.string().uuid(),
  sequence: z.number().int().positive(),
  execution: goalExecutionRefSchema.nullable(),
  created_at: timestampSchema,
});
export const watchmanConversationEventSchema = z.discriminatedUnion('type', [
  conversationEventBaseSchema
    .extend({
      type: z.literal('message'),
      actor: z.enum(['person', 'watchman']),
      text: z.string().min(1).max(20_000),
    })
    .strict(),
  conversationEventBaseSchema
    .extend({
      type: z.literal('question'),
      request_id: idSchema,
      question: z.string().min(1).max(4_000),
      options: z.array(z.string().min(1).max(500)).max(10),
      status: z.enum(['open', 'resolved', 'cancelled', 'expired']),
    })
    .strict(),
  conversationEventBaseSchema
    .extend({
      type: z.literal('decision'),
      request_id: idSchema,
      value: z.string().min(1).max(4_000),
      decided_by: z.string().uuid(),
    })
    .strict(),
  conversationEventBaseSchema
    .extend({ type: z.literal('handoff'), handoff: watchmanHandoffSchema })
    .strict(),
  conversationEventBaseSchema
    .extend({ type: z.literal('operation'), receipt: watchmanExecutionReceiptSchema })
    .strict(),
]);
export type WatchmanConversationEvent = z.infer<typeof watchmanConversationEventSchema>;

const uiBlockBaseSchema = z.object({ id: idSchema });
/** Generative UI selects trusted components and bounded data, never generated JavaScript or HTML. */
export const watchmanUiBlockSchema = z.discriminatedUnion('type', [
  uiBlockBaseSchema
    .extend({ type: z.literal('text'), text: z.string().min(1).max(20_000) })
    .strict(),
  uiBlockBaseSchema.extend({ type: z.literal('work'), work: watchmanWorkSchema }).strict(),
  uiBlockBaseSchema
    .extend({
      type: z.literal('report'),
      report_id: idSchema,
      title: z.string().min(1).max(200),
      body_md: z.string().min(1).max(20_000),
      evidence_ids: z.array(idSchema).max(100),
    })
    .strict(),
  uiBlockBaseSchema
    .extend({ type: z.literal('evidence'), evidence: watchmanMetricEvidenceSchema })
    .strict(),
  uiBlockBaseSchema
    .extend({
      type: z.literal('approval'),
      proposal_id: z.string().uuid(),
      operation_id: idSchema,
      version: versionSchema,
      summary: z.string().min(1).max(1_000),
      facts: z
        .array(
          z
            .object({ label: z.string().min(1).max(100), value: z.string().min(1).max(1_000) })
            .strict(),
        )
        .min(1)
        .max(20),
      expires_at: timestampSchema,
    })
    .strict(),
  uiBlockBaseSchema
    .extend({
      type: z.literal('question'),
      request_id: idSchema,
      version: versionSchema,
      question: z.string().min(1).max(4_000),
      options: z
        .array(z.object({ value: idSchema, label: z.string().min(1).max(500) }).strict())
        .max(50),
    })
    .strict(),
]);
export type WatchmanUiBlock = z.infer<typeof watchmanUiBlockSchema>;

export const watchmanUiMessageSchema = z
  .object({
    id: idSchema,
    conversation_id: idSchema,
    watchman_id: z.string().uuid(),
    sequence: z.number().int().positive(),
    created_at: timestampSchema,
    blocks: z.array(watchmanUiBlockSchema).min(1).max(20),
  })
  .strict();
export type WatchmanUiMessage = z.infer<typeof watchmanUiMessageSchema>;

/** User gestures carry immutable IDs and expected versions; the server resolves actual permissions. */
export const watchmanUiActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open_work'), execution: goalExecutionRefSchema }).strict(),
  z
    .object({
      type: z.literal('reply'),
      conversation_id: idSchema,
      text: z.string().trim().min(1).max(8_000),
    })
    .strict(),
  z
    .object({
      type: z.literal('decide_approval'),
      proposal_id: z.string().uuid(),
      operation_id: idSchema,
      expected_version: versionSchema,
      decision: z.enum(['approve', 'reject']),
      note: z.string().max(1_000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('resolve_question'),
      request_id: idSchema,
      expected_version: versionSchema,
      value: z.string().trim().min(1).max(4_000),
    })
    .strict(),
]);
export type WatchmanUiAction = z.infer<typeof watchmanUiActionSchema>;

export const WATCHMAN_INTERACTION_ROUTE = '/api/watchman/interaction';
export const watchmanInteractionRequestSchema = z
  .object({
    brand_id: z.string().uuid(),
    watchman_id: z.string().uuid(),
    conversation_id: idSchema,
    request_id: z.string().uuid(),
    message: z.string().trim().min(1).max(8_000).optional(),
    action: watchmanUiActionSchema.optional(),
  })
  .strict()
  .refine((request) => (request.message === undefined) !== (request.action === undefined), {
    message: 'Provide exactly one message or UI action.',
  });
export type WatchmanInteractionRequest = z.infer<typeof watchmanInteractionRequestSchema>;
