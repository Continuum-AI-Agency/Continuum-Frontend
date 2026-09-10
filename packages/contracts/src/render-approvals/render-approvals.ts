import { z } from 'zod';

/**
 * The human approval gate between a finished render and a Meta ad.
 *
 * `delivery_config.notify_for_approval` (NocoBase, per environment) parks a
 * built delivery batch instead of publishing it. The plugin sends the batch
 * here; Continuum shows it to a person in Slack and on the Forge page; the
 * verdict goes back to the plugin, which publishes the batch it parked.
 *
 * Three shapes cross three boundaries: plugin → backend (request), backend →
 * Frontend (record), and Frontend/Slack → backend (decision).
 */

/**
 * Never the Meta access token. The plugin strips it before it leaves the
 * workspace and re-resolves it from `brand_id` when someone approves, so the
 * credential is neither in flight here nor at rest in Continuum.
 */
export const renderApprovalFileSchema = z
  .object({
    url: z.string().url(),
    adCopy: z.string().nullable().default(null),
    adStatus: z.string().nullable().default(null),
    landingUrl: z.string().nullable().default(null),
  })
  .strict();
export type RenderApprovalFile = z.infer<typeof renderApprovalFileSchema>;

/**
 * `pending` is the state this whole feature exists to create.
 * `previewed` is an approval whose Meta writes were refused (a dry run, or
 * META_WRITES_ALLOWED unset) — a real outcome, not a failure and not a publish.
 * `rejected` is terminal and stays listed: the Forge page shows who said no.
 */
export const renderApprovalStatusSchema = z.enum([
  'pending',
  'approved',
  'published',
  'previewed',
  'rejected',
  'failed',
  'expired',
]);
export type RenderApprovalStatus = z.infer<typeof renderApprovalStatusSchema>;

/** What the NocoBase plugin POSTs to `/api/internal/render-approvals`. */
export const renderApprovalRequestSchema = z
  .object({
    // The environment the plugin is installed in. `picinst` is the sub-app and
    // the routing key; environmentKey/clientKey are the operator-facing scopes.
    picinst: z.string().min(1),
    environmentKey: z.string().nullable().default(null),
    clientKey: z.string().nullable().default(null),
    brandId: z.string().uuid(),
    taskUid: z.string().min(1),
    // Unique per batch. A split render produces several batches sharing one
    // taskUid, and each is approved separately — a reviewer looking at 32 files
    // at once cannot say "the 9:16s are wrong".
    batchId: z.string().min(1),
    groupKey: z.string().nullable().default(null),
    action: z.enum(['create', 'replace']).default('create'),
    campaignId: z.string().nullable().default(null),
    adsetId: z.string().nullable().default(null),
    adId: z.string().nullable().default(null),
    // Per-environment destination. Null falls back to the one default channel.
    approvalChannelId: z.string().nullable().default(null),
    files: z.array(renderApprovalFileSchema).min(1),
  })
  .strict();
export type RenderApprovalRequest = z.infer<typeof renderApprovalRequestSchema>;

/** One pending batch, as the Forge page and the Slack card read it. */
export const renderApprovalSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    picinst: z.string().min(1),
    environmentKey: z.string().nullable(),
    taskUid: z.string(),
    batchId: z.string(),
    groupKey: z.string().nullable(),
    action: z.enum(['create', 'replace']),
    campaignId: z.string().nullable(),
    adsetId: z.string().nullable(),
    adId: z.string().nullable(),
    files: z.array(renderApprovalFileSchema),
    status: renderApprovalStatusSchema,
    // Who decided, in Continuum's terms. Stamped explicitly by the service: a
    // Slack button click carries no Supabase JWT, so `auth.uid()` would record
    // nobody.
    decidedBy: z.string().uuid().nullable(),
    decidedByName: z.string().nullable(),
    decidedAt: z.string().nullable(),
    decisionReason: z.string().nullable(),
    // Meta receipts, echoed back by the plugin after it publishes.
    deliveryReceipts: z.array(z.record(z.string(), z.unknown())).default([]),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type RenderApproval = z.infer<typeof renderApprovalSchema>;

export const renderApprovalListResponseSchema = z
  .object({ approvals: z.array(renderApprovalSchema) })
  .strict();
export type RenderApprovalListResponse = z.infer<typeof renderApprovalListResponseSchema>;

export const renderApprovalDecisionSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().max(2_000).nullable().default(null),
  })
  .strict();
export type RenderApprovalDecision = z.infer<typeof renderApprovalDecisionSchema>;

export const renderApprovalDecisionResponseSchema = z
  .object({
    approval: renderApprovalSchema,
    // What the plugin reported back. `previewed` means approved-but-refused.
    deliveryStatus: z.string().nullable().default(null),
    deliveryReason: z.string().nullable().default(null),
  })
  .strict();
export type RenderApprovalDecisionResponse = z.infer<typeof renderApprovalDecisionResponseSchema>;

/**
 * The Slack button `value`. Short on purpose: Telegram caps callback data at 64
 * bytes and Discord's custom_id at 100, and this card should stay portable.
 *
 * The hash is a fence, not a secret — it is the same guard `computePublishIntentHash`
 * puts on the organic publish card. A batch edited or decided between the card
 * being posted and the button being pressed is refused rather than acted on.
 */
export const buildRenderApprovalActionValue = (approvalId: string, batchFingerprint: string): string =>
  `${approvalId}|${batchFingerprint.slice(0, 8)}`;

export const parseRenderApprovalActionValue = (
  value: string | null,
): { approvalId: string; fingerprint: string } | null => {
  const [approvalId, fingerprint] = (value ?? '').split('|');
  if (!approvalId || !fingerprint) return null;
  return { approvalId, fingerprint };
};
