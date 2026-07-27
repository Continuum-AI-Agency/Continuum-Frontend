'use client';

import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
} from '@xyflow/react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { WorkflowEdgeExecutionState } from './workflowVisualState';

export type WorkflowEdgeData = {
  status: WorkflowEdgeExecutionState;
  sourceLabel: string;
  targetLabel: string;
  sourcePort: string;
  targetPort: string;
};

export type WorkflowCanvasEdge = Edge<WorkflowEdgeData, 'workflow'>;

const edgeColor: Record<WorkflowEdgeExecutionState, string> = {
  idle: 'var(--muted-foreground)',
  pending: 'var(--warning)',
  running: 'var(--primary)',
  completed: 'var(--success)',
  failed: 'var(--destructive)',
  skipped: 'var(--muted-foreground)',
};

export function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  data,
}: EdgeProps<WorkflowCanvasEdge>) {
  const shouldReduceMotion = useReducedMotion();
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 16,
  });
  const status = data?.status ?? 'idle';
  const color = edgeColor[status];

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={20}
        style={{
          stroke: color,
          strokeWidth: selected || status === 'running' || status === 'failed' ? 2 : 1.4,
          opacity: status === 'skipped' ? 0.3 : status === 'idle' ? 0.5 : 0.9,
          strokeDasharray: status === 'pending' || status === 'skipped' ? '5 5' : undefined,
        }}
        className={cn('workflow-edge-path', `workflow-edge-path--${status}`)}
      />
      {status === 'running' && !shouldReduceMotion ? (
        <circle fill={color} r="3.5" focusable="false">
          <animateMotion dur="1.25s" path={path} repeatCount="indefinite" />
        </circle>
      ) : null}
      {selected && data ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded-md border bg-popover px-2 py-1 text-2xs text-popover-foreground"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {data.sourcePort} → {data.targetPort}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
