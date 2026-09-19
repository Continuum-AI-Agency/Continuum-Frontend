import { z } from 'zod';

/**
 * The cross-agent approvals ledger (`brand_profiles.approvals`): one row per thing waiting on a
 * person, whatever agent asked. A row's id is its subject's id, so an id a client already holds —
 * a Forge render approval's, say — is the id it decides here.
 */
export const APPROVALS_DECISIONS_ROUTE = '/api/approvals/decisions';

/** Which feature owns the subject. Widened as each feature's table starts feeding the ledger. */
export const approvalKindSchema = z.enum(['forge_render']);
export type ApprovalKind = z.infer<typeof approvalKindSchema>;

export const APPROVAL_BATCH_MAX = 100;

/**
 * Decide several approvals at once. Explicit ids, never "everything pending": the batch is
 * exactly what the reviewer saw, so an item that arrived after the page loaded is not approved
 * by a click that never showed it.
 */
export const approvalBatchDecisionRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    ids: z.array(z.string().uuid()).min(1).max(APPROVAL_BATCH_MAX),
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().max(500).nullable().default(null),
  })
  .strict();
export type ApprovalBatchDecisionRequest = z.infer<typeof approvalBatchDecisionRequestSchema>;

export const approvalBatchOutcomeSchema = z.enum([
  'decided',
  'already_decided',
  'not_found',
  'refused',
]);
export type ApprovalBatchOutcome = z.infer<typeof approvalBatchOutcomeSchema>;

export const approvalBatchDecisionResponseSchema = z
  .object({
    results: z.array(
      z
        .object({
          id: z.string().uuid(),
          outcome: approvalBatchOutcomeSchema,
          /** The sentence to show for anything other than `decided`. */
          error: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type ApprovalBatchDecisionResponse = z.infer<typeof approvalBatchDecisionResponseSchema>;
