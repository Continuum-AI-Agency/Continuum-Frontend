import type { ClientRenderJob } from '@continuum/contracts';
import {
  claimClientRenderJob,
  completeClientRenderJob,
  updateClientRenderJob,
} from '../../src/lib/api/clientRenderJobs.client';
import { executeTimelineEditorClientRender } from '../../src/lib/client-render/executors/timelineEditor';
import { uploadMediaAsset } from '../../src/lib/library/uploadMediaAsset';
import { createSupabaseBrowserClient } from '../../src/lib/supabase/client';

const WIDTH = 320;
const HEIGHT = 180;
const FPS = 15;

type BenchAuth = { accessToken: string; refreshToken: string };

export type DurableSourceReceipt = {
  assetId: string;
  versionId: string;
  storagePath: string;
  bytes: number;
};

export type DurableRenderReceipt = {
  job: ClientRenderJob;
  renderedAssetIds: string[];
  heartbeatState: string;
};

const authenticate = async (auth: BenchAuth): Promise<void> => {
  const { error } = await createSupabaseBrowserClient().auth.setSession({
    access_token: auth.accessToken,
    refresh_token: auth.refreshToken,
  });
  if (error) throw new Error(`Browser session failed: ${error.message}`);
};

const encodeSource = async (): Promise<Blob> => {
  const { Output, BufferTarget, Mp4OutputFormat, CanvasSource, QUALITY_MEDIUM } = await import(
    'mediabunny'
  );
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas for source encoding.');
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_MEDIUM });
  output.addVideoTrack(source);
  await output.start();
  for (let frame = 0; frame < FPS * 8; frame += 1) {
    const progress = frame / (FPS * 8 - 1);
    const red = Math.round(24 + progress * 90);
    const blue = Math.round(128 - progress * 40);
    context.fillStyle = `rgb(${red}, 48, ${blue})`;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = '#ffffff';
    context.font = '700 32px sans-serif';
    context.textAlign = 'center';
    context.fillText('DURABLE MASTER', WIDTH / 2, HEIGHT / 2);
    await source.add(frame / FPS, 1 / FPS);
  }
  await output.finalize();
  if (!output.target.buffer) throw new Error('Source encoder returned no bytes.');
  return new Blob([output.target.buffer], { type: 'video/mp4' });
};

const seedSource = async (input: BenchAuth & { brandId: string }): Promise<DurableSourceReceipt> => {
  await authenticate(input);
  const blob = await encodeSource();
  const uploaded = await uploadMediaAsset({
    brandId: input.brandId,
    file: new File([blob], 'durable-editor-source.mp4', { type: 'video/mp4' }),
  });
  return {
    assetId: uploaded.assetId,
    versionId: uploaded.versionId,
    storagePath: uploaded.storagePath,
    bytes: blob.size,
  };
};

const render = async (
  input: BenchAuth & { brandId: string; jobId: string },
): Promise<DurableRenderReceipt> => {
  await authenticate(input);
  const capabilities = { webCodecs: true, avc: true, aac: true } as const;
  const claimed = await claimClientRenderJob({
    jobId: input.jobId,
    brandId: input.brandId,
    clientId: `durable-editor-bench:${crypto.randomUUID()}`,
    capabilities,
  });
  const heartbeat = await updateClientRenderJob(claimed.job.id, {
    leaseToken: claimed.leaseToken,
    state: 'claimed',
    progress: 0,
    phase: 'Lease heartbeat confirmed',
  });
  const controller = new AbortController();
  const result = await executeTimelineEditorClientRender({
    job: claimed.job,
    leaseToken: claimed.leaseToken,
    capabilities,
    signal: controller.signal,
    update: async (update) => {
      await updateClientRenderJob(claimed.job.id, {
        leaseToken: claimed.leaseToken,
        ...update,
      });
    },
  });
  const completed = await completeClientRenderJob(
    claimed.job.id,
    claimed.leaseToken,
    result.resultAssetIds,
  );
  return {
    job: completed.job,
    renderedAssetIds: result.resultAssetIds,
    heartbeatState: heartbeat.job.state,
  };
};

declare global {
  interface Window {
    __editorV2DurableRenderBench: {
      seedSource: typeof seedSource;
      render: typeof render;
    };
  }
}

window.__editorV2DurableRenderBench = { seedSource, render };
