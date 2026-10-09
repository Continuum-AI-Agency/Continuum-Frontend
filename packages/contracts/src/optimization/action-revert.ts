// Undo one applied platform action (Google today): the envelope between the browser, the
// optimizer-apply-action-revert edge and the service's POST /apply/actions/revert.
//
// An undo names the apply_audits row of the write it undoes and nothing else: the service
// reloads that row and its action_ledger row, refuses anything the ledger does not show as
// applied (or already undone), reads the live value and refuses a CONFLICT when it is no
// longer what the write left, then writes the recorded "before" back through the same
// validate_only → auto-apply gate → live mutate → read back path as any action. The undo's
// own apply_audits row points at the original through reverts_audit_id.
//
// Meta writes keep their own undo (optimizer-apply-revert → /apply/revert).
// Design: Continuum-Optimizer/src/multiplatform/actions/undo.ts.

import { z } from 'zod';
import { EntityRefSchema } from '../paid/platform';
import { BidTargetFieldSchema } from './action';

/** What the browser sends. `authorized_by` is never the browser's to name: the edge fills it
 *  with the signed-in person. */
export const ActionRevertRequestSchema = z
  .object({
    portfolio_id: z.string().uuid(),
    /** The apply_audits row of the applied write to undo (an /apply/actions leg's auditId). */
    audit_id: z.string().uuid(),
    /** Default true at the service: a preview checks every guard and writes nothing. */
    dryRun: z.boolean().optional(),
  })
  .strict();
export type ActionRevertRequest = z.infer<typeof ActionRevertRequestSchema>;

/** What the edge forwards to the service. */
export const ActionRevertServiceRequestSchema = z
  .object({
    portfolio_id: z.string().uuid(),
    audit_id: z.string().uuid(),
    authorized_by: z.string().uuid(),
    dryRun: z.boolean().default(true),
  })
  .strict();
export type ActionRevertServiceRequest = z.infer<typeof ActionRevertServiceRequestSchema>;

/**
 *  would_revert  preview: every guard passed and the platform's validate_only accepts the undo.
 *  reverted      the recorded before is back, read back by the platform.
 *  refused       nothing was written: the ledger does not show it applied, it was already
 *                undone, the platform or a guardrail refused it (reason names which).
 *  conflict      nothing was written: the live value is no longer what the write left — someone
 *                changed it since, and an undo would overwrite their change.
 *  failed        the undo was attempted and did not land; its failed audit row says why.
 */
export const ACTION_REVERT_STATUSES = [
  'would_revert',
  'reverted',
  'refused',
  'conflict',
  'failed',
] as const;
export const ActionRevertStatusSchema = z.enum(ACTION_REVERT_STATUSES);
export type ActionRevertStatus = z.infer<typeof ActionRevertStatusSchema>;

/** The undo-specific refusals. A refusal may also carry an ActionRefusal from the platform's
 *  preflight, 'auto_apply_enabled', or a ledger refusal (not_enrolled, action_not_allowed, …). */
export const ACTION_REVERT_REFUSALS = [
  'audit_not_found',
  'unsupported_platform',
  'is_a_revert',
  'not_applied',
  'move_leg',
  'already_reverted',
  'no_receipt',
  'unreadable_action',
] as const;

export const RevertableActionKindSchema = z.enum([
  'set_status',
  'set_budget',
  'set_bid_target',
  'add_negatives',
  'add_keyword',
]);

/** The value the undo puts back. */
export const RevertRestoresSchema = z.union([
  z.object({ minor: z.number().int().nonnegative(), currency: z.string() }).strict(),
  z.object({ status: z.enum(['active', 'paused']) }).strict(),
  z.object({ field: BidTargetFieldSchema, value: z.number().positive() }).strict(),
  /** A created keyword or negative is undone by removing the criteria the write created. */
  z.object({ removes: z.array(z.string().min(1)).min(1) }).strict(),
]);
export type RevertRestores = z.infer<typeof RevertRestoresSchema>;

export const ActionRevertResultSchema = z.object({
  status: ActionRevertStatusSchema,
  /** The write being undone. */
  audit_id: z.string().uuid(),
  /** The undo's own apply_audits row (applied or failed); null when nothing was attempted. */
  revert_audit_id: z.string().uuid().nullable(),
  kind: RevertableActionKindSchema.nullable(),
  ref: EntityRefSchema.nullable(),
  restores: RevertRestoresSchema.nullable(),
  reason: z.string().optional(),
  detail: z.string().optional(),
  /** The platform's receipt for the undo write (Google: request-id and resource names). */
  receipt: z.unknown().optional(),
});
export type ActionRevertResult = z.infer<typeof ActionRevertResultSchema>;

export const ActionRevertResponseSchema = z.object({
  ok: z.boolean(),
  dryRun: z.boolean(),
  runId: z.string().uuid(),
  result: ActionRevertResultSchema,
});
export type ActionRevertResponse = z.infer<typeof ActionRevertResponseSchema>;
