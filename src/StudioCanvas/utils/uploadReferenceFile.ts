// Uploads a locally-dropped/selected reference file to durable storage and swaps
// the node's media value to the resulting signed URL, driving a processing ->
// ready/error status badge. Mirrors inlineReferenceImageNodes.ts.
//
// Signed URL is the source of truth: after upload the node carries a signed URL +
// storage path/bucket (re-signed on load). On failure the node keeps whatever
// local base64 preview it already has (emergency fallback) and shows "error".
//
// Dependencies are injected so the orchestration is testable without the network.

import type { ImageNodeData, VideoNodeData } from "../types";

// Reference uploads reuse the existing media-library upload route, so a dropped
// reference also becomes a browsable library asset.
export const REFERENCE_UPLOAD_BUCKET = "media-library";

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
  upload?: (file: File, brandId: string) => Promise<{ assetId: string; storagePath: string }>;
  sign?: (brandId: string, assetId: string) => Promise<{ signedUrl: string }>;
}

async function defaultUpload(file: File, brandId: string): Promise<{ assetId: string; storagePath: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("brandId", brandId);
  const resp = await fetch("/api/library/upload", { method: "POST", body: form });
  if (!resp.ok) throw new Error(`reference upload failed (${resp.status})`);
  return (await resp.json()) as { assetId: string; storagePath: string };
}

async function defaultSign(brandId: string, assetId: string): Promise<{ signedUrl: string }> {
  const resp = await fetch("/api/library/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId, assetId }),
  });
  if (!resp.ok) throw new Error(`reference sign failed (${resp.status})`);
  return (await resp.json()) as { signedUrl: string };
}

export async function uploadReferenceFile(
  params: { nodeId: string; file: File; brandId: string; field?: "image" | "video" },
  deps: UploadReferenceDeps,
): Promise<UploadReferenceResult | null> {
  const { nodeId, file, brandId } = params;
  const field = params.field ?? "image";
  const upload = deps.upload ?? defaultUpload;
  const sign = deps.sign ?? defaultSign;

  deps.updateNodeData(nodeId, { referenceStatus: "processing" });
  try {
    const { assetId, storagePath } = await upload(file, brandId);
    const { signedUrl } = await sign(brandId, assetId);
    deps.updateNodeData(nodeId, {
      [field]: signedUrl,
      sourcePath: storagePath,
      bucket: REFERENCE_UPLOAD_BUCKET,
      sourceUrl: signedUrl,
      referenceStatus: "ready",
    } as Partial<ImageNodeData & VideoNodeData>);
    return { signedUrl, storagePath, bucket: REFERENCE_UPLOAD_BUCKET };
  } catch (err) {
    console.warn("[studio] uploadReferenceFile failed; keeping local preview", err);
    deps.updateNodeData(nodeId, { referenceStatus: "error" });
    return null;
  }
}
