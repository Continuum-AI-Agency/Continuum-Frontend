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
