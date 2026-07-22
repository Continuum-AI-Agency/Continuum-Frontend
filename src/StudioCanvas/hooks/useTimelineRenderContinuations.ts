'use client';

import {
  type CanvasRenderContinuation,
  type CanvasRenderContinuationClaimRequest,
  type CanvasRenderContinuationClaimResponse,
  type CanvasRenderContinuationFinishRequest,
  type CanvasRenderContinuationFinishResponse,
  canvasRenderContinuationSchema,
} from '@continuum/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  claimCanvasRenderContinuation,
  finishCanvasRenderContinuation,
} from '@/lib/api/canvasRender.client';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { executeWorkflow } from '../utils/executeWorkflow';
import { useWorkflowExecution } from './useWorkflowExecution';

type PendingContinuation = {
  nodeId: string;
  continuation: CanvasRenderContinuation;
};

function readPendingContinuations(nodes: StudioNode[]): PendingContinuation[] {
  return nodes.flatMap((node) => {
    if (node.type !== 'timelineEditor') return [];
    const parsed = canvasRenderContinuationSchema.safeParse(node.data.renderContinuation);
    if (!parsed.success || parsed.data.status !== 'pending') return [];
    return [{ nodeId: node.id, continuation: parsed.data }];
  });
}

function continuationKey(nodeId: string, jobId: string): string {
  return `${nodeId}:${jobId}`;
}

type ResumeContinuationDependencies = {
  claim(
    request: CanvasRenderContinuationClaimRequest,
  ): Promise<CanvasRenderContinuationClaimResponse>;
  executeTarget(nodeId: string): Promise<void>;
  finish(
    request: CanvasRenderContinuationFinishRequest,
  ): Promise<CanvasRenderContinuationFinishResponse>;
};

export async function resumeTimelineRenderContinuation(
  request: CanvasRenderContinuationClaimRequest,
  dependencies: ResumeContinuationDependencies,
): Promise<boolean> {
  let claimed = false;
  try {
    const claim = await dependencies.claim(request);
    claimed = claim.claimed;
    if (!claim.claimed) return false;

    for (const targetNodeId of claim.downstreamLeafIds) {
      await dependencies.executeTarget(targetNodeId);
    }

    await dependencies.finish({ ...request, status: 'done' });
    return true;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error('Downstream workflow failed');
    if (claimed) {
      await dependencies
        .finish({ ...request, status: 'error', error: error.message })
        .catch(() => undefined);
    }
    throw error;
  }
}

export function useTimelineRenderContinuations(
  brandProfileId: string | undefined,
  roomId: string | undefined,
): void {
  const controls = useWorkflowExecution();
  const nodes = useStudioStore((state) => state.nodes) as StudioNode[];
  const pending = useMemo(() => readPendingContinuations(nodes), [nodes]);
  const attemptedRef = useRef(new Set<string>());
  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const [resumePass, setResumePass] = useState(0);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    if (!brandProfileId || !roomId || runningRef.current) return;
    const next = pending.find(
      ({ nodeId, continuation }) =>
        !attemptedRef.current.has(continuationKey(nodeId, continuation.jobId)),
    );
    if (!next) return;

    const key = continuationKey(next.nodeId, next.continuation.jobId);
    attemptedRef.current.add(key);
    runningRef.current = true;
    let retry = false;

    void (async () => {
      try {
        await resumeTimelineRenderContinuation(
          {
            jobId: next.continuation.jobId,
            brandProfileId,
            roomId,
            nodeId: next.nodeId,
          },
          {
            claim: claimCanvasRenderContinuation,
            finish: finishCanvasRenderContinuation,
            executeTarget: async (targetNodeId) => {
              await executeWorkflow(controls, {
                targetNodeId,
                clearDownstream: false,
                brandId: brandProfileId,
                roomId,
              });

              const target = (useStudioStore.getState().nodes as StudioNode[]).find(
                (node) => node.id === targetNodeId,
              );
              if (!target || target.data.error || target.data.isComplete !== true) {
                throw new Error(
                  typeof target?.data.error === 'string'
                    ? target.data.error
                    : `Downstream node ${targetNodeId} did not complete`,
                );
              }
            },
          },
        );
      } catch {
        attemptedRef.current.delete(key);
        retry = true;
      } finally {
        runningRef.current = false;
        window.setTimeout(
          () => {
            if (mountedRef.current) setResumePass((current) => current + 1);
          },
          retry ? 2_000 : 0,
        );
      }
    })();
  }, [brandProfileId, controls, pending, resumePass, roomId]);
}
