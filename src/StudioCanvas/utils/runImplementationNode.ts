'use client';

import {
  type ApiRenderJob,
  type ImplementationRenderOutput,
  implementationRenderRequests,
  plannerDraftRequest,
} from '@continuum/contracts';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { apiRendersApi } from '../nodes/api-render/apiRendersApi';
import { publishingApi } from '../nodes/publish/publishingApi';
import { useStudioStore } from '../stores/useStudioStore';
import type { ApiRenderNodeData } from '../types';
import type { NodeOutput } from '../types/execution';

const active = new Map<string, Promise<NodeOutput>>();
const localDay = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** Node buttons and the graph executor share the same write and recovery path. */
export function runImplementationNode(nodeId: string, signal?: AbortSignal): Promise<NodeOutput> {
  const runKey = `${useStudioStore.getState().brandId}:${useStudioStore.getState().activeRoomId}:${nodeId}`;
  const pending = active.get(runKey);
  if (pending) return pending;
  const run = execute(nodeId, signal).finally(() => active.delete(runKey));
  active.set(runKey, run);
  return run;
}

async function execute(nodeId: string, signal?: AbortSignal): Promise<NodeOutput> {
  const store = useStudioStore.getState;
  const state = store();
  const node = state.getNodeById(nodeId);
  const brandId = state.brandId;
  if (!node) throw new Error('This Canvas step no longer exists.');
  const roomId = state.activeRoomId;
  const patch = (data: Record<string, unknown>) => {
    if (store().brandId !== brandId || store().activeRoomId !== roomId) return;
    store().updateNodeData(nodeId, data);
    store().triggerSave();
  };
  patch({ isExecuting: true, error: undefined });
  try {
    if (!brandId) throw new Error('Choose a brand before running this step.');
    signal?.throwIfAborted();
    if (node.type === 'plannerDraft') {
      const request = plannerDraftRequest({
        brandId,
        nodeId,
        data: node.data as Record<string, unknown>,
        nodes: state.nodes,
        edges: state.edges,
        clientKey: `canvas:${roomId ?? 'default'}:${nodeId}`,
        dayId: localDay(),
      });
      const result = await publishingApi.writeOrganicDraft(request);
      const saved = {
        targetDraftId: result.draftId,
        targetUpdatedAt: result.updatedAt,
        savedAt: new Date().toISOString(),
      };
      patch(saved);
      await waitForNodeSave(brandId, roomId, nodeId, saved, signal);
      patch({ isExecuting: false, isComplete: true });
      return { type: 'draft', draftId: result.draftId, updatedAt: result.updatedAt };
    }
    if (node.type !== 'apiRender') throw new Error('This step requires publishing review.');
    const data = node.data as ApiRenderNodeData;
    if (!data.templateKey || !data.contractHash)
      throw new Error('Choose a ready Forge template first.');
    const records = implementationRenderRequests({
      brandId,
      nodeId,
      data: data as unknown as Record<string, unknown>,
      nodes: state.nodes,
      edges: state.edges,
    });
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(
        JSON.stringify([brandId, roomId, nodeId, data.renderEpoch ?? 'initial', records]),
      ),
    );
    const signature = `render:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    const previous = node.data as Record<string, unknown>;
    const resume =
      previous.renderInputSignature === signature &&
      Array.isArray(previous.renderRequestIds) &&
      previous.renderRequestIds.length === records.length;
    const requestIds = resume
      ? (previous.renderRequestIds as string[])
      : await Promise.all(
          records.map(async (_, index) => {
            const bytes = await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(`${signature}:${index}`),
            );
            const hash = Array.from(new Uint8Array(bytes), (byte) =>
              byte.toString(16).padStart(2, '0'),
            ).join('');
            return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
          }),
        );
    patch({ renderInputSignature: signature, renderRequestIds: requestIds, status: 'submitting' });
    await waitForNodeSave(
      brandId,
      roomId,
      nodeId,
      { renderInputSignature: signature, renderRequestIds: requestIds },
      signal,
    );

    const jobs: ApiRenderJob[] = [];
    for (const [index, record] of records.entries()) {
      signal?.throwIfAborted();
      const prepared = await apiRendersApi.preflight({ ...record, requestId: requestIds[index] });
      const submitted = await apiRendersApi.createJob({
        confirmationToken: prepared.confirmationToken,
      });
      const job = await apiRendersApi.getJob(brandId, submitted.id);
      jobs.push(job);
      patch({
        activeJobIds: jobs.map((item) => item.id),
        latestJobId: job.id,
        jobIds: [...new Set([...(data.jobIds ?? []), ...jobs.map((item) => item.id)])],
      });
    }
    const deadline = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30 * 60_000)])
      : AbortSignal.timeout(30 * 60_000);
    while (
      jobs.some(
        (job) =>
          job.status !== 'failed' &&
          (job.status !== 'finished' ||
            !job.outputs.length ||
            job.outputs.some((output) => !output.assetId || !output.versionId)),
      )
    ) {
      deadline.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const aborted = () => {
          clearTimeout(timer);
          reject(deadline.reason);
        };
        const timer = setTimeout(() => {
          deadline.removeEventListener('abort', aborted);
          resolve();
        }, 5000);
        deadline.addEventListener('abort', aborted, { once: true });
        if (deadline.aborted) aborted();
      });
      for (const [index, job] of jobs.entries()) {
        if (
          job.status !== 'failed' &&
          (job.status !== 'finished' ||
            !job.outputs.length ||
            job.outputs.some((output) => !output.assetId || !output.versionId))
        )
          jobs[index] = await apiRendersApi.getJob(brandId, job.id);
      }
      patch({ status: jobs.some((job) => job.status === 'rendering') ? 'rendering' : 'queued' });
    }
    const failed = jobs.filter((job) => job.status === 'failed');
    const outputs: ImplementationRenderOutput[] = jobs.flatMap((job) =>
      job.outputs.flatMap((output) =>
        output.assetId && output.versionId
          ? [
              {
                jobId: job.id,
                outputId: output.id,
                kind: output.kind,
                fileName: output.fileName,
                assetId: output.assetId,
                versionId: output.versionId,
              },
            ]
          : [],
      ),
    );
    patch({ renderOutputs: outputs });
    if (failed.length)
      throw new Error(
        `${failed.length} render${failed.length === 1 ? '' : 's'} failed. Finished outputs remain in Library. ${failed[0]?.error ?? ''}`,
      );
    if (
      !outputs.length ||
      jobs.some((job) => job.outputs.some((output) => !output.assetId || !output.versionId))
    )
      throw new Error(
        'Rendering finished; wait for every output to be saved in Library, then resume this step.',
      );
    patch({ status: 'finished', isComplete: true, isExecuting: false });
    return { type: 'render', outputs: jobs.flatMap((job) => job.outputs) };
  } catch (cause) {
    const message = signal?.aborted
      ? 'The run stopped. Queued renders may still finish; resume to recover them.'
      : cause instanceof Error
        ? cause.message
        : 'This step failed. Check its inputs and try again.';
    patch({ isExecuting: false, isComplete: false, error: message });
    throw new Error(message, { cause });
  }
}

async function waitForNodeSave(
  brandId: string,
  roomId: string | undefined,
  nodeId: string,
  expected: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<void> {
  if (!roomId) throw new Error('Open a saved Canvas workspace before running this step.');
  const checkpoint = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(10_000)]);
  const client = createSupabaseBrowserClient();
  for (;;) {
    if (checkpoint.aborted)
      throw new Error(
        'The Canvas recovery checkpoint was not saved. Wait for Canvas sync, then retry.',
      );
    if (
      useStudioStore.getState().brandId !== brandId ||
      useStudioStore.getState().activeRoomId !== roomId
    )
      throw new Error('The Canvas workspace changed before this step completed.');
    const saved = await client
      .schema('brand_profiles')
      .from('canvas_sessions')
      .select('nodes')
      .eq('brand_profile_id', brandId)
      .eq('room_id', roomId)
      .abortSignal(checkpoint)
      .maybeSingle();
    if (saved.error)
      throw new Error(
        'The Canvas recovery checkpoint could not be read. Wait for Canvas sync, then retry.',
      );
    const persisted = Array.isArray(saved.data?.nodes)
      ? saved.data.nodes.find(
          (value) =>
            value && typeof value === 'object' && !Array.isArray(value) && value.id === nodeId,
        )
      : null;
    const data =
      persisted && typeof persisted === 'object' && !Array.isArray(persisted)
        ? persisted.data
        : null;
    if (
      data &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      Object.entries(expected).every(
        ([key, value]) => JSON.stringify(data[key]) === JSON.stringify(value),
      )
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
