import {
  completeHyperframesRender,
  createHyperframesReviewUploads,
  getHyperframesClientRenderWork,
  getHyperframesRevision,
  reportHyperframesProgress,
  submitHyperframesReview,
} from '@/lib/api/hyperframesAgent.client';
import {
  captureHyperframesReviewEvidence,
  type PreparedHyperframesComposition,
  prepareHyperframesComposition,
  renderHyperframesVideo,
} from '@/lib/hyperframes-agent/browserRenderer';
import { persistGeneratedMedia } from '@/lib/library/persistGeneratedMedia';
import { useStudioStore } from '@/StudioCanvas/stores/useStudioStore';
import type { HyperframesAgentNodeData } from '@/StudioCanvas/types';
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

export async function runHyperframesStage<T>(
  label: string,
  attempts: number,
  signal: AbortSignal,
  work: () => Promise<T>,
  beforeRetry?: () => void | Promise<void>,
): Promise<T> {
  let cause: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        throw error;
      }
      cause = error;
      if (attempt < attempts) {
        await beforeRetry?.();
        await waitForWork(signal);
      }
    }
  }
  const detail = cause instanceof Error ? cause.message : String(cause);
  throw new Error(`${label} failed after ${attempts} attempts: ${detail}`, { cause });
}

export const executeHyperframesClientRender: ClientRenderExecutor = async (context) => {
  const spec = context.job.executionSpec;
  if (spec.kind !== 'hyperframes_agent') {
    throw new Error('The HyperFrames executor received the wrong render job kind.');
  }

  let prepared: { key: string; value: PreparedHyperframesComposition } | null = null;
  const requirePrepared = (): PreparedHyperframesComposition => {
    if (!prepared) throw new Error('HyperFrames composition was not prepared.');
    return prepared.value;
  };
  try {
    for (;;) {
      if (context.signal.aborted) throw new DOMException('Render stopped.', 'AbortError');
      const { work } = await runHyperframesStage('Checking agent progress', 3, context.signal, () =>
        getHyperframesClientRenderWork(spec.runId, context.leaseToken, context.signal),
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
      if (work.kind === 'finalize') {
        await context.update({ state: 'saving', progress: 1, phase: 'Finalizing saved video' });
        await runHyperframesStage('Finalizing the saved video', 3, context.signal, () =>
          completeHyperframesRender(
            spec.runId,
            {
              revisionId: work.revisionId,
              fingerprint: work.fingerprint,
              assetId: work.assetId,
            },
            context.signal,
            context.leaseToken,
          ),
        );
        markNode(spec.nodeId, {
          status: 'completed',
          isExecuting: false,
          isComplete: true,
          progress: 1,
          renderOutputAssetId: work.assetId,
        });
        return {
          resultAssetIds: [work.assetId],
          title: 'HyperFrames video finished',
          description: 'The recovered video is saved to Library and ready on the canvas.',
        };
      }

      const response = await runHyperframesStage('Loading the composition', 3, context.signal, () =>
        getHyperframesRevision(spec.runId, context.signal, context.leaseToken),
      );
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
        shaderStack: spec.shaderStack,
      };
      const preparedKey = `${work.revisionId}:${work.fingerprint}`;
      const currentPrepared = prepared as {
        key: string;
        value: PreparedHyperframesComposition;
      } | null;
      if (currentPrepared?.key !== preparedKey) {
        currentPrepared?.value.dispose();
        prepared = {
          key: preparedKey,
          value: await runHyperframesStage('Preparing the composition', 2, context.signal, () =>
            prepareHyperframesComposition(composition, context.signal),
          ),
        };
      }

      if (work.kind === 'review') {
        if (!response.revision.compositionSpec) {
          throw new Error('HyperFrames review has no persisted scene contract.');
        }
        await context.update({ state: 'rendering', progress: 0, phase: 'Reviewing frames' });
        markNode(spec.nodeId, { status: 'reviewing', isExecuting: true, progress: 0 });
        const evidence = await runHyperframesStage(
          'Capturing dense review evidence',
          2,
          context.signal,
          () =>
            captureHyperframesReviewEvidence({
              composition,
              spec: response.revision.compositionSpec!,
              timestampsSeconds: work.timestampsSeconds,
              signal: context.signal,
              prepared: requirePrepared(),
            }),
        );
        const reviewImages = [...evidence.frames, evidence.motionStrip];
        const uploadResponse = await runHyperframesStage(
          'Preparing review uploads',
          3,
          context.signal,
          () =>
            createHyperframesReviewUploads(
              spec.runId,
              {
                revisionId: work.revisionId,
                fingerprint: work.fingerprint,
                frameCount: reviewImages.length,
              },
              context.signal,
              context.leaseToken,
            ),
        );
        await Promise.all(
          uploadResponse.uploads.map(async (upload, index) => {
            const frame = reviewImages[index];
            if (!frame) throw new Error('Review upload did not match captured frame count.');
            await runHyperframesStage(
              `Uploading review frame ${index + 1}`,
              3,
              context.signal,
              async () => {
                const result = await fetch(upload.signedUrl, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'image/png' },
                  body: frame,
                  signal: context.signal,
                });
                if (!result.ok) throw new Error(`HTTP ${result.status}`);
              },
            );
          }),
        );
        await submitHyperframesReview(
          spec.runId,
          {
            revisionId: work.revisionId,
            fingerprint: work.fingerprint,
            frames: uploadResponse.uploads.map((upload, index) => ({
              timestampSeconds: evidence.frameTimestampsSeconds[index] ?? 0,
              storage: upload.storage,
              kind: index < evidence.frames.length ? ('frame' as const) : ('motion_strip' as const),
            })),
            temporalMetrics: evidence.temporalMetrics,
            layoutMetrics: evidence.layoutMetrics,
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
      const rendered = await runHyperframesStage(
        'Rendering video',
        2,
        context.signal,
        () =>
          renderHyperframesVideo({
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
            prepared: requirePrepared(),
          }),
        async () => {
          prepared?.value.dispose();
          prepared = {
            key: preparedKey,
            value: await prepareHyperframesComposition(composition, context.signal),
          };
        },
      );
      await context.update({ state: 'saving', progress: 1, phase: 'Saving to Library' });
      const persisted = await persistGeneratedMedia({
        blob: rendered.blob,
        brandId: context.job.brandId,
        kind: 'video',
        fileName: `hyperframes-${spec.runId}.mp4`,
        operation: 'hyperframes_render',
        originRef: {
          kind: 'hyperframes_agent',
          runId: spec.runId,
          revisionId: work.revisionId,
          nodeId: spec.nodeId,
          canvasId: spec.canvasId,
        },
        sourceAssetIds: context.job.inputs.flatMap((input) =>
          input.sourceAssetId ? [input.sourceAssetId] : [],
        ),
        title: context.job.title,
        width: rendered.width,
        height: rendered.height,
        durationMs: Math.round(rendered.durationSeconds * 1_000),
      });
      await runHyperframesStage('Finalizing the saved video', 3, context.signal, () =>
        completeHyperframesRender(
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
        ),
      );
      markNode(spec.nodeId, {
        status: 'completed',
        isExecuting: false,
        isComplete: true,
        progress: 1,
        renderOutputAssetId: persisted.assetId,
        // The persistence helper returns both; stamping only the asset id left a finished
        // HyperFrames video unable to feed an API Render.
        renderOutputAssetVersionId: persisted.versionId,
      });
      return {
        resultAssetIds: [persisted.assetId],
        title: 'HyperFrames video finished',
        description: 'The video is saved to Library and ready on the canvas.',
      };
    }
  } finally {
    prepared?.value.dispose();
  }
};
