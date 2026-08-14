// Build the durable `content_json` for an AI Studio "apply to post" as
// USER-SUPPLIED media. Without this, the apply only uploaded bytes + a media
// library row and never touched the draft row, so:
//   - the persisted media stayed `mediaStatus` !== 'user_supplied', and
//   - it carried no re-signable `publishingAssets`,
// which let the Stage-2 `expand_draft` job regenerate the blueprint (its
// attach-wins guard missed) and let a calendar refetch re-read the agent media
// — the applied creative reverted.
//
// Routing through the shared `shapeUserSuppliedMedia` writes BOTH the URL
// (mediaSuggestion.assetUrl/url) AND the re-signable media handle
// (publishingAssets[].bucket+storagePath), stamped `mediaStatus: 'user_supplied'`
// so every downstream attach-wins guard preserves it.

import { type CreativeRef, shapeUserSuppliedMedia } from '@continuum/contracts';

export type PersistedApplyAsset = {
  role: string;
  kind: 'image' | 'video';
  slideIndex?: number;
  storagePath: string;
  storageUrl: string;
  mimeType?: string;
  width?: number;
  height?: number;
  // Video reels carry a duration so the Planner preview can show it; images omit it.
  durationSec?: number;
};

// Media-output fields on `mediaSuggestion` that describe the previous (agent)
// creative. They are dropped on apply so a kind switch (e.g. agent carousel →
// applied single image) cannot leave conflicting assets/reel/storyboard behind.
const MEDIA_OUTPUT_KEYS: ReadonlySet<string> = new Set([
  'kind',
  'mediaStatus',
  'url',
  'bucket',
  'assetUrl',
  'signedUrl',
  'assetBase64',
  'mimeType',
  'width',
  'height',
  'assets',
  'reel',
  'hyperframe',
  'storyboard',
]);

export function buildUserSuppliedContentJson(params: {
  existingContentJson: Record<string, unknown> | null | undefined;
  assets: PersistedApplyAsset[];
  bucket: string;
}): Record<string, unknown> {
  const { existingContentJson, assets, bucket } = params;
  if (assets.length === 0) {
    throw new Error('buildUserSuppliedContentJson: at least one applied asset is required');
  }

  const existing = (existingContentJson ?? {}) as Record<string, unknown>;
  const existingCreative = (existing.creative as Record<string, unknown> | undefined) ?? {};
  const existingMs =
    (existingCreative.mediaSuggestion as Record<string, unknown> | undefined) ?? {};

  // The durable re-sign (backend resignDraftMediaUrls, FE useDraftWithFreshMedia)
  // keys off bucket+storagePath, so the synthetic assetId is just a stable handle.
  const refs: CreativeRef[] = assets.map((asset) => ({
    assetId: asset.storagePath,
    bucket,
    storagePath: asset.storagePath,
    kind: asset.kind,
    ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
    ...(asset.width !== undefined ? { width: asset.width } : {}),
    ...(asset.height !== undefined ? { height: asset.height } : {}),
    ...(asset.durationSec !== undefined ? { durationSec: asset.durationSec } : {}),
    signedUrl: asset.storageUrl,
  }));

  const { mediaSuggestionPatch, publishingAssets, contentPatch } = shapeUserSuppliedMedia(refs);

  const preservedMs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(existingMs)) {
    if (!MEDIA_OUTPUT_KEYS.has(key)) preservedMs[key] = value;
  }

  const existingContent = (existing.content as Record<string, unknown> | undefined) ?? {};

  return {
    ...existing,
    // The applied media IS the format. `mediaSuggestion.kind` was already reconciled here;
    // `content.format` was not, so applying three images to a reel left a reel with no video
    // that the publish gate passed and staging then failed on, once per scheduler tick.
    content: { ...existingContent, ...contentPatch },
    creative: {
      ...existingCreative,
      mediaSuggestion: { ...preservedMs, ...mediaSuggestionPatch },
    },
    publishingAssets,
  };
}
