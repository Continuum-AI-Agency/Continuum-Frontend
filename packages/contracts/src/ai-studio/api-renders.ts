import { z } from 'zod';

export const API_RENDER_TEMPLATES_ROUTE = '/api/ai-studio/renders/templates';
export const API_RENDER_PREFLIGHT_ROUTE = '/api/ai-studio/renders/preflight';
export const API_RENDER_JOBS_ROUTE = '/api/ai-studio/renders/jobs';
export const API_RENDER_INPUT_SETS_ROUTE = '/api/ai-studio/renders/input-sets';
export const API_RENDER_BATCH_PREFLIGHT_ROUTE = '/api/ai-studio/renders/batch-preflight';
export const API_RENDER_BATCHES_ROUTE = '/api/ai-studio/renders/batches';

/**
 * A caller-facing variable name. Physical `f_<hash>` renderer field names are private
 * and must never cross this boundary in either direction.
 */
export const apiRenderVariableKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/)
  .refine((key) => !/^f_[a-z0-9]+$/i.test(key), {
    message: 'Physical renderer field names are private',
  });

/**
 * The one variable key both sides agree on without negotiating it. A template that
 * declares it is asking for the BRAND's mark, so Continuum fills it and the caller
 * may not.
 *
 * Reserved rather than merely defaulted: a caller-supplied value would render some
 * other brand's logo under this brand's binding, and silently overriding one would
 * render something the caller never asked for. Refuse — the same discipline as
 * `brand_id` vs `delivery.brand_id`, which agree or fail rather than taking a
 * precedence rule.
 *
 * The handshake is the template field's TITLE: template-forge names it so that
 * `publicVariableKey()` normalises to exactly this string.
 */
export const WATERMARK_LOGO_VARIABLE_KEY = 'watermark_logo';

export const apiRenderVariableKindSchema = z.enum([
  'text',
  'number',
  'boolean',
  'image',
  'video',
  'enum',
]);
export type ApiRenderVariableKind = z.infer<typeof apiRenderVariableKindSchema>;

export const apiRenderVariableSchema = z
  .object({
    key: apiRenderVariableKeySchema,
    label: z.string().min(1),
    kind: apiRenderVariableKindSchema,
    required: z.boolean(),
    multiple: z.boolean().default(false),
    accept: z.array(z.string().min(1)).default([]),
    options: z.array(z.string()).default([]),
    description: z.string().nullable().default(null),
    // The server fills this one: do not send it, and do not render an input for it.
    // Distinct from `required`, which says a value must reach the renderer — a
    // reserved variable is both required AND caller-forbidden, so a client that keys
    // off `required` alone will either refuse to render or offer the wrong control.
    // Defaulted so a server too old to emit it stays contract-valid.
    reserved: z.boolean().default(false),
  })
  .strict();
export type ApiRenderVariable = z.infer<typeof apiRenderVariableSchema>;

export const apiRenderTemplateSummarySchema = z
  .object({
    key: z.string().min(1),
    name: z.string().min(1),
    environment: z.string().min(1),
    contractVersion: z.string().min(1),
    contractHash: z.string().min(1),
    contractSource: z.enum(['template_forge', 'legacy_reflection']),
    outputKinds: z.array(z.enum(['image', 'video'])).min(1),
    variableCount: z.number().int().nonnegative(),
    previewUrl: z.string().url().nullable(),
    updatedAt: z.string().nullable(),
  })
  .strict();
export type ApiRenderTemplateSummary = z.infer<typeof apiRenderTemplateSummarySchema>;

export const apiRenderTemplateContractSchema = z
  .object({
    template: apiRenderTemplateSummarySchema,
    variables: z.array(apiRenderVariableSchema),
  })
  .strict();
export type ApiRenderTemplateContract = z.infer<typeof apiRenderTemplateContractSchema>;

/**
 * Whether the render fleet will honour this brand's workspace at all.
 *
 * Independent of having a binding: a brand can be correctly bound and still be
 * unable to render, because the workspace allowlist lives on the render fleet
 * (the FlowStream `CONTINUUM_RENDER_APPS` variable), not in Supabase.
 * `env_plane_undeployed` is the state that most needs surfacing — the fleet does
 * not reject the request, it renders it against the shared workspace's
 * templates instead, which looks like success.
 */
export const apiRenderWorkspaceStatusSchema = z
  .object({
    workspace: z.string(),
    renderEligible: z.boolean(),
    state: z.enum(['eligible', 'not_allowlisted', 'env_plane_undeployed', 'unknown']),
    detail: z.string(),
  })
  .strict();
export type ApiRenderWorkspaceStatus = z.infer<typeof apiRenderWorkspaceStatusSchema>;

export const apiRenderTemplateListResponseSchema = z
  .object({
    items: z.array(apiRenderTemplateSummarySchema),
    nextCursor: z.string().nullable(),
    // Optional so an older server stays contract-valid against a newer client.
    workspace: apiRenderWorkspaceStatusSchema.optional(),
  })
  .strict();
