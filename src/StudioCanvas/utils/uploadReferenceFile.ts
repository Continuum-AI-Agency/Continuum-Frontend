// Uploads a locally-dropped/selected reference file to durable storage and swaps
// the node's media value to the resulting signed URL, driving a processing ->
// ready/error status badge. Mirrors inlineReferenceImageNodes.ts.
//
// Signed URL is the source of truth: after upload the node carries a signed URL +
// storage path/bucket (re-signed on load). On failure the node keeps whatever
// local base64 preview it already has for the current session and retry, shows
// "error", and records the server's error message in referenceError so the badge
// can surface the real reason on hover. Failed uploads are intentionally not
// saved: workflow persistence strips base64 payloads.
//
// Uploads go through the library-upload edge function (uploadMediaAsset): the
// browser PUTs straight to storage and the row is registered server-side, so a
// dropped reference also becomes a browsable library asset. Dependencies are
// injected so the orchestration is testable without the network.

import { MEDIA_LIBRARY_BUCKET, uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import type { AudioNodeData, ImageNodeData, VideoNodeData } from '../types';

export const REFERENCE_UPLOAD_BUCKET = MEDIA_LIBRARY_BUCKET;

export interface UploadReferenceResult {
  assetId: string;
  assetVersionId: string;
  signedUrl: string;
  storagePath: string;
  bucket: string;
}

type UpdateNodeData = (
  id: string,
  data: Partial<ImageNodeData & VideoNodeData & AudioNodeData>,
) => void;

export interface UploadReferenceDeps {
  updateNodeData: UpdateNodeData;
  triggerSave?: () => void;
  uploadAsset?: (params: {
    file: File;
    brandId: string;
  }) => Promise<{
    assetId: string;
    versionId: string;
    storagePath: string;
    signedUrl: string;
  }>;
}

export async function stageAndUploadReferenceFile(
  params: {
    nodeId: string;
    file: File;
    brandId: string;
    field?: 'image' | 'video' | 'audio';
    previewData: Partial<ImageNodeData & VideoNodeData & AudioNodeData>;
  },
  deps: UploadReferenceDeps,
): Promise<UploadReferenceResult | null> {
  deps.updateNodeData(params.nodeId, params.previewData);
  return uploadReferenceFile(params, deps);
}

export async function uploadReferenceFile(
  params: { nodeId: string; file: File; brandId: string; field?: 'image' | 'video' | 'audio' },
  deps: UploadReferenceDeps,
): Promise<UploadReferenceResult | null> {
  const { nodeId, file, brandId } = params;
  const field = params.field ?? 'image';
  const uploadAsset = deps.uploadAsset ?? ((p) => uploadMediaAsset(p));

  deps.updateNodeData(nodeId, { referenceStatus: 'processing', referenceError: undefined });
  try {
    // The upload registers a library asset row; keeping its id on the node is what
    // lets a generation downstream be credited back to this reference.
    const { assetId, versionId, storagePath, signedUrl } = await uploadAsset({ file, brandId });
    deps.updateNodeData(nodeId, {
      [field]: signedUrl,
      assetId,
      assetVersionId: versionId,
      sourcePath: storagePath,
      bucket: REFERENCE_UPLOAD_BUCKET,
      sourceUrl: signedUrl,
      referenceStatus: 'ready',
      referenceError: undefined,
    } as Partial<ImageNodeData & VideoNodeData & AudioNodeData>);
    deps.triggerSave?.();
    return {
      assetId,
      assetVersionId: versionId,
      signedUrl,
      storagePath,
      bucket: REFERENCE_UPLOAD_BUCKET,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.warn('[studio] uploadReferenceFile failed; keeping local preview', err);
    deps.updateNodeData(nodeId, { referenceStatus: 'error', referenceError: message });
    return null;
  }
}
