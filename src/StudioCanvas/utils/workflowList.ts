import { parsePipelineMetadata } from '@continuum/contracts';
import type { AiStudioWorkflow } from '@/lib/schemas/aiStudio';
import type { WorkflowLibraryItem } from '@/lib/schemas/workflowLibrary';

const toTimestamp = (value?: string) => {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

export function sortWorkflowsByRecency(workflows: AiStudioWorkflow[]): AiStudioWorkflow[] {
  return [...workflows].sort((left, right) => {
    const leftTime = toTimestamp(left.updatedAt ?? left.createdAt);
    const rightTime = toTimestamp(right.updatedAt ?? right.createdAt);
    return rightTime - leftTime;
  });
}

export function filterWorkflowsByQuery(
  workflows: AiStudioWorkflow[],
  query: string,
): AiStudioWorkflow[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return workflows;

  return workflows.filter((workflow) => {
    const nameMatch = workflow.name.toLowerCase().includes(normalizedQuery);
    const descriptionMatch = workflow.description?.toLowerCase().includes(normalizedQuery) ?? false;
    return nameMatch || descriptionMatch;
  });
}

/**
 * The number a pre-made leads with, or null.
 *
 * The ten shipped templates are named "1. Founder" … "10. Minimal Branding", and that
 * numbering IS the curated order — it is not decoration and there is no rank column. Sorting
 * them by name puts 10 between 1 and 2, which is what the library did.
 */
export function premadeRank(name: string): number | null {
  const match = /^\s*(\d+)\s*[.)]/.exec(name);
  if (!match) return null;
  const rank = Number.parseInt(match[1], 10);
  return Number.isFinite(rank) ? rank : null;
}

/**
 * Pre-mades in the order they were curated: numbered first, ascending, then everything else
 * alphabetically. An unnumbered template is not an error — it just has no place in the
 * sequence, so it sorts after the ones that do.
 */
export function sortPremades(items: WorkflowLibraryItem[]): WorkflowLibraryItem[] {
  return [...items].sort((left, right) => {
    const leftRank = premadeRank(left.name);
    const rightRank = premadeRank(right.name);
    if (leftRank !== null && rightRank !== null) return leftRank - rightRank;
    if (leftRank !== null) return -1;
    if (rightRank !== null) return 1;
    return left.name.localeCompare(right.name);
  });
}

/**
 * Split the brand's saved workflows into the two tabs.
 *
 * A published pipeline is shown ONLY under Pipelines. It is still a workflow underneath, but
 * listing it twice makes the third tab meaningless — the point of it is to answer "what have
 * we published", and an answer you have to cross-reference is not one.
 */
export function partitionSavedWorkflows(workflows: AiStudioWorkflow[]): {
  saved: AiStudioWorkflow[];
  pipelines: AiStudioWorkflow[];
} {
  const saved: AiStudioWorkflow[] = [];
  const pipelines: AiStudioWorkflow[] = [];
  for (const workflow of workflows) {
    if (parsePipelineMetadata(workflow.metadata)) pipelines.push(workflow);
    else saved.push(workflow);
  }
  return { saved, pipelines };
}
