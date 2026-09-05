/**
 * Wire payloads for Jaina's human-in-the-loop tool approvals and the paid campaign
 * scaffolding lifecycle. The frame TYPES live in `./jaina` (JainaForwardableType);
 * this file carries the `event.data` shapes for those six types.
 *
 * These are WIRE DTOs and are deliberately LOOSE (`.passthrough()`, few refinements).
 * A Backend that learns to send one more field must never break an older Frontend
 * mid-deploy; narrowing happens on the Frontend where the value is actually rendered.
 *
 * SECURITY — the HMAC signature is NEVER put on the wire.
 * `jainaToolApprovalRequiredPayloadSchema` intentionally has no `signature` field.
 * An approval is authorized server-side by re-deriving the HMAC over
 * (approvalId, toolCallId, toolName, input, expiresAt) from the server-held secret;
 * shipping the signature to the client would let a client mint its own approvals,
 * which is the entire threat model this gate exists to stop. If you find yourself
 * adding `signature` here, the design has gone wrong.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Tool approval frames (shared mental model with Organic, which already emits
// 'tool.approval_required' and 'tool.output_denied' with these field names).
// ---------------------------------------------------------------------------

/** data shape for type: "tool.approval_required". NO `signature` — see file header. */
export const jainaToolApprovalRequiredPayloadSchema = z
  .object({
    approvalId: z.string(),
    toolCallId: z.string(),
    toolName: z.string(),
    /** The tool arguments as the model proposed them, already secret-redacted for the wire. */
    input: z.unknown(),
    /** ISO timestamp after which the approval can no longer be redeemed. */
    expiresAt: z.string(),
  })
  .passthrough();
export type JainaToolApprovalRequiredPayload = z.infer<
  typeof jainaToolApprovalRequiredPayloadSchema
>;

/** data shape for type: "tool.approval_resolved". */
export const jainaToolApprovalResolvedPayloadSchema = z
  .object({
    approvalId: z.string(),
    toolCallId: z.string(),
    toolName: z.string().optional(),
    decision: z.enum(['approved', 'denied']),
    /** ISO timestamp of the resolution. */
    resolvedAt: z.string().optional(),
    /** Who resolved it — a user id, or 'system' when an expiry auto-denied it. */
    resolvedBy: z.string().nullable().optional(),
    /** Free-text reason, primarily for denials and expiries. */
    reason: z.string().nullable().optional(),
  })
  .passthrough();
export type JainaToolApprovalResolvedPayload = z.infer<
  typeof jainaToolApprovalResolvedPayloadSchema
>;

/** data shape for type: "tool.output_denied" — the tool did not run; nothing was written. */
export const jainaToolOutputDeniedPayloadSchema = z
  .object({
    toolCallId: z.string(),
    toolName: z.string(),
    approvalId: z.string().optional(),
    reason: z.string().nullable().optional(),
  })
  .passthrough();
export type JainaToolOutputDeniedPayload = z.infer<typeof jainaToolOutputDeniedPayloadSchema>;

// ---------------------------------------------------------------------------
// Paid campaign scaffolding frames
// ---------------------------------------------------------------------------

/** The three human-in-the-loop gates, in the order the database enforces. */
export const paidScaffoldGateSchema = z.enum(['build', 'populate', 'activate']);
export type PaidScaffoldGate = z.infer<typeof paidScaffoldGateSchema>;

/**
 * `scaffoldId` ON EVERY `paid.scaffold_*` PAYLOAD IS `paid_scaffold_versions.id`.
 *
 * Not `paid_scaffolds.id`. The version is the unit of approval, the unit of the
 * content hash, the foreign key nodes are stored under, and the only id every emit
 * site provably holds — including a refusal, which fires before the plan is read.
 * The parent scaffold rides along on the proposal frame only, as `parentScaffoldId`,
 * so a Frontend can query nodes with one `eq('version_id', scaffoldId)` and no
 * second hop through `current_version_id`.
 */

/**
 * data shape for type: "paid.scaffold_proposed" — what the agent intends to create,
 * before anything is written to the ad platform. `plan` stays unstructured here on
 * purpose: the scaffold plan's own schema lives in the paid contracts and evolves on
 * its own cadence; pinning its shape at the wire boundary would couple the two.
 *
 * THE TREE DOES NOT TRAVEL ON THE WIRE. `plan` carries ids, counts and a
 * campaign-level skeleton; the nodes themselves are inlined only for a small
 * scaffold and are marked `truncated` otherwise. Two reasons, both load-bearing:
 * every frame is written twice (socket + a durable run-event row re-read on every
 * replay), and a node's `status`/`meta_object_id` mutate during each gate, so a tree
 * copied into the frame is stale the moment a build starts. The Frontend reads
 * `brand_profiles.paid_scaffold_nodes`, which RLS already grants to brand members.
 */
