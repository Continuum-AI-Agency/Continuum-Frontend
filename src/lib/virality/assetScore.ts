import { clipScoreSchema, type MediaAsset, type ViralityScore } from '@continuum/contracts';

// Clips carry their virality score in media.assets.origin_ref.scoreStub — written by
// the clip-asset edge fn at register time from the backend's per-section score.
// originRef is a loose record on the wire, so narrow it defensively: a malformed or
// pre-virality stub simply yields null and the UI shows nothing.
export function viralityScoreForAsset(asset: MediaAsset): ViralityScore | null {
  if (asset.source !== 'clip') return null;
  const stub = (asset.originRef as { scoreStub?: unknown } | null | undefined)?.scoreStub;
  if (!stub) return null;
  const parsed = clipScoreSchema.safeParse(stub);
  if (!parsed.success) return null;
  return parsed.data.virality ?? null;
}
