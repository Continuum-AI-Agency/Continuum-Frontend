import { z } from 'zod';
import { pinnedLibraryAssetRefSchema } from '../media/library-reference';

export const canvasPublishingFormatSchema = z.enum(['image', 'carousel', 'video']);
export type CanvasPublishingFormat = z.infer<typeof canvasPublishingFormatSchema>;

export const canvasPublishingAssetSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid().optional(),
    kind: z.enum(['image', 'video']),
    order: z.number().int().nonnegative(),
  })
  .strict();
export type CanvasPublishingAsset = z.infer<typeof canvasPublishingAssetSchema>;

export const canvasPublishingSlotSchema = z
  .object({
    id: z.string().min(1),
    order: z.number().int().nonnegative(),
  })
  .strict();
export type CanvasPublishingSlot = z.infer<typeof canvasPublishingSlotSchema>;

export const organicCanvasTargetStatusSchema = z.enum([
  'draft',
  'placeholder',
  'approved',
  'scheduled',
]);

/**
 * A reason a draft must not receive canvas creative. `account_orphaned` means its
 * `platform_account_id` is not one of the brand's connected accounts, so where it
 * would publish is undefined.
 */
export const organicCanvasTargetBlockerSchema = z.enum(['account_orphaned']);
export type OrganicCanvasTargetBlocker = z.infer<typeof organicCanvasTargetBlockerSchema>;

export const organicCanvasTargetSchema = z
  .object({
    id: z.string().uuid(),
    format: canvasPublishingFormatSchema,
    platform: z.string().min(1),
    platformAccountId: z.string().nullable(),
    status: organicCanvasTargetStatusSchema,
    scheduledAt: z.string().nullable(),
    title: z.string(),
    captionPreview: z.string(),
    updatedAt: z.string(),
    /**
     * The delivery verdict, computed server-side so every surface shows the same one.
     * It used to be derived only inside the MCP handler, which left the canvas picker
     * happily offering destinations the agent path refused — and expensive creative
     * landing on a months-old empty placeholder with no warning at all.
     */
    empty: z.boolean(),
    blockers: z.array(organicCanvasTargetBlockerSchema),
    deliverable: z.boolean(),
    /** How much creative the draft already carries — i.e. what an attach replaces. */
    mediaCount: z.number().int().nonnegative(),
    /** A freshly signed preview of the draft's first asset, when it has one. */
    thumbnailUrl: z.string().nullable(),
  })
  .strict();
export type OrganicCanvasTarget = z.infer<typeof organicCanvasTargetSchema>;

export const organicCanvasTargetSearchRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    /**
     * Absent = EVERY format. Requiring it is what made the canvas picker report "no
     * editable drafts match this format" on a brand full of drafts: reels and
     * carousels — the two formats the generator produces by default — were filtered
     * out before the user ever saw them.
     */
    format: canvasPublishingFormatSchema.optional(),
    query: z.string().max(200).optional(),
    platform: z.string().min(1).optional(),
    platformAccountId: z.string().min(1).optional(),
    statuses: z
      .union([
        z.array(organicCanvasTargetStatusSchema),
        // Query strings cannot carry arrays; the browser sends `draft,approved`.
        z.string().transform((value) => value.split(',').map((part) => part.trim())),
      ])
      .pipe(z.array(organicCanvasTargetStatusSchema).min(1))
      .optional(),
    /** Inclusive `scheduled_date` window, ISO. Unscheduled drafts fall outside both. */
    scheduledFrom: z.string().optional(),
    scheduledTo: z.string().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type OrganicCanvasTargetSearchRequest = z.infer<
  typeof organicCanvasTargetSearchRequestSchema
>;

