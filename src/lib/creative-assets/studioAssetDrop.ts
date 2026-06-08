// Bridges a unified-library MediaAsset into the StudioCanvas drag-drop contract.
// The canvas dropzone already consumes `asset_drop` payloads on the
// `application/reactflow-node-data` MIME (see CreativeLibrarySidebar handleDragStart),
// so library assets become grabbable with zero canvas changes — we just map the
// MediaAsset's bucket/storagePath/signedUrl/mimeType into the same shape.

import type { MediaAsset } from "@continuum/contracts";
import { sanitizeCreativeAssetUrl } from "./assetUrl";

export const STUDIO_ASSET_DROP_MIME = "application/reactflow-node-data";

export type StudioAssetDropPayload = {
  type: "asset_drop";
  payload: {
    source: "supabase";
    bucket: string;
    path: string;
    publicUrl: string | null;
    mimeType: string;
    meta: {
      assetId: string;
      title?: string;
      kind: MediaAsset["kind"];
    };
  };
};

export function buildStudioAssetDropPayload(asset: MediaAsset): StudioAssetDropPayload {
  return {
    type: "asset_drop",
    payload: {
      source: "supabase",
      bucket: asset.bucket,
      path: asset.storagePath,
      publicUrl: sanitizeCreativeAssetUrl(asset.signedUrl),
      mimeType: asset.mimeType,
      meta: {
        assetId: asset.id,
        title: asset.title ?? undefined,
        kind: asset.kind,
      },
    },
  };
}

// Writes the canvas drop contract onto a DataTransfer. text/plain carries the
// resolved url so non-canvas drop targets still get something usable.
export function setStudioAssetDragData(
  dataTransfer: DataTransfer,
  asset: MediaAsset,
): void {
  const payload = buildStudioAssetDropPayload(asset);
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(STUDIO_ASSET_DROP_MIME, JSON.stringify(payload));
  dataTransfer.setData("text/plain", payload.payload.publicUrl ?? "");
}
