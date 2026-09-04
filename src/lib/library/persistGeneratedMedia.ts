'use client';

import type {
  RegisterGeneratedAssetOperation,
  RegisterGeneratedAssetResponse,
} from '@continuum/contracts';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { registerGeneratedAssetOperation } from './creativeOperations';
import { signLibraryUpload, uploadToLibraryTicket } from './uploadMediaAsset';
import { attachVideoPoster, isVideoMimeType } from './videoPoster';

/**
 * Bytes the browser just produced -> a durable, browsable library asset with its
 * provenance intact.
 *
 * Deliberately NOT `uploadMediaAsset`: that path's `register` action mints a
 * `source: "upload"` row and carries no lineage, which is right for a file a person
 * dropped and wrong for something an op produced. This takes the same signed-upload
 * route to storage and then registers through Creative Operations, so a result
 * carries `source`, `operation`, `originRef` and every parent asset it derives from
 * — the same registration the Backend performs when it runs the same work headlessly.
 * Two lanes producing two differently-shaped rows is a difference nobody would notice
 * until they tried to trace one.
 */
export async function persistGeneratedMedia(params: {
  blob: Blob;
  brandId: string;
  fileName: string;
  kind: 'image' | 'video';
  operation: string;
  originRef: Record<string, unknown>;
  sourceAssetIds?: string[];
  title?: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}): Promise<RegisterGeneratedAssetResponse & { bucket: string; storagePath: string }> {
  const supabase = createSupabaseBrowserClient();
  const mimeType = params.blob.type || (params.kind === 'video' ? 'video/mp4' : 'image/png');
  const file = new File([params.blob], params.fileName, { type: mimeType });

  const ticket = await signLibraryUpload(supabase, {
    brandId: params.brandId,
    fileName: params.fileName,
    mimeType,
  });
  await uploadToLibraryTicket(supabase, ticket, file);

  const registration: Omit<RegisterGeneratedAssetOperation, 'action'> = {
    brandId: params.brandId,
    kind: params.kind,
    bucket: ticket.bucket,
    storagePath: ticket.path,
    fileName: params.fileName,
    mimeType,
    width: params.width ?? null,
    height: params.height ?? null,
    durationMs: params.durationMs ?? null,
    sizeBytes: file.size,
    source: 'canvas',
    operation: params.operation,
    originRef: params.originRef,
    sourceAssetIds: params.sourceAssetIds ?? [],
    tags: [],
    title: params.title ?? null,
    integrityState: 'unknown',
    // Idempotent on the object identity, so a retried render that re-uploaded the
    // same path registers once rather than minting a second asset for one result.
    idempotencyKey: `generated:${ticket.bucket}:${ticket.path}`,
  };
  const registered = await registerGeneratedAssetOperation(supabase, registration);

  // A poster is a browser-only enhancement on top of a registration that already
  // succeeded. It must never turn a finished render into a failed one.
  if (params.kind === 'video' && isVideoMimeType(mimeType)) {
    try {
      await attachVideoPoster({
        file,
        mimeType,
        brandId: params.brandId,
        assetId: registered.assetId,
      });
    } catch (error) {
      console.warn('[persistGeneratedMedia] poster backfill failed', error);
    }
  }

  return { ...registered, bucket: ticket.bucket, storagePath: ticket.path };
}
