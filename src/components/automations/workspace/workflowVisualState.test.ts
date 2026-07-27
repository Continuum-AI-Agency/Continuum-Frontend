import { describe, expect, test } from 'bun:test';
import type { AutomationNodeRun } from '@continuum/contracts';
import { liveExecutionsByNodeId, workflowEdgeExecutionState } from './workflowVisualState';

const nodeRun = (
  nodeId: string,
  status: AutomationNodeRun['status'],
  selectedHandle: string | null = null,
  attempt = 1,
): AutomationNodeRun => ({
  id: `${nodeId}-${attempt}`,
  runId: 'run-1',
  nodeId,
  nodeType: 'logic.if',
  attempt,
  status,
  selectedHandle,
  input: null,
  output: null,
  errorMessage: null,
  durationMs: 0,
  startedAt: status === 'pending' ? null : '2026-07-27T00:00:00.000Z',
  completedAt:
    status === 'completed' || status === 'failed' || status === 'skipped'
      ? '2026-07-27T00:00:01.000Z'
      : null,
});

describe('workflow visual state', () => {
  test('uses the latest repeatUntil attempt for a node', () => {
    const executions = liveExecutionsByNodeId([
      nodeRun('agent', 'completed', 'output', 1),
      nodeRun('agent', 'running', null, 2),
    ]);

    expect(executions.get('agent')).toMatchObject({ status: 'running', attempt: 2 });
  });

  test('shows only the branch selected by a completed logic node', () => {
    const executions = liveExecutionsByNodeId([
      nodeRun('condition', 'completed', 'true'),
      nodeRun('true-target', 'running'),
      nodeRun('false-target', 'skipped'),
    ]);

    expect(
      workflowEdgeExecutionState(
        {
          source: 'condition',
          sourceHandle: 'true',
          target: 'true-target',
        },
        executions,
      ),
    ).toBe('running');
    expect(
      workflowEdgeExecutionState(
        {
          source: 'condition',
          sourceHandle: 'false',
          target: 'false-target',
        },
        executions,
      ),
    ).toBe('skipped');
  });
});
