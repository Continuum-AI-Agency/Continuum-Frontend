import { z } from 'zod';

export const creativeOperationErrorCodeSchema = z.enum([
  'unauthenticated',
  'brand_forbidden',
  'asset_not_found',
  'version_not_found',
  'version_conflict',
  'unsupported_file',
  'file_too_large',
  'share_forbidden',
  'entitlement_required',
  'provider_unavailable',
  'rate_limited',
  'invalid_configuration',
  'invalid_request',
  'operation_failed',
]);
export type CreativeOperationErrorCode = z.infer<typeof creativeOperationErrorCodeSchema>;

export const creativeOperationErrorSchema = z
  .object({
    ok: z.literal(false),
    code: creativeOperationErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    operationId: z.string().min(1).optional(),
  })
  .strict();
export type CreativeOperationError = z.infer<typeof creativeOperationErrorSchema>;

export const idempotentCommandSchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
});

export const assetIntegrityStateSchema = z.enum(['verified', 'skipped_large_file', 'unknown']);
export type AssetIntegrityState = z.infer<typeof assetIntegrityStateSchema>;

// One atomic registration command for server-generated and register-in-place
// creatives. The bytes already exist; Creative Operations mints the asset head
// and every exact-version source edge in one transaction.
export const registerGeneratedAssetOperationSchema = z
  .object({
    action: z.literal('register_generated_asset'),
    brandId: z.string().uuid(),
    kind: z.enum(['image', 'video']),
    bucket: z.string().min(1).max(100),
    storagePath: z.string().min(1).max(1024),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().regex(/^(image|video)\//),
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    durationMs: z.number().int().nonnegative().nullable().optional(),
    sizeBytes: z.number().int().nonnegative().nullable().optional(),
    source: z.enum([
      'upload',
      'ai_generated',
      'backfill',
      'canvas',
      'inspiration',
      'hyperframe',
      'chat_upload',
      'clip',
      'reel',
      'meta_ad',
      'figma',
    ]),
    operation: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
    originRef: z.record(z.string(), z.unknown()).default({}),
    sourceAssetIds: z.array(z.string().uuid()).max(50).default([]),
    checksum: z.string().min(1).nullable().optional(),
    tags: z.array(z.string().min(1).max(100)).max(100).default([]),
    title: z.string().max(500).nullable().optional(),
    description: z.string().max(10_000).nullable().optional(),
    integrityState: assetIntegrityStateSchema.default('unknown'),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();
export type RegisterGeneratedAssetOperation = z.infer<typeof registerGeneratedAssetOperationSchema>;

export const registerGeneratedAssetResponseSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
    lineageCount: z.number().int().nonnegative(),
    status: z.enum(['created', 'exists']),
  })
  .strict();
export type RegisterGeneratedAssetResponse = z.infer<typeof registerGeneratedAssetResponseSchema>;
