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
  })
  .passthrough();
export type LiveChangePreviewPayload = z.infer<typeof liveChangePreviewPayloadSchema>;

export function liveChangePreviewPartId(approvalId: string): string {
  return `live-change:${approvalId}`;
}
