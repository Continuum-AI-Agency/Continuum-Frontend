import type { AiStudioWorkflow } from '@/lib/schemas/aiStudio';

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
