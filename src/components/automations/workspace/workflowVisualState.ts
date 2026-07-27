import type { AutomationNodeRun, TestAutomationWorkflowResponse } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';

export type WorkflowExecutionStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export type WorkflowNodeExecutionView = {
  status: WorkflowExecutionStatus;
  selectedHandle: string | null;
  errorMessage: string | null;
  durationMs: number;
  attempt: number;
  startedAt: string | null;
  completedAt: string | null;
};

export type WorkflowEdgeExecutionState =
  | 'idle'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export const testExecutionsByNodeId = (
  result: TestAutomationWorkflowResponse | null,
): Map<string, WorkflowNodeExecutionView> =>
  new Map(
    result?.nodeExecutions.map((execution) => [
      execution.nodeId,
      {
        status: execution.status,
        selectedHandle: execution.selectedHandle,
        errorMessage: execution.errorMessage,
        durationMs: execution.durationMs,
        attempt: execution.iteration ?? 1,
        startedAt: null,
        completedAt: null,
      },
    ]) ?? [],
  );

export const liveExecutionsByNodeId = (
  nodeRuns: AutomationNodeRun[],
): Map<string, WorkflowNodeExecutionView> => {
  const latest = new Map<string, AutomationNodeRun>();
  for (const run of nodeRuns) {
    const current = latest.get(run.nodeId);
    if (!current || run.attempt >= current.attempt) latest.set(run.nodeId, run);
  }
  return new Map(
    [...latest].map(([nodeId, run]) => [
      nodeId,
      {
        status: run.status,
        selectedHandle: run.selectedHandle,
        errorMessage: run.errorMessage,
        durationMs: run.durationMs,
        attempt: run.attempt,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
      },
    ]),
  );
};

export const workflowEdgeExecutionState = (
  edge: Pick<Edge, 'source' | 'sourceHandle' | 'target'>,
  executions: ReadonlyMap<string, WorkflowNodeExecutionView>,
): WorkflowEdgeExecutionState => {
  const source = executions.get(edge.source);
  const target = executions.get(edge.target);
  if (!source && !target) return 'idle';
  if (target?.status === 'failed') return 'failed';
  if (source?.selectedHandle && edge.sourceHandle && source.selectedHandle !== edge.sourceHandle) {
    return 'skipped';
  }
  if (target?.status === 'running') return 'running';
  if (target?.status === 'completed' && source?.status === 'completed') return 'completed';
  if (target?.status === 'skipped' || source?.status === 'skipped') return 'skipped';
  if (target?.status === 'pending' || source?.status === 'running') return 'pending';
  return 'idle';
};
