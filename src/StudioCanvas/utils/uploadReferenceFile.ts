// Uploads a locally-dropped/selected reference file to durable storage and swaps
// the node's media value to the resulting signed URL, driving a processing ->
// ready/error status badge. Mirrors inlineReferenceImageNodes.ts.
//
// Signed URL is the source of truth: after upload the node carries a signed URL +
// storage path/bucket (re-signed on load). On failure the node keeps whatever
// local base64 preview it already has (emergency fallback), shows "error", and
// records the server's error message in referenceError so the badge can surface
// the real reason on hover.
//
// Uploads go through the library-upload edge function (uploadMediaAsset): the
// browser PUTs straight to storage and the row is registered server-side, so a
// dropped reference also becomes a browsable library asset. Dependencies are
// injected so the orchestration is testable without the network.

import { MEDIA_LIBRARY_BUCKET, uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import type { CanvasDocument, DocumentNodeData, ImageNodeData, VideoNodeData } from '../types';

export const REFERENCE_UPLOAD_BUCKET = MEDIA_LIBRARY_BUCKET;

export interface UploadReferenceResult {
  signedUrl: string;
  storagePath: string;
  bucket: string;
}

type UpdateNodeData = (
  id: string,
  data: Partial<ImageNodeData & VideoNodeData & DocumentNodeData>,
) => void;

export interface UploadReferenceDeps {
  updateNodeData: UpdateNodeData;
  uploadAsset?: (params: {
    file: File;
    brandId: string;
  }) => Promise<{ assetId: string; storagePath: string; signedUrl: string }>;
}

export async function uploadReferenceFile(
  params: { nodeId: string; file: File; brandId: string; field?: 'image' | 'video' },
  deps: UploadReferenceDeps,
): Promise<UploadReferenceResult | null> {
  const { nodeId, file, brandId } = params;
  const field = params.field ?? 'image';
  const uploadAsset = deps.uploadAsset ?? ((p) => uploadMediaAsset(p));

  deps.updateNodeData(nodeId, { referenceStatus: 'processing', referenceError: undefined });
  try {
    // The upload registers a library asset row; keeping its id on the node is what
    // lets a generation downstream be credited back to this reference.
    const { assetId, storagePath, signedUrl } = await uploadAsset({ file, brandId });
    deps.updateNodeData(nodeId, {
      [field]: signedUrl,
      assetId,
      sourcePath: storagePath,
      bucket: REFERENCE_UPLOAD_BUCKET,
      sourceUrl: signedUrl,
      referenceStatus: 'ready',
      referenceError: undefined,
    } as Partial<ImageNodeData & VideoNodeData>);
    return { signedUrl, storagePath, bucket: REFERENCE_UPLOAD_BUCKET };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.warn('[studio] uploadReferenceFile failed; keeping local preview', err);
    deps.updateNodeData(nodeId, { referenceStatus: 'error', referenceError: message });
    return null;
  }
}

// Deprecated: DocumentNode now routes local uploads through the embed_document
// pipeline (src/StudioCanvas/nodes/DocumentNode.tsx → /api/ai-studio/documents).
// Kept for any caller that has not yet migrated; safe to remove once unused.
export async function uploadDocumentReference(
  params: { nodeId: string; docIndex: number; file: File; brandId: string },
  deps: {
    getDocuments: () => CanvasDocument[];
    updateNodeData: (id: string, data: Partial<DocumentNodeData>) => void;
    uploadAsset?: (params: {
      file: File;
      brandId: string;
    }) => Promise<{ assetId: string; storagePath: string; signedUrl: string }>;
  },
): Promise<UploadReferenceResult | null> {
  const { nodeId, docIndex, file, brandId } = params;
  const uploadAsset = deps.uploadAsset ?? ((p) => uploadMediaAsset(p));

  try {
    const { storagePath, signedUrl } = await uploadAsset({ file, brandId });
    const docs = [...deps.getDocuments()];
    if (docIndex < docs.length) {
      docs[docIndex] = {
        ...docs[docIndex],
        sourceUrl: signedUrl,
        storagePath,
        bucket: REFERENCE_UPLOAD_BUCKET,
        // Strip base64 content after successful upload to keep saved canvas lean.
        content: undefined,
      };
    }
    deps.updateNodeData(nodeId, { documents: docs });
    return { signedUrl, storagePath, bucket: REFERENCE_UPLOAD_BUCKET };
  } catch (err) {
    console.warn('[studio] uploadDocumentReference failed; keeping base64 fallback', err);
    return null;
  }
}
