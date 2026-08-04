import { z } from 'zod';

export const API_RENDER_TEMPLATES_ROUTE = '/api/ai-studio/renders/templates';
export const API_RENDER_PREFLIGHT_ROUTE = '/api/ai-studio/renders/preflight';
export const API_RENDER_JOBS_ROUTE = '/api/ai-studio/renders/jobs';

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
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .refine((key) => !/^f_[a-z0-9]+$/i.test(key), {
        message: 'Physical renderer field names are private',
      }),
    label: z.string().min(1),
    kind: apiRenderVariableKindSchema,
    required: z.boolean(),
    multiple: z.boolean().default(false),
    accept: z.array(z.string().min(1)).default([]),
    options: z.array(z.string()).default([]),
    description: z.string().nullable().default(null),
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

export const apiRenderTemplateListResponseSchema = z
  .object({
    items: z.array(apiRenderTemplateSummarySchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type ApiRenderTemplateListResponse = z.infer<typeof apiRenderTemplateListResponseSchema>;

export const pinnedRenderAssetSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
  })
  .strict();
export type PinnedRenderAsset = z.infer<typeof pinnedRenderAssetSchema>;

export const apiRenderInputValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  pinnedRenderAssetSchema,
  z.array(pinnedRenderAssetSchema).min(1).max(20),
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

export const apiRenderPreflightRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    templateKey: z.string().min(1),
    contractHash: z.string().min(1),
    variables: z.record(
      z
        .string()
        .regex(/^[a-z][a-z0-9_]*$/)
        .refine((key) => !/^f_[a-z0-9]+$/i.test(key), {
          message: 'Physical renderer field names are private and cannot be submitted',
        }),
      apiRenderInputValueSchema,
    ),
    delivery: apiRenderDeliveryTargetSchema,
  })
  .strict();
export type ApiRenderPreflightRequest = z.infer<typeof apiRenderPreflightRequestSchema>;

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
    target: resolvedRenderTargetSchema,
    inputKeys: z.array(z.string()),
    effects: z.literal('none'),
  })
  .strict();
export type ApiRenderPreflightResponse = z.infer<typeof apiRenderPreflightResponseSchema>;

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
  })
  .strict();

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