export const organicCanvasTargetSearchResponseSchema = z
  .object({
    items: z.array(organicCanvasTargetSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type OrganicCanvasTargetSearchResponse = z.infer<
  typeof organicCanvasTargetSearchResponseSchema
>;

export const attachOrganicCanvasCreativeRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    expectedUpdatedAt: z.string().min(1),
    format: canvasPublishingFormatSchema,
    assets: z.array(canvasPublishingAssetSchema).min(1).max(20),
  })
  .strict();
export type AttachOrganicCanvasCreativeRequest = z.infer<
  typeof attachOrganicCanvasCreativeRequestSchema
>;

export const attachOrganicCanvasCreativeResponseSchema = z
  .object({
    draftId: z.string().uuid(),
    format: canvasPublishingFormatSchema,
    updatedAt: z.string(),
  })
  .strict();
export type AttachOrganicCanvasCreativeResponse = z.infer<
  typeof attachOrganicCanvasCreativeResponseSchema
>;

/**
 * One canvas write against the organic Planner: create a draft, or edit the one it is
 * bound to. `draftId` absent means CREATE, and a create needs the two things a planner
 * row cannot be born without — a platform and the day it sits on.
 *
 * Platform and account are create-only by design: they are columns, not `content_json`,
 * and the canonical planner field-edit funnel cannot move them. Accepting them on an
 * edit would be accepting a change that silently does nothing.
 */
export const organicCanvasDraftWriteRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    draftId: z.string().uuid().optional(),
    platform: z.string().min(1).optional(),
    platformAccountId: z.string().min(1).optional(),
    caption: z.string().max(2200).optional(),
    hashtags: z
      .object({
        high: z.array(z.string()).optional(),
        medium: z.array(z.string()).optional(),
        low: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
    format: canvasPublishingFormatSchema.optional(),
    dayId: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'day must be YYYY-MM-DD')
      .optional(),
    timeOfDay: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:mm')
      .optional(),
    assets: z.array(canvasPublishingAssetSchema).max(20).optional(),
    expectedUpdatedAt: z.string().min(1).optional(),
    /** The canvas node's stable identity, carried into `client_key` for retry convergence. */
    clientKey: z.string().min(1).max(200).optional(),
  })
  .strict()
  .refine((input) => input.draftId !== undefined || (!!input.platform && !!input.dayId), {
    message: 'A new draft needs both a platform and the calendar day it belongs on',
  });
export type OrganicCanvasDraftWriteRequest = z.infer<typeof organicCanvasDraftWriteRequestSchema>;

export const organicCanvasDraftWriteResponseSchema = z
  .object({
    draftId: z.string().uuid(),
    updatedAt: z.string(),
    /** True when this write minted the row, so the caller can deep-link a new draft. */
    created: z.boolean(),
  })
  .strict();
export type OrganicCanvasDraftWriteResponse = z.infer<typeof organicCanvasDraftWriteResponseSchema>;

export const paidCanvasTargetStatusSchema = z.enum(['PAUSED', 'ACTIVE']);
export const paidCanvasTargetLevelSchema = z.enum(['campaign', 'adset', 'ad']);

export const paidCanvasTargetSchema = z
  .object({
    id: z.string().min(1),
    level: paidCanvasTargetLevelSchema,
    name: z.string(),
    status: z.string(),
    campaignId: z.string().nullable(),
    campaignName: z.string().nullable(),
    adsetId: z.string().nullable(),
    adsetName: z.string().nullable(),
    creativeId: z.string().nullable(),
    format: canvasPublishingFormatSchema.nullable(),
    previewUrl: z.string().nullable(),
  })
  .strict();
export type PaidCanvasTarget = z.infer<typeof paidCanvasTargetSchema>;

export const paidCanvasTargetSearchRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    adAccountId: z.string().min(1).optional(),
    level: paidCanvasTargetLevelSchema,
    parentId: z.string().min(1).optional(),
    format: canvasPublishingFormatSchema.optional(),
    query: z.string().max(200).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type PaidCanvasTargetSearchRequest = z.infer<typeof paidCanvasTargetSearchRequestSchema>;

export const paidCanvasTargetSearchResponseSchema = z
  .object({
    adAccountId: z.string().min(1),
    items: z.array(paidCanvasTargetSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type PaidCanvasTargetSearchResponse = z.infer<typeof paidCanvasTargetSearchResponseSchema>;

const paidReplacementIdentitySchema = z
  .object({
    brandId: z.string().uuid(),
    adAccountId: z.string().min(1),
    campaignId: z.string().min(1),
    adsetId: z.string().min(1),
    adId: z.string().min(1),
    expectedCreativeId: z.string().min(1),
    format: canvasPublishingFormatSchema,
    assets: z.array(canvasPublishingAssetSchema).min(1).max(10),
  })
  .strict();

export const paidCanvasCreativeReplacementRequestSchema = z.discriminatedUnion('mode', [
  paidReplacementIdentitySchema.extend({ mode: z.literal('preview') }),
  paidReplacementIdentitySchema.extend({
    mode: z.literal('confirm'),
    confirmToken: z.string().min(1),
  }),
]);
export type PaidCanvasCreativeReplacementRequest = z.infer<
  typeof paidCanvasCreativeReplacementRequestSchema
>;

export const paidCanvasCreativeReplacementResponseSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('preview'),
      confirmToken: z.string(),
      expiresAt: z.string(),
      adId: z.string(),
      currentCreativeId: z.string(),
      format: canvasPublishingFormatSchema,
      assetIds: z.array(z.string().uuid()),
      requiresApproval: z.boolean(),
    })
    .strict(),
  z
    .object({
      mode: z.literal('confirm'),
      replacementId: z.string().uuid(),
      adId: z.string(),
      previousCreativeId: z.string(),
      creativeId: z.string(),
      appliedAt: z.string(),
    })
    .strict(),
]);
export type PaidCanvasCreativeReplacementResponse = z.infer<
  typeof paidCanvasCreativeReplacementResponseSchema
