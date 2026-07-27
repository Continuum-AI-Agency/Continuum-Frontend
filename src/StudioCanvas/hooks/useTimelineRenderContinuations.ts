'use client';

import {
  type CanvasRenderContinuation,
  type CanvasRenderContinuationClaimRequest,
  type CanvasRenderContinuationClaimResponse,
  type CanvasRenderContinuationFinishRequest,
  type CanvasRenderContinuationFinishResponse,
  type CanvasRenderContinuationRenewRequest,
  type CanvasRenderContinuationRenewResponse,
  canvasRenderContinuationSchema,
} from '@continuum/contracts';
import { useEffect, useRef, useState } from 'react';
import {
  claimCanvasRenderContinuation,
  finishCanvasRenderContinuation,
  renewCanvasRenderContinuation,
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
    if (!parsed.success) return [];
    const leaseExpired =
      parsed.data.status === 'running' &&
      parsed.data.leaseExpiresAt !== undefined &&
      new Date(parsed.data.leaseExpiresAt).getTime() <= Date.now();
    if (parsed.data.status !== 'pending' && !leaseExpired) return [];
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
  renew(
    request: CanvasRenderContinuationRenewRequest,
  ): Promise<CanvasRenderContinuationRenewResponse>;
};

export async function resumeTimelineRenderContinuation(
  request: CanvasRenderContinuationClaimRequest,
  dependencies: ResumeContinuationDependencies,
): Promise<boolean> {
  let claimToken: string | undefined;
  let completedLeafIds: string[] = [];
  let renewalTimer: ReturnType<typeof setInterval> | undefined;
  try {
    const claim = await dependencies.claim(request);
    if (!claim.claimed) return false;
    if (!claim.claimToken) throw new Error('Continuation claim did not return a lease token');
    claimToken = claim.claimToken;
    completedLeafIds = [...claim.completedLeafIds];
    const leaseRequest = () => ({
      ...request,
      claimToken: claim.claimToken as string,
      completedLeafIds,
    });
    renewalTimer = setInterval(() => {
      void dependencies.renew(leaseRequest()).catch(() => undefined);
    }, 20_000);

    for (const targetNodeId of claim.downstreamLeafIds) {
      if (completedLeafIds.includes(targetNodeId)) continue;
      await dependencies.executeTarget(targetNodeId);
      completedLeafIds = [...completedLeafIds, targetNodeId];
      await dependencies.renew(leaseRequest());
    }

    await dependencies.finish({
      ...request,
      claimToken,
      completedLeafIds,
      status: 'done',
    });
    return true;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error('Downstream workflow failed');
    if (claimToken) {
      await dependencies
        .finish({
          ...request,
          claimToken,
          completedLeafIds,
          status: 'error',
          error: error.message,
        })
        .catch(() => undefined);
    }
    throw error;
  } finally {
    if (renewalTimer) clearInterval(renewalTimer);
  }
}

export function useTimelineRenderContinuations(
  brandProfileId: string | undefined,
  roomId: string | undefined,
): void {
  const controls = useWorkflowExecution();
  const nodes = useStudioStore((state) => state.nodes) as StudioNode[];
  const attemptedRef = useRef(new Set<string>());
  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const [, requestResumePass] = useState(0);
  const pending = readPendingContinuations(nodes);
  const claimantIdRef = useRef(crypto.randomUUID());

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
            claimantId: claimantIdRef.current,
          },
          {
            claim: claimCanvasRenderContinuation,
            finish: finishCanvasRenderContinuation,
            renew: renewCanvasRenderContinuation,
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
            if (mountedRef.current) requestResumePass((current) => current + 1);
          },
          retry ? 2_000 : 0,
        );
      }
    })();
  }, [brandProfileId, controls, pending, roomId]);
}
