// Pure mapping from a register-canvas request to a media.assets insert row.
// Kept dependency-free (type-only contract import) so it is unit-testable
// without a Supabase client. Mirrors the backend buildGeneratedMediaAssetRow.

import type { RegisterCanvasAssetRequest } from "@continuum/contracts";

export type CanvasAssetRow = {
  brand_id: string;
  created_by: string | null;
  kind: "image" | "video";
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  source: "canvas";
  origin_ref: Record<string, unknown>;
  status: "stored";
};

export function buildCanvasAssetRow(
  input: RegisterCanvasAssetRequest,
  userId: string | null,
): CanvasAssetRow {
  return {
    brand_id: input.brandProfileId,
    created_by: userId,
    kind: input.kind,
    bucket: input.bucket,
    storage_path: input.storagePath,
    file_name: input.fileName,
    mime_type: input.mimeType,
    width: input.width ?? null,
    height: input.height ?? null,
    duration_ms: input.durationMs ?? null,
    source: "canvas",
    origin_ref: { ...input.originRef },
    status: "stored",
  };
}

// M1 analyzes images only (mirrors the backend shouldAutoAnalyze). Videos are
// registered but not sent through the vision pipeline yet.
export function shouldAnalyzeCanvasAsset(kind: "image" | "video"): boolean {
  return kind === "image";
}
