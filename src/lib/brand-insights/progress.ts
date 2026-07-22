import { TRENDS_STAGE_LABELS, TRENDS_STAGE_ORDER, type TrendsStage } from '@continuum/contracts';

// Stage vocabulary is owned by @continuum/contracts and shared with the Backend
// emit side (setProgress in metaHarvesterWorkflow.ts) so the two cannot drift.

export const BRAND_INSIGHTS_PROGRESS_STAGE_ORDER = TRENDS_STAGE_ORDER;

export type BrandInsightsProgressStage = TrendsStage;

export type BrandInsightsProgressStep = {
  id: BrandInsightsProgressStage;
  label: string;
  status: 'completed' | 'current' | 'pending';
};

export function isBrandInsightsProgressStage(value: string): value is BrandInsightsProgressStage {
  return (BRAND_INSIGHTS_PROGRESS_STAGE_ORDER as readonly string[]).includes(value);
}

function resolveCurrentStage(
  stage?: string | null,
  status?: string | null,
): BrandInsightsProgressStage {
  if (stage && isBrandInsightsProgressStage(stage)) {
    return stage;
  }

  if (status === 'completed') {
    return 'completed';
  }

  if (status === 'failed' || status === 'error' || status === 'not_found') {
    return 'failed';
  }

  return 'queued';
}

export function buildBrandInsightsProgressSteps(input: {
  stage?: string | null;
  status?: string | null;
}): BrandInsightsProgressStep[] {
  const current = resolveCurrentStage(input.stage, input.status);
  const currentIndex = BRAND_INSIGHTS_PROGRESS_STAGE_ORDER.indexOf(current);

  return BRAND_INSIGHTS_PROGRESS_STAGE_ORDER.map((id, index) => ({
    id,
    label: TRENDS_STAGE_LABELS[id],
    status: index < currentIndex ? 'completed' : index === currentIndex ? 'current' : 'pending',
  }));
}
