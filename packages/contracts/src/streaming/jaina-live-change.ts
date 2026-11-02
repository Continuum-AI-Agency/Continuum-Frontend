/**
 * Wire payload for `paid.live_change_preview` — the LIVE campaign a pending Jaina edit
 * touches, read from Meta, with the change marked on the node it lands on. It rides beside a
 * `tool.approval_required` frame (pause, budget, batch, placements, duplicate …) so the
 * Scale page's companion canvas opens on the campaign being changed, the same way it opens on
 * a proposed scaffold (Ramiro, 2026-10-30: "siempre que le pedimos un cambio … que se abra la
 * ventanita de Canva").
 *
 * READ-ONLY PREVIEW. The approval stays on the chat card; nothing in this payload is ever
 * written back, so it carries no signature, no input and nothing the gate verifies. The marks
 * come from the same proposed input the card's rows come from, and the tree from one bounded
 * read of the campaign, so a stale or failed read costs the picture, never the approval: the
 * Backend emits no frame at all when the read fails.
 *
 * WIRE DTO policy of ./jaina-scaffold: `.passthrough()`, so a Backend that learns one more
 * field never breaks an older Frontend mid-deploy.
 */

import { z } from 'zod';
import { changeProjectionPlatformSchema, changeProjectionSchema } from './jaina-change-projection';
import { jainaToolActionSchema } from './jaina-scaffold';

export const LIVE_CHANGE_PREVIEW_FRAME_TYPE = 'paid.live_change_preview' as const;

/** The most nodes one preview carries; a bigger account is cut and says so (`truncated`). */
export const LIVE_CHANGE_PREVIEW_NODE_LIMIT = 300;

/**
 * What the pending change does to a node. `paused` covers archive too (it stops delivering);
 * `added` is a new PAUSED object the approval would create (a copy, new placements);
 * `unchanged` is drawn dimmed so the change stands out.
 */
export const LIVE_CHANGE_MARKS = ['changed', 'added', 'paused', 'unchanged'] as const;
export const liveChangeMarkSchema = z.enum(LIVE_CHANGE_MARKS);
export type LiveChangeMark = z.infer<typeof liveChangeMarkSchema>;

const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const liveChangeRowSchema = z.object({
  field: z.string(),
  before: scalarSchema,
  after: scalarSchema,
});
export type LiveChangeRow = z.infer<typeof liveChangeRowSchema>;

export const liveChangeNodeSchema = z
  .object({
    /** The Meta id; an `added` node that does not exist yet has `new:<n>`. */
    id: z.string().min(1),
    parentId: z.string().nullable(),
    level: z.enum(['campaign', 'adset', 'ad']),
    name: z.string(),
    /** As read from Meta (effective_status when present); null on an `added` node. */
    status: z.string().nullable(),
    dailyBudgetMinor: z.number().nullable(),
    mark: liveChangeMarkSchema,
    changes: z.array(liveChangeRowSchema),
    /** An `added` node: the live node it is copied from. */
    basedOnId: z.string().nullable(),
  })
  .passthrough();
export type LiveChangeNode = z.infer<typeof liveChangeNodeSchema>;

/** data shape for type: "paid.live_change_preview". */
export const liveChangePreviewPayloadSchema = z
  .object({
    approvalId: z.string().min(1),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    /** `liveChangePreviewPartId(approvalId)`: one part per approval. */
    partId: z.string().min(1),
    /** The card's own header, so the canvas names the same change. */
    subject: z.string().nullable(),
    currency: z.string().nullable(),
    /** Campaign nodes first, then ad sets, then ads; parent before child. */
    nodes: z.array(liveChangeNodeSchema).max(LIVE_CHANGE_PREVIEW_NODE_LIMIT),
    truncated: z.boolean(),
    counts: z.object({
      changed: z.number().int().nonnegative(),
      added: z.number().int().nonnegative(),
      paused: z.number().int().nonnegative(),
    }),
    /** ISO time of the Meta read the tree reflects. */
    readAt: z.string(),
    /**
     * `approval`: beside a pending gated edit (the default, and what a payload from before this
     * field means). `proposal`: Jaina proposed a change in the answer and called no gated tool,
     * so there is nothing to approve here and the canvas says "proposal", not "pending".
     */
    origin: z.enum(['approval', 'proposal']).optional(),
    /** Which platform the tree is from; absent means Meta, the only one before this field. */
    platform: changeProjectionPlatformSchema.optional(),
    /** The projected after of the change: table figures, assumptions, window (./jaina-change-projection). */
    projection: changeProjectionSchema.nullable().optional(),
  })
  .passthrough();
export type LiveChangePreviewPayload = z.infer<typeof liveChangePreviewPayloadSchema>;

export function liveChangePreviewPartId(approvalId: string): string {
  return `live-change:${approvalId}`;
}

/**
 * Confirming from the canvas IS the approval card's decision: the same `jainaToolActionSchema`
 * the chat card sends (approval id and tool call id of the pending gated edit), so the gate,
 * the approval record, the Optimizer ledger and the Activity log are the ones the card uses.
 * The canvas owns no write path of its own.
 */
export const liveChangeConfirmActionSchema = jainaToolActionSchema.pick({
  decision: true,
  approval_id: true,
  tool_call_id: true,
});
export type LiveChangeConfirmAction = z.infer<typeof liveChangeConfirmActionSchema>;

/** A preview beside a pending gated edit can be confirmed; a proposal has no approval yet. */
export function canConfirmLiveChange(preview: Pick<LiveChangePreviewPayload, 'origin'>): boolean {
  return preview.origin !== 'proposal';
}

export function liveChangeConfirmActionOf(
  preview: Pick<LiveChangePreviewPayload, 'approvalId' | 'toolCallId'>,
  decision: LiveChangeConfirmAction['decision'],
): LiveChangeConfirmAction {
  return liveChangeConfirmActionSchema.parse({
    decision,
    approval_id: preview.approvalId,
    tool_call_id: preview.toolCallId,
  });
}
