'use client';

// A "starter" is a saved canvas selection turned into a re-runnable recipe — the
// selected nodes (prompt + model + reference roles + skillIds) persisted through the
// same canvas_workflows lane as a full workflow, flagged with metadata.starter so the
// composer picker can single them out. Browse + apply reuses the workflow apply path.

import { useQuery } from '@tanstack/react-query';
import type { AiStudioWorkflow } from '@/lib/schemas/aiStudio';
import { listAiStudioWorkflowsAction } from './workflowActions';

export const STARTER_METADATA_FLAG = 'starter';

export const brandStartersQueryKey = (brandProfileId?: string) =>
  ['brand-starters', brandProfileId] as const;

export function isStarter(workflow: AiStudioWorkflow): boolean {
  return workflow.metadata?.[STARTER_METADATA_FLAG] === true;
}

export async function fetchBrandStarters(brandProfileId: string): Promise<AiStudioWorkflow[]> {
  const workflows = await listAiStudioWorkflowsAction(brandProfileId);
  return workflows.filter(isStarter);
}

export function useBrandStarters(brandProfileId?: string) {
  return useQuery({
    queryKey: brandStartersQueryKey(brandProfileId),
    queryFn: () =>
      brandProfileId
        ? fetchBrandStarters(brandProfileId)
        : Promise.resolve([] as AiStudioWorkflow[]),
    enabled: Boolean(brandProfileId),
  });
}
