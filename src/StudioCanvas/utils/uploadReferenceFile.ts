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

import type { ImageNodeData, VideoNodeData } from "../types";
import { MEDIA_LIBRARY_BUCKET, uploadMediaAsset } from "@/lib/library/uploadMediaAsset";

export const REFERENCE_UPLOAD_BUCKET = MEDIA_LIBRARY_BUCKET;

// Client kill switch (default on). Set NEXT_PUBLIC_AI_STUDIO_UPLOAD_ON_DROP=false
// to keep dropped files as local base64 only (legacy behavior).
export const isUploadOnDropEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_AI_STUDIO_UPLOAD_ON_DROP !== "false";

export interface UploadReferenceResult {
  signedUrl: string;
  storagePath: string;
  bucket: string;
}

type UpdateNodeData = (id: string, data: Partial<ImageNodeData & VideoNodeData>) => void;

export interface UploadReferenceDeps {
  updateNodeData: UpdateNodeData;
  uploadAsset?: (params: { file: File; brandId: string }) => Promise<{ assetId: string; storagePath: string; signedUrl: string }>;
}

export async function uploadReferenceFile(
  params: { nodeId: string; file: File; brandId: string; field?: "image" | "video" },
  deps: UploadReferenceDeps,
): Promise<UploadReferenceResult | null> {
  const { nodeId, file, brandId } = params;
  const field = params.field ?? "image";
  const uploadAsset = deps.uploadAsset ?? ((p) => uploadMediaAsset(p));

  deps.updateNodeData(nodeId, { referenceStatus: "processing", referenceError: undefined });
  try {
    const { storagePath, signedUrl } = await uploadAsset({ file, brandId });
    deps.updateNodeData(nodeId, {
      [field]: signedUrl,
      sourcePath: storagePath,
      bucket: REFERENCE_UPLOAD_BUCKET,
      sourceUrl: signedUrl,
      referenceStatus: "ready",
      referenceError: undefined,
    } as Partial<ImageNodeData & VideoNodeData>);
    return { signedUrl, storagePath, bucket: REFERENCE_UPLOAD_BUCKET };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.warn("[studio] uploadReferenceFile failed; keeping local preview", err);
    deps.updateNodeData(nodeId, { referenceStatus: "error", referenceError: message });
    return null;
  }
}
