import { stitchPlannerReel } from '@/lib/organic/plannerReelStitch';
import type { ClientRenderExecutor } from '../executorRegistry';

export const executePlannerReelClientRender: ClientRenderExecutor = async (context) => {
  const spec = context.job.executionSpec;
  if (spec.kind !== 'planner_reel') {
    throw new Error('The Planner reel executor received the wrong render job kind.');
  }
  const sourceAssetId = context.job.inputs.find(
    (input) => input.kind === 'video' && input.sourceAssetId,
  )?.sourceAssetId;
  await context.update({ state: 'rendering', progress: 0, phase: 'Refreshing clips' });
  const result = await stitchPlannerReel({
    brandId: context.job.brandId,
    draftId: spec.draftId,
    sourceRevision: context.job.sourceRevision,
    durationSec: spec.durationSeconds,
    captions: spec.captions
      ? {
          enabled: spec.captions.enabled,
          sourceAssetId,
          referenceAssetIds: spec.ugc?.referenceAssetIds,
        }
      : undefined,
    signal: context.signal,
    onStage: (phase) => {
      void context
        .update({
          state: phase.toLowerCase().includes('final') ? 'saving' : 'rendering',
          phase: phase.replace(/…$/, ''),
        })
        .catch(() => undefined);
    },
  });
  return {
    resultAssetIds: [result.reel.assetId],
    title: 'Planner reel finished',
    description: result.reel.signedUrl
      ? 'The stitched reel is attached to the Planner draft.'
      : 'The stitched reel was saved.',
  };
};
