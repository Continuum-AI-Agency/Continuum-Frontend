import { createHash } from 'node:crypto';

import {
  type RegisterGeneratedAssetOperation,
  registerGeneratedAssetOperationSchema,
} from '@continuum/contracts';

export type AppliedMediaAssetInput = {
  brandProfileId: string;
  userId: string;
  draftId: string;
  bucket: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  kind: 'image' | 'video';
  width?: number | null;
  height?: number | null;
  sizeBytes?: number | null;
};

/**
 * The provenance edge label for creatives applied from the planner's AI Studio
 * hand-off. Distinguishes them from Studio canvas generations in the graph.
 */
export const APPLY_OPERATION = 'organic_planner_apply';

/**
 * Builds the Creative Operations payload that registers an applied creative.
 *
 * This route used to write `media.assets` with a raw service-role INSERT, which
 * skipped the version head, the lineage edges and the idempotency receipt, and then
 * re-read the row it had just written with `created_at desc limit 1` to recover the
 * id — a race against any concurrent insert. Going through the RPC returns the id
 * directly, so the re-read is gone.
 *
 * The idempotency key is derived exactly as the Backend derives it
 * (`generated:sha256(bucket \0 storagePath)`), so both producers converge on the
 * same key for the same stored object rather than minting two assets for it.
 */
export function buildApplyRegisterOperation(
  params: AppliedMediaAssetInput,
): RegisterGeneratedAssetOperation {
  const identity = `${params.bucket}\0${params.storagePath}`;
  return registerGeneratedAssetOperationSchema.parse({
    action: 'register_generated_asset',
    brandId: params.brandProfileId,
    kind: params.kind,
    bucket: params.bucket,
    storagePath: params.storagePath,
    fileName: params.fileName,
    mimeType: params.mimeType,
    width: params.width ?? null,
    height: params.height ?? null,
    sizeBytes: params.sizeBytes ?? null,
    source: 'ai_generated',
    operation: APPLY_OPERATION,
    originRef: { draftId: params.draftId, surface: 'organic_planner' },
    idempotencyKey: `generated:${createHash('sha256').update(identity).digest('hex')}`,
  });
}