>;

/**
 * Restore receipt for a Paid creative swap. A restore reassigns the immutable
 * `previousCreativeId` retained on the audit row back onto the ad — it never
 * re-uploads assets — so the receipt names the row it read (`replacementId`) and
 * the creative that is now live again (`restoredCreativeId`).
 */
export const paidCanvasCreativeRestoreResultSchema = z
  .object({
    replacementId: z.string().uuid(),
    adId: z.string(),
    restoredCreativeId: z.string(),
    replacedCreativeId: z.string(),
    restoredAt: z.string(),
  })
  .strict();
export type PaidCanvasCreativeRestoreResult = z.infer<typeof paidCanvasCreativeRestoreResultSchema>;

// ---------------------------------------------------------------------------
// studio_deliver — the terminal-delivery umbrella envelope (MCP)
// ---------------------------------------------------------------------------
//
// `studio_workflow` builds/inspects/runs a canvas graph; `studio_deliver`
// consumes a DURABLE artifact reference (Library asset ids) plus an exact
// destination and carries the creative to it. The preview binds a confirmation
// to the exact artifact + destination + expected-current state + action + a
// payload hash; the receipt is the durable record of what actually landed.
// Both shapes are shared so the Frontend publisher node and the MCP tool never
// drift on what a delivery preview/receipt looks like.

export const studioDeliverIntentSchema = z.enum([
  'attach_to_planner',
  'publish_organic',
  'replace_paid_creative',
  'restore_paid_creative',
]);
export type StudioDeliverIntent = z.infer<typeof studioDeliverIntentSchema>;

export const studioDeliverDestinationTypeSchema = z.enum(['organic_draft', 'paid_ad']);
export type StudioDeliverDestinationType = z.infer<typeof studioDeliverDestinationTypeSchema>;

/** How externally visible / spend-adjacent the change is — the truthful risk band. */
export const studioDeliverRiskSchema = z.enum([
  'internal_draft',
  'external_visible',
  'external_spend',
]);
export type StudioDeliverRisk = z.infer<typeof studioDeliverRiskSchema>;

export const studioDeliverArtifactSchema = z
  .object({
    format: canvasPublishingFormatSchema,
    assetIds: z.array(z.string().uuid()).min(1).max(20),
    assetRefs: z.array(pinnedLibraryAssetRefSchema).min(1).max(20),
  })
  .strict();
export type StudioDeliverArtifact = z.infer<typeof studioDeliverArtifactSchema>;

export const studioDeliverDestinationSchema = z
  .object({
    type: studioDeliverDestinationTypeSchema,
    /** Exact destination id — a Planner draft id or a Meta ad id. Never free text. */
    id: z.string().min(1),
    /** The destination's current version/creative the confirmation is pinned to. */
    currentVersion: z.string().nullable(),
    label: z.string().nullable(),
  })
  .strict();
export type StudioDeliverDestination = z.infer<typeof studioDeliverDestinationSchema>;

export const studioDeliverPreviewSchema = z
  .object({
    stage: z.literal('preview'),
    intent: studioDeliverIntentSchema,
    brandId: z.string().uuid(),
    actorId: z.string().min(1),
    artifact: studioDeliverArtifactSchema,
    destination: studioDeliverDestinationSchema,
    requestedChange: z.string().min(1),
    externalRisk: studioDeliverRiskSchema,
    restorable: z.boolean(),
    /** sha256 of the canonical delivery request — the confirm token is bound to it. */
    previewHash: z.string().min(1),
    confirmToken: z.string().min(1),
    expiresAt: z.string().min(1),
  })
  .strict();
export type StudioDeliverPreview = z.infer<typeof studioDeliverPreviewSchema>;

export const studioDeliverReceiptSchema = z
  .object({
    stage: z.literal('receipt'),
    /** Durable operation id — an exact retry replays this receipt (plan 052). */
    operationId: z.string().min(1),
    status: z.enum(['delivered', 'restored']),
    intent: studioDeliverIntentSchema,
    artifactAssetIds: z.array(z.string().uuid()),
    artifactAssetRefs: z.array(pinnedLibraryAssetRefSchema),
    destinationId: z.string().min(1),
    /** The version/creative that was live BEFORE this delivery. */
    previousVersion: z.string().nullable(),
    /** The version/creative live AFTER it. */
    appliedVersion: z.string().nullable(),
    providerAppliedAt: z.string().nullable(),
    persistedAt: z.string(),
    warnings: z.array(z.string()),
    /** Present when the delivery can be undone — the restore point + next action. */
    restore: z.object({ replacementId: z.string(), action: z.string() }).strict().nullable(),
    replayed: z.boolean().optional(),
  })
  .strict();
export type StudioDeliverReceipt = z.infer<typeof studioDeliverReceiptSchema>;
