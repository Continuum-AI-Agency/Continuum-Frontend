import {
  preparePlannerCompositionResponseSchema,
  type ReelClip,
  reelClipSchema,
  type SignedPlannerCompositionClip,
} from '@continuum/contracts';

import { type StitchAndFinalizeReelResult, stitchAndFinalizeReel } from './reelClientStitch';

export type StitchPlannerReelParams = {
  brandId: string;
  draftId: string;
  sourceRevision: string;
  durationSec: number;
  captions?: {
    enabled: boolean;
    sourceAssetId?: string;
    referenceAssetIds?: string[];
  };
  signal?: AbortSignal;
  onStage?: (label: string) => void;
};

export type StitchPlannerReelResult = {
  composition: ReturnType<typeof preparePlannerCompositionResponseSchema.parse>['composition'];
  reel: StitchAndFinalizeReelResult;
};

type StitchPlannerReelDependencies = {
  fetcher?: typeof fetch;
  stitcher?: typeof stitchAndFinalizeReel;
};

export function toReelClip(clip: SignedPlannerCompositionClip): ReelClip {
  return reelClipSchema.parse({
    index: clip.index,
    role: clip.role,
    durationSec: clip.durationSec,
    bucket: clip.bucket,
    clipUrl: clip.storagePath,
    signedClipUrl: clip.signedUrl,
    captionText: clip.captionText,
    mimeType: clip.mimeType,
    assetId: clip.assetId,
  });
}

/**
 * Refresh the durable scene clips through the idempotent composition endpoint,
 * then use the existing client-side Mediabunny stitch/finalize path. Refreshing
 * here avoids trusting signed URLs persisted when the clips were first created.
 */
export async function stitchPlannerReel(
  params: StitchPlannerReelParams,
  dependencies: StitchPlannerReelDependencies = {},
): Promise<StitchPlannerReelResult> {
  const fetcher = dependencies.fetcher ?? fetch;
  const stitcher = dependencies.stitcher ?? stitchAndFinalizeReel;

  params.onStage?.('Refreshing clips…');
  const response = await fetcher('/api/organic/ai-studio/compositions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandId: params.brandId, draftId: params.draftId }),
    signal: params.signal,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Could not refresh the reel clips.');
  }

  const prepared = preparePlannerCompositionResponseSchema.parse(await response.json());
  if (prepared.composition.sourceFingerprint !== params.sourceRevision) {
    throw new Error(
      'The Planner reel clips changed after this render job was created. Create a new render job for the latest revision.',
    );
  }
  const reel = await stitcher({
    brandId: params.brandId,
    draftId: params.draftId,
    clips: prepared.clips.map(toReelClip),
    durationSec: params.durationSec,
    captions: params.captions,
    signal: params.signal,
    onStage: params.onStage,
  });

  return { composition: prepared.composition, reel };
}
