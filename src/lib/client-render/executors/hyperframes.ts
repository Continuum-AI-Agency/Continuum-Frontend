import {
  completeHyperframesRender,
  createHyperframesReviewUploads,
  getHyperframesClientRenderWork,
  getHyperframesRevision,
  reportHyperframesProgress,
  submitHyperframesReview,
} from '@/lib/api/hyperframesAgent.client';
import {
  captureHyperframesReviewFrames,
  renderHyperframesVideo,
} from '@/lib/hyperframes-agent/browserRenderer';
import { useStudioStore } from '@/StudioCanvas/stores/useStudioStore';
import type { HyperframesAgentNodeData } from '@/StudioCanvas/types';
import { persistTimelineRender } from '@/StudioCanvas/utils/persistTimelineRender';
import type { ClientRenderExecutor } from '../executorRegistry';

/**
 * Mirror the render's real phase onto the canvas node.
 *
 * The node's own status was written once, optimistically, when the turn was posted and
 * never again — so `labelForStatus`'s 'reviewing' and 'rendering' cases were unreachable
 * and a run that WAS rendering still read "Queued" (Airtable #296/#295). A no-op when
 * this tab has some other canvas open, because `updateNodeData` ignores an unknown id.
 */
const markNode = (nodeId: string, data: Partial<HyperframesAgentNodeData>): void => {
  useStudioStore.getState().updateNodeData(nodeId, data);
};

const waitForWork = (signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, 1_000);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException('Render stopped.', 'AbortError'));
      },
      { once: true },
    );
  });

export const executeHyperframesClientRender: ClientRenderExecutor = async (context) => {
  const spec = context.job.executionSpec;
  if (spec.kind !== 'hyperframes_agent') {
    throw new Error('The HyperFrames executor received the wrong render job kind.');
  }

  for (;;) {
    if (context.signal.aborted) throw new DOMException('Render stopped.', 'AbortError');
    const { work } = await getHyperframesClientRenderWork(
      spec.runId,
      context.leaseToken,
      context.signal,
    );

    if (work.kind === 'completed') {
      markNode(spec.nodeId, { status: 'completed', isExecuting: false, isComplete: true });
      return {
        resultAssetIds: work.resultAssetIds,
        title: 'HyperFrames video finished',
        description: 'The video is saved to Library and ready on the canvas.',
      };
    }
    if (work.kind === 'failed') {
      markNode(spec.nodeId, { status: 'failed', isExecuting: false, error: work.message });
      throw new Error(work.message);
    }
    if (work.kind === 'waiting') {
      await context.update({ state: 'claimed', phase: 'Waiting for the agent' });
      await waitForWork(context.signal);
      continue;
    }

    const response = await getHyperframesRevision(spec.runId, context.signal, context.leaseToken);
    if (
      response.revision.revisionId !== work.revisionId ||
      response.revision.fingerprint !== work.fingerprint
    ) {
      await waitForWork(context.signal);
      continue;
    }
    const composition = {
      htmlUrl: response.compositionUrl,
      assets: response.assets,
      width: response.revision.width,
      height: response.revision.height,
      durationSeconds: response.revision.durationSeconds,
      fps: 30 as const,
    };

    if (work.kind === 'review') {
      await context.update({ state: 'rendering', progress: 0, phase: 'Reviewing frames' });
      markNode(spec.nodeId, { status: 'reviewing', isExecuting: true, progress: 0 });
      const frames = await captureHyperframesReviewFrames({
        composition,
        timestampsSeconds: work.timestampsSeconds,
        signal: context.signal,
      });
      const uploadResponse = await createHyperframesReviewUploads(
        spec.runId,
        {
          revisionId: work.revisionId,
          fingerprint: work.fingerprint,
          frameCount: frames.length,
        },
        context.signal,
        context.leaseToken,
      );
      await Promise.all(
        uploadResponse.uploads.map(async (upload, index) => {
          const frame = frames[index];
          if (!frame) throw new Error('Review upload did not match captured frame count.');
          const result = await fetch(upload.signedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/png' },
            body: frame,
            signal: context.signal,
          });
          if (!result.ok) throw new Error(`Review frame upload failed (${result.status}).`);
        }),
      );
      await submitHyperframesReview(
        spec.runId,
        {
          revisionId: work.revisionId,
          fingerprint: work.fingerprint,
          frames: uploadResponse.uploads.map((upload, index) => ({
            timestampSeconds: work.timestampsSeconds[index] ?? 0,
            storage: upload.storage,
          })),
          capabilities: {
            avc: context.capabilities.avc,
            aac: context.capabilities.aac,
          },
        },
        context.signal,
        context.leaseToken,
      );
      await context.update({ state: 'claimed', progress: 0, phase: 'Agent checking review' });
      continue;
    }

    await context.update({ state: 'rendering', progress: 0, phase: 'Rendering video' });
    markNode(spec.nodeId, { status: 'rendering', isExecuting: true, progress: 0 });
    let lastReportedBucket = -1;
    const rendered = await renderHyperframesVideo({
      composition,
      signal: context.signal,
      onProgress: (progress) => {
        const bucket = Math.floor(progress * 10);
        if (bucket <= lastReportedBucket) return;
        lastReportedBucket = bucket;
        markNode(spec.nodeId, { status: 'rendering', progress });
        void Promise.all([
          context.update({ state: 'rendering', progress, phase: 'Rendering video' }),
          reportHyperframesProgress(
            spec.runId,
            { revisionId: work.revisionId, progress },
            context.signal,
            context.leaseToken,
          ),
        ]).catch(() => undefined);
      },
    });
    await context.update({ state: 'saving', progress: 1, phase: 'Saving to Library' });
    const persisted = await persistTimelineRender({
      blob: rendered.blob,
      brandId: context.job.brandId,
      nodeId: spec.nodeId,
    });
    await completeHyperframesRender(
      spec.runId,
      {
        revisionId: work.revisionId,
        fingerprint: work.fingerprint,
        assetId: persisted.assetId,
        storage: { bucket: persisted.bucket, path: persisted.storagePath },
        durationSeconds: rendered.durationSeconds,
        width: rendered.width,
        height: rendered.height,
      },
      context.signal,
      context.leaseToken,
    );
    markNode(spec.nodeId, {
      status: 'completed',
      isExecuting: false,
      isComplete: true,
      progress: 1,
      renderOutputAssetId: persisted.assetId,
      // `persistTimelineRender` returns both; stamping only the asset id left a finished
      // HyperFrames video unable to feed an API Render.
      renderOutputAssetVersionId: persisted.versionId,
    });
    return {
      resultAssetIds: [persisted.assetId],
      title: 'HyperFrames video finished',
      description: 'The video is saved to Library and ready on the canvas.',
    };
  }
};