export type ApiRenderTemplateListResponse = z.infer<typeof apiRenderTemplateListResponseSchema>;

/**
 * A durable Library coordinate for a media variable.
 *
 * `versionId` is OPTIONAL because a caller frequently holds an asset id without the
 * exact version: a node stamped by a producer that only carried the asset id, a
 * Library asset whose `head_version_id` was never materialized, or a slot filled
 * straight from the Library picker. Refusing those made the canvas say "needs a
 * Library asset" about an asset that was already in the Library.
 *
 * Omitting it is not a loosening of the version pin. Preflight resolves the head
 * version server-side and freezes the exact `{assetId, versionId}` into the signed
 * confirmation, so a render is still reproducible against one immutable version —
 * the same way the reserved `watermark_logo` pin has always been resolved.
 */
export const pinnedRenderAssetSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid().optional(),
  })
  .strict();
export type PinnedRenderAsset = z.infer<typeof pinnedRenderAssetSchema>;

/**
 * How many pins one `multiple` media variable may carry. Named rather than inlined
 * because the canvas enforces the same number as a handle connection limit — two
 * copies of it would let the graph accept an edge the wire contract then refuses.
 */
export const API_RENDER_MEDIA_LIST_MAX = 20;

export const apiRenderInputValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  pinnedRenderAssetSchema,
  z.array(pinnedRenderAssetSchema).min(1).max(API_RENDER_MEDIA_LIST_MAX),
]);
export type ApiRenderInputValue = z.infer<typeof apiRenderInputValueSchema>;

export const apiRenderDeliveryTargetSchema = z
  .object({
    action: z.literal('create').default('create'),
    adAccountId: z.string().min(1),
    campaignId: z.string().min(1),
    adsetId: z.string().min(1),
    adStatus: z.literal('PAUSED').default('PAUSED'),
  })
  .strict();
export type ApiRenderDeliveryTarget = z.infer<typeof apiRenderDeliveryTargetSchema>;

export const apiRenderVariableMapSchema = z.record(
  apiRenderVariableKeySchema,
  apiRenderInputValueSchema,
);
export type ApiRenderVariableMap = z.infer<typeof apiRenderVariableMapSchema>;

/**
 * Variables come from exactly one place: supplied inline, or read from a saved input
 * set. Accepting both and picking one would mean silently rendering something the
 * caller did not ask for — the same reason `brand_id` and `delivery.brand_id` must
 * agree rather than take a precedence rule.
 */
const oneVariableSource = (value: { variables?: unknown; inputSetId?: unknown }) =>
  (value.variables === undefined) !== (value.inputSetId === undefined);
const oneVariableSourceMessage = {
  message: 'Supply either variables or inputSetId, never both and never neither',
};

export const apiRenderPreflightRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    templateKey: z.string().min(1),
    contractHash: z.string().min(1),
    variables: apiRenderVariableMapSchema.optional(),
    inputSetId: z.string().uuid().optional(),
    // Optional on purpose. A render that goes to the brand's own media library and
    // nowhere else is the common case; requiring a delivery block forced every caller
    // to name a live Meta campaign and ad set — and made preflight validate them
    // against the Graph API — just to produce a file.
    delivery: apiRenderDeliveryTargetSchema.optional(),
  })
  .strict()
  .refine(oneVariableSource, oneVariableSourceMessage);
export type ApiRenderPreflightRequest = z.infer<typeof apiRenderPreflightRequestSchema>;

export const apiRenderInputSetSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    templateKey: z.string().min(1),
    contractHash: z.string().min(1),
    name: z.string().min(1),
    variables: apiRenderVariableMapSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type ApiRenderInputSet = z.infer<typeof apiRenderInputSetSchema>;

export const apiRenderInputSetListResponseSchema = z
  .object({ items: z.array(apiRenderInputSetSchema), nextCursor: z.string().nullable() })
  .strict();
export type ApiRenderInputSetListResponse = z.infer<typeof apiRenderInputSetListResponseSchema>;

export const apiRenderCreateInputSetRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    templateKey: z.string().min(1),
    contractHash: z.string().min(1),
    name: z.string().trim().min(1).max(200),
    variables: apiRenderVariableMapSchema,
  })
  .strict();
export type ApiRenderCreateInputSetRequest = z.infer<typeof apiRenderCreateInputSetRequestSchema>;

export const apiRenderUpdateInputSetRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    name: z.string().trim().min(1).max(200).optional(),
    variables: apiRenderVariableMapSchema.optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.variables !== undefined, {
    message: 'Update at least one of name or variables',
  });
export type ApiRenderUpdateInputSetRequest = z.infer<typeof apiRenderUpdateInputSetRequestSchema>;

export const apiRenderBatchRecordSchema = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    variables: apiRenderVariableMapSchema.optional(),
    inputSetId: z.string().uuid().optional(),
  })
  .strict()
  .refine(oneVariableSource, oneVariableSourceMessage);
export type ApiRenderBatchRecord = z.infer<typeof apiRenderBatchRecordSchema>;

export const apiRenderBatchPreflightRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    templateKey: z.string().min(1),
    contractHash: z.string().min(1),
    delivery: apiRenderDeliveryTargetSchema.optional(),
    records: z.array(apiRenderBatchRecordSchema).min(1).max(50),
  })
  .strict();
export type ApiRenderBatchPreflightRequest = z.infer<typeof apiRenderBatchPreflightRequestSchema>;

export const apiRenderCreateJobRequestSchema = z
  .object({
    confirmationToken: z.string().min(1),
  })
  .strict();
export type ApiRenderCreateJobRequest = z.infer<typeof apiRenderCreateJobRequestSchema>;

export const apiRenderOutputSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['image', 'video']),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    url: z.string().url(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    // The library asset this output was saved as. Null while the ingest is still in
    // flight, or if it failed — a render is not held back by its library copy.
    // Together the pair is a `pinnedRenderAsset`, so an output can be fed straight
    // back in as the input to the next render.
    assetId: z.string().uuid().nullable().default(null),
    versionId: z.string().uuid().nullable().default(null),
  })
  .strict();
export type ApiRenderOutput = z.infer<typeof apiRenderOutputSchema>;

export const apiRenderDeliveryReceiptSchema = z
  .object({
    status: z.enum(['pending', 'published', 'error', 'dropped']),
    adId: z.string().nullable(),
    creativeId: z.string().nullable(),
    reason: z.string().nullable(),
    publishedAt: z.string().nullable(),
  })
  .strict();

export const apiRenderJobSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    templateKey: z.string().min(1),
    templateName: z.string().min(1),
    contractHash: z.string().min(1),
    taskUid: z.string().nullable(),
    status: z.enum(['submitting', 'queued', 'rendering', 'finished', 'failed']),
    // True means the fleet watermarks the output — every render Continuum submits
    // today. Carried on the wire so the UI states the fact instead of assuming it,
    // and so a future unwatermarked production mode cannot ship invisibly. Defaulted
    // because a server too old to emit it is one that only produced test renders.
    test: z.boolean().default(true),
    outputs: z.array(apiRenderOutputSchema),
    delivery: z.array(apiRenderDeliveryReceiptSchema),
    error: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type ApiRenderJob = z.infer<typeof apiRenderJobSchema>;

export const apiRenderJobListResponseSchema = z
  .object({
    items: z.array(apiRenderJobSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type ApiRenderJobListResponse = z.infer<typeof apiRenderJobListResponseSchema>;

export const apiRenderCallbackSchema = z
  .object({
    event: z.enum(['render.finished', 'render.error']),
    taskUID: z.string().min(1),
    render_status: z.enum(['finished', 'error']),
    request_id: z.string().nullable().optional(),
    assets: z.array(z.record(z.string(), z.unknown())).default([]),
    timestamp: z.number().int(),
  })
  .passthrough();
export type ApiRenderCallback = z.infer<typeof apiRenderCallbackSchema>;

export const resolvedRenderTargetSchema = z
  .object({
    adAccountId: z.string().min(1),
    campaignId: z.string().min(1),
    campaignName: z.string().min(1),
    adsetId: z.string().min(1),
    adsetName: z.string().min(1),
    adStatus: z.literal('PAUSED'),
  })
  .strict();

export const apiRenderPreflightResponseSchema = z
  .object({
    confirmationToken: z.string().min(1),
    confirmationHash: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.string(),
    template: apiRenderTemplateSummarySchema,
    target: resolvedRenderTargetSchema.nullable(),
    inputKeys: z.array(z.string()),
    effects: z.literal('none'),
    // Mirrors the `test` flag frozen into the signed trigger — see apiRenderJobSchema.
    test: z.boolean().default(true),
    // The exact brand-logo pin frozen into the signed confirmation, when this
    // template declares `watermark_logo`. Echoed so the UI and a bench can SEE what
    // was locked rather than infer it from `inputKeys` — a key name proves a slot was
    // filled, not which asset filled it. Null when the template has no such slot.
    watermarkLogo: pinnedRenderAssetSchema.nullable().default(null),
  })
  .strict();
export type ApiRenderPreflightResponse = z.infer<typeof apiRenderPreflightResponseSchema>;

export const apiRenderBatchPreflightResponseSchema = z
  .object({
    batchId: z.string().uuid(),
    confirmationToken: z.string().min(1),
    confirmationHash: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.string(),
    template: apiRenderTemplateSummarySchema,
    target: resolvedRenderTargetSchema.nullable(),
    records: z.array(z.object({ label: z.string(), inputKeys: z.array(z.string()) }).strict()),
    effects: z.literal('none'),
  })
  .strict();
export type ApiRenderBatchPreflightResponse = z.infer<typeof apiRenderBatchPreflightResponseSchema>;

export const apiRenderBatchSchema = z
  .object({ batchId: z.string().uuid(), jobs: z.array(apiRenderJobSchema) })
  .strict();
export type ApiRenderBatch = z.infer<typeof apiRenderBatchSchema>;
