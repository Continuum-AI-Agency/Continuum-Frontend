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
 * `previewed` is an approval whose Meta writes were refused (a dry run, or a
 * brand that is not armed in Continuum) — a real outcome, not a failure and
 * not a publish.
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
    // The room the operator PREFERS, from the sub-app's own `delivery_config`. A preference, not
    // the room: the backend honours it when the brand has an active room with that `channel_id`,
    // and otherwise picks the brand's internal rooms. Kept even though nothing falls back to an
    // env default any more — this schema is `.strict()`, so dropping the key would 400 every
    // plugin POST.
    approvalChannelId: z.string().nullable().default(null),
    files: z.array(renderApprovalFileSchema).min(1),
  })
  .strict();
export type RenderApprovalRequest = z.infer<typeof renderApprovalRequestSchema>;

/** Where a decision was made. `system` is the reconciler expiring a batch nobody decided. */
export const renderApprovalDecidedViaSchema = z.enum(['forge', 'slack', 'whatsapp', 'system']);
export type RenderApprovalDecidedVia = z.infer<typeof renderApprovalDecidedViaSchema>;

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
    // The Forge package this batch belongs to. Null for a batch parked outside Forge, which
    // keeps the brand-access rule instead of the destination approver list.
    packageId: z.string().uuid().nullable().default(null),
    // Inherited from the package. A pending batch past it is expired and rejected.
    expiresAt: z.string().nullable().default(null),
    // The name every surface shows. A WhatsApp approver has no Continuum user behind it, so
    // `decidedByName` alone cannot say who decided.
    decidedByDisplayName: z.string().nullable().default(null),
    decidedVia: renderApprovalDecidedViaSchema.nullable().default(null),
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

/**
 * One Forge confirm of variations bound for Meta. Every render job the confirm created points at
 * it, every batch the plugin parks for those jobs inherits it, and it is shown to each of its
 * destinations as one header with a message per variation.
 */
export const renderApprovalPackageSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    createdBy: z.string().uuid().nullable(),
    destinationIds: z.array(z.string().uuid()),
    jobCount: z.number().int().positive(),
    label: z.string().nullable(),
    expiresAt: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type RenderApprovalPackage = z.infer<typeof renderApprovalPackageSchema>;

export const RENDER_APPROVER_PLATFORMS = ['slack', 'whatsapp'] as const;
export const destinationApproverPlatformSchema = z.enum(RENDER_APPROVER_PLATFORMS);
export type DestinationApproverPlatform = z.infer<typeof destinationApproverPlatformSchema>;

/**
 * `requested` counts for nothing: it is an unknown person who pressed a button or reacted, kept
 * so a brand admin can activate them. `revoked` is kept too, so a removed approver cannot
 * silently re-request.
 */
export const destinationApproverStatusSchema = z.enum(['requested', 'active', 'revoked']);
export type DestinationApproverStatus = z.infer<typeof destinationApproverStatusSchema>;

export const destinationApproverSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    destinationId: z.string().uuid(),
    userId: z.string().uuid().nullable(),
    platform: destinationApproverPlatformSchema,
    platformUserId: z.string().nullable(),
    // WhatsApp reports one person as a LID or a phone jid depending on their client.
    altPlatformUserId: z.string().nullable(),
    displayName: z.string().nullable(),
    status: destinationApproverStatusSchema,
    addedBy: z.string().uuid().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type DestinationApprover = z.infer<typeof destinationApproverSchema>;

export const destinationApproverListResponseSchema = z
  .object({ approvers: z.array(destinationApproverSchema) })
  .strict();
export type DestinationApproverListResponse = z.infer<typeof destinationApproverListResponseSchema>;

/** A brand admin adds an ACTIVE approver: a brand member by user id, or a platform id. */
export const addDestinationApproverRequestSchema = z
  .object({
    userId: z.string().uuid().optional(),
    platformUserId: z.string().trim().min(1).max(200).optional(),
    altPlatformUserId: z.string().trim().min(1).max(200).nullable().optional(),
    displayName: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.userId) !== Boolean(value.platformUserId), {
    message: 'Name the approver by exactly one of userId or platformUserId',
  });
