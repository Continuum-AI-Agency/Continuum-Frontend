// Bridges a unified-library MediaAsset into the StudioCanvas drag-drop contract.
// The canvas dropzone already consumes `asset_drop` payloads on the
// `application/reactflow-node-data` MIME (see CreativeLibrarySidebar handleDragStart),
// so library assets become grabbable with zero canvas changes — we just map the
// MediaAsset's bucket/storagePath/signedUrl/mimeType into the same shape.

import type { MediaAsset } from '@continuum/contracts';
import { sanitizeCreativeAssetUrl } from './assetUrl';

export const STUDIO_ASSET_DROP_MIME = 'application/reactflow-node-data';

// The drag source offers a "copy" operation — dropping a library asset clones it
// onto the canvas. The canvas dropzone MUST advertise this same dropEffect during
// dragover; otherwise the browser reconciles effectAllowed="copy" against an
// incompatible dropEffect (e.g. "move") down to "none" and never fires `drop`.
// Shared so the source's effectAllowed and the dropzone's dropEffect can't drift.
export const STUDIO_ASSET_DROP_EFFECT = 'copy' as const;

export type StudioAssetDropPayload = {
  type: 'asset_drop';
  payload: {
    source: 'supabase';
    bucket: string;
    path: string;
    publicUrl: string | null;
    mimeType: string;
    meta: {
      assetId: string;
      brandId: string;
      title?: string;
      kind: MediaAsset['kind'];
    };
  };
};

export function buildStudioAssetDropPayload(asset: MediaAsset): StudioAssetDropPayload {
  return {
    type: 'asset_drop',
    payload: {
      source: 'supabase',
      bucket: asset.bucket,
      path: asset.storagePath,
      publicUrl: sanitizeCreativeAssetUrl(asset.signedUrl),
      mimeType: asset.mimeType,
      meta: {
        assetId: asset.id,
        brandId: asset.brandId,
        title: asset.title ?? undefined,
        kind: asset.kind,
      },
    },
  };
}

// Writes the canvas drop contract onto a DataTransfer. text/plain carries the
// resolved url so non-canvas drop targets still get something usable.
export function setStudioAssetDragData(dataTransfer: DataTransfer, asset: MediaAsset): void {
  const payload = buildStudioAssetDropPayload(asset);
  dataTransfer.effectAllowed = STUDIO_ASSET_DROP_EFFECT;
  dataTransfer.setData(STUDIO_ASSET_DROP_MIME, JSON.stringify(payload));
  dataTransfer.setData('text/plain', payload.payload.publicUrl ?? '');
}
