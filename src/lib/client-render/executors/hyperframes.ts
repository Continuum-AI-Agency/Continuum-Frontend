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
import { persistTimelineRender } from '@/StudioCanvas/utils/persistTimelineRender';
import type { ClientRenderExecutor } from '../executorRegistry';

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
      return {
        resultAssetIds: work.resultAssetIds,
        title: 'HyperFrames video finished',
        description: 'The video is saved to Library and ready on the canvas.',
      };
    }
    if (work.kind === 'failed') throw new Error(work.message);
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
    let lastReportedBucket = -1;
    const rendered = await renderHyperframesVideo({
      composition,
      signal: context.signal,
      onProgress: (progress) => {
        const bucket = Math.floor(progress * 10);
        if (bucket <= lastReportedBucket) return;
        lastReportedBucket = bucket;
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
    return {
      resultAssetIds: [persisted.assetId],
      title: 'HyperFrames video finished',
      description: 'The video is saved to Library and ready on the canvas.',
    };
  }
};