export const paidScaffoldProposedPayloadSchema = z
  .object({
    /** `paid_scaffold_versions.id` — see the note above. */
    scaffoldId: z.string(),
    /** `paid_scaffolds.id`, the mutable parent the versions hang off. */
    parentScaffoldId: z.string().optional(),
    brandId: z.string().optional(),
    adAccountId: z.string().nullable().optional(),
    /** The proposed campaign → ad set → ad tree. Narrowed on the Frontend. */
    plan: z.unknown(),
    /** Present when this proposal is gated behind a HITL approval. */
    approvalId: z.string().nullable().optional(),
    /** Counts for a one-line summary without walking `plan`. */
    summary: z
      .object({
        campaigns: z.number().optional(),
        adSets: z.number().optional(),
        ads: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type PaidScaffoldProposedPayload = z.infer<typeof paidScaffoldProposedPayloadSchema>;

/** data shape for type: "paid.scaffold_progress" — one step of the scaffolding run. */
export const paidScaffoldProgressPayloadSchema = z
  .object({
    scaffoldId: z.string(),
    /**
     * The node this step touched, as `paid_scaffold_nodes.path_key` ('c0', 'c0/a1',
     * 'c0/a1/ad2'). THIS IS THE ONLY STABLE ROW IDENTITY ON A PROGRESS FRAME, and it
     * is what lets a table update one row in place. `entityId` cannot serve: it is
     * the platform id, so it is null until the object exists. `index` cannot serve
     * either: it is a walk ordinal, and a client that sorts or filters no longer has
     * rows in walk order. Optional only because a gate-level phase (claimed, refused,
     * completed) touches no single node.
     */
    pathKey: z.string().optional(),
    /** Which level of the tree this step touched. */
    step: z.string(),
    status: z.enum(['started', 'succeeded', 'failed', 'skipped']),
    /** 1-based position and total, when the run knows them. */
    index: z.number().optional(),
    total: z.number().optional(),
    /** Platform id of the entity this step created, once it exists. */
    entityId: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
  })
  .passthrough();
export type PaidScaffoldProgressPayload = z.infer<typeof paidScaffoldProgressPayloadSchema>;

/**
 * data shape for type: "paid.scaffold_receipt" — the terminal record of what was
 * actually created. Everything scaffolded is created PAUSED; `status: 'partial'`
 * means some entities exist and some do not, and the ids below are the only record
 * of which.
 */
export const paidScaffoldReceiptPayloadSchema = z
  .object({
    scaffoldId: z.string(),
    status: z.enum(['completed', 'partial', 'failed']),
    created: z
      .object({
        campaignIds: z.array(z.string()).optional(),
        adSetIds: z.array(z.string()).optional(),
        adIds: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    errors: z
      .array(
        z
          .object({
            step: z.string().optional(),
            message: z.string(),
          })
          .passthrough(),
      )
      .optional(),
    completedAt: z.string().optional(),
  })
  .passthrough();
export type PaidScaffoldReceiptPayload = z.infer<typeof paidScaffoldReceiptPayloadSchema>;

// ---------------------------------------------------------------------------
// The human's answer, travelling the other way
// ---------------------------------------------------------------------------

/**
 * A human's decision on one `tool.approval_required`, carried as a typed field on
 * the EXISTING chat stream POST body — the sibling of `plan_action`. There is no
 * fifth endpoint, and there is no natural-language re-prompt: an approval expressed
 * as an English sentence containing a token is a string the model can also write.
 *
 * SECURITY — this deliberately carries no approval token, no HMAC signature and no
 * content hash. All three are re-read server-side from the gate row keyed by
 * (scaffold_version_id, gate). A client that could supply any of them could mint its
 * own approval, which is precisely what the gate exists to prevent. The gate row is
 * the authority; the SDK's signature is only a cheap second layer inside `execute`.
 */
export const jainaScaffoldActionSchema = z.object({
  decision: z.enum(['approve', 'deny']),
  /** The SDK approval id from the `tool.approval_required` frame being answered. */
  approval_id: z.string().min(1),
  /** `paid_scaffold_versions.id`. With `gate`, this is the gate row's unique key. */
  scaffold_version_id: z.string().uuid(),
  gate: paidScaffoldGateSchema,
  /** Echoed back for correlation only; never trusted for authorization. */
  tool_call_id: z.string().min(1).optional(),
  reason: z.string().max(500).optional(),
});
export type JainaScaffoldAction = z.infer<typeof jainaScaffoldActionSchema>;

/**
 * A human's decision on one `tool.approval_required` raised by any OTHER gated tool
 * (audience-group publish, and every gate registered after it). Same channel as
 * `scaffold_action`: a typed field on the existing chat stream POST body, never a
 * natural-language re-prompt.
 *
 * SECURITY — this deliberately carries no approval token, no HMAC signature and no
 * content hash. All three are re-read server-side from the gate row keyed by
 * `approval_id`. A client that could supply any of them could mint its own approval,
 * which is precisely what the gate exists to prevent. The gate row is the authority;
 * the SDK's signature is only a cheap second layer inside `execute`.
 */
export const jainaToolActionSchema = z.object({
  decision: z.enum(['approve', 'deny']),
  /** The SDK approval id from the `tool.approval_required` frame being answered. */
  approval_id: z.string().min(1),
  /** Echoed back for correlation only; never trusted for authorization. */
  tool_call_id: z.string().min(1).optional(),
  reason: z.string().max(500).optional(),
});
export type JainaToolAction = z.infer<typeof jainaToolActionSchema>;