export type AddDestinationApproverRequest = z.infer<typeof addDestinationApproverRequestSchema>;

/** Activate and revoke take no body; the approver id in the path is the whole request. */
export const destinationApproverTransitionRequestSchema = z.object({}).strict();
export type DestinationApproverTransitionRequest = z.infer<
  typeof destinationApproverTransitionRequestSchema
>;

export const destinationApproverResponseSchema = z
  .object({ approver: destinationApproverSchema })
  .strict();
export type DestinationApproverResponse = z.infer<typeof destinationApproverResponseSchema>;

/**
 * A room Forge can open an approval package in: the brand's active Slack and WhatsApp channel
 * destinations, with how many people can decide there today. Zero active approvers is shown, not
 * hidden — the room still receives the package, and its header is where the first approver asks.
 */
export const renderApprovalDestinationSchema = z
  .object({
    id: z.string().uuid(),
    platform: destinationApproverPlatformSchema,
    role: z.string(),
    name: z.string(),
    activeApprovers: z.number().int().nonnegative(),
    requestedApprovers: z.number().int().nonnegative(),
  })
  .strict();
export type RenderApprovalDestination = z.infer<typeof renderApprovalDestinationSchema>;

export const renderApprovalDestinationListResponseSchema = z
  .object({
    destinations: z.array(renderApprovalDestinationSchema),
    // Where this brand last asked for a package to be shown, intersected with the rooms still
    // active. `.optional()` because this response is `.strict()` and the Frontend parses it, so
    // the FRONTEND deploys before the Backend — the same rule as `workspaceName`.
    defaultDestinationIds: z.array(z.string().uuid()).optional(),
  })
  .strict();
export type RenderApprovalDestinationListResponse = z.infer<
  typeof renderApprovalDestinationListResponseSchema
>;

/**
 * SEAM B: what the WhatsApp approvals bot forwards for every reaction on a message it did not
 * send for a legacy batch.
 *
 * Deliberately NOT strict. The bot never retries a 4xx, so a field it adds later would turn
 * every reaction into a silently lost decision; unknown keys are stripped instead.
 */
export const whatsappReactionSchema = z.object({
  platform: z.literal('whatsapp'),
  channel_id: z.string().min(1),
  message_id: z.string().min(1),
  reactor_id: z.string().min(1),
  reactor_alt_id: z.string().min(1).nullable().default(null),
  reactor_name: z.string().nullable().default(null),
  emoji: z.string(),
  reacted_at: z.string(),
});
export type WhatsappReaction = z.infer<typeof whatsappReactionSchema>;

export const whatsappReactionOutcomeSchema = z.enum([
  'approved',
  'rejected',
  'ignored',
  'requested',
  'refused',
  'already_decided',
  'unknown_message',
]);
export type WhatsappReactionOutcome = z.infer<typeof whatsappReactionOutcomeSchema>;

export const whatsappReactionResponseSchema = z
  .object({ ok: z.literal(true), outcome: whatsappReactionOutcomeSchema })
  .strict();
export type WhatsappReactionResponse = z.infer<typeof whatsappReactionResponseSchema>;

/** 👍… approves and 👎… rejects, skin tones included; any other reaction is not a decision. */
export const classifyApprovalReaction = (emoji: string): 'approve' | 'reject' | null =>
  emoji.startsWith('👍') ? 'approve' : emoji.startsWith('👎') ? 'reject' : null;

/**
 * The value on a package's bulk and request-access buttons. The job count is a fence, like the
 * batch fingerprint: a package whose count moved since the header was posted refuses a bulk
 * decision rather than deciding a set the clicker never saw.
 */
export const buildRenderPackageActionValue = (packageId: string, jobCount: number): string =>
  `${packageId}|${jobCount}`;

export const parseRenderPackageActionValue = (
  value: string | null,
): { packageId: string; jobCount: number } | null => {
  const [packageId, count] = (value ?? '').split('|');
  const jobCount = Number(count);
  if (!packageId || !Number.isInteger(jobCount) || jobCount <= 0) return null;
  return { packageId, jobCount };
};
