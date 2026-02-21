import { describe, expect, it } from 'bun:test';
import type { AiStudioWorkflow } from '@/lib/schemas/aiStudio';
import { filterWorkflowsByQuery, sortWorkflowsByRecency } from './workflowList';

const buildWorkflow = (overrides: Partial<AiStudioWorkflow>): AiStudioWorkflow => ({
  id: overrides.id ?? 'wf-1',
  brandProfileId: overrides.brandProfileId ?? 'brand-1',
  name: overrides.name ?? 'Workflow',
  description: overrides.description,
  nodes: overrides.nodes ?? [],
  edges: overrides.edges ?? [],
  metadata: overrides.metadata,
  createdAt: overrides.createdAt ?? '2026-02-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt,
});

describe('workflowList', () => {
  it('sorts workflows by updatedAt then createdAt descending', () => {
    const workflows = [
      buildWorkflow({ id: 'wf-older', name: 'Older', updatedAt: '2026-02-10T00:00:00.000Z' }),
      buildWorkflow({ id: 'wf-newer', name: 'Newer', updatedAt: '2026-02-18T00:00:00.000Z' }),
      buildWorkflow({
        id: 'wf-created-only',
        name: 'Created Only',
        createdAt: '2026-02-19T00:00:00.000Z',
        updatedAt: undefined,
      }),
    ];

    const sorted = sortWorkflowsByRecency(workflows);
    expect(sorted.map((workflow) => workflow.id)).toEqual(['wf-created-only', 'wf-newer', 'wf-older']);
  });

  it('filters workflows by name and description', () => {
    const workflows = [
      buildWorkflow({ id: 'wf-1', name: 'Launch Flow', description: 'Hero creative' }),
      buildWorkflow({ id: 'wf-2', name: 'Weekly Planner', description: 'Organic schedule' }),
      buildWorkflow({ id: 'wf-3', name: 'Retargeting', description: 'Paid social setup' }),
    ];

    expect(filterWorkflowsByQuery(workflows, 'planner').map((workflow) => workflow.id)).toEqual(['wf-2']);
    expect(filterWorkflowsByQuery(workflows, 'hero').map((workflow) => workflow.id)).toEqual(['wf-1']);
    expect(filterWorkflowsByQuery(workflows, '').map((workflow) => workflow.id)).toEqual(['wf-1', 'wf-2', 'wf-3']);
  });
});
