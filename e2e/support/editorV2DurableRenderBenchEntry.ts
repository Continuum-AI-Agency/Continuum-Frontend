import type { ClientRenderJob, EditorProjectV2 } from '@continuum/contracts';
import {
  claimClientRenderJob,
  completeClientRenderJob,
  updateClientRenderJob,
} from '../../src/lib/api/clientRenderJobs.client';
import { getClientRenderExecutor } from '../../src/lib/client-render/executorRegistry';
import { buildTimelineEditorRenderPlan } from '../../src/lib/client-render/executors/timelineEditor';
import { registerDefaultClientRenderExecutors } from '../../src/lib/client-render/registerDefaultExecutors';
import { uploadMediaAsset } from '../../src/lib/library/uploadMediaAsset';
import { createSupabaseBrowserClient } from '../../src/lib/supabase/client';
import { composeTimeline } from '../../src/StudioCanvas/utils/splice/composeTimeline';

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

export type DurablePixel = { r: number; g: number; b: number };

export type DurableTimelineRequest = {
  project: EditorProjectV2;
  inputs: Array<{
    sourceId: string;
    sourceAssetId: string;
    sourceRevision: string;
    storage: { bucket: string; path: string };
    url: string;
  }>;
};

const authenticate = async (auth: BenchAuth): Promise<void> => {
  const { error } = await createSupabaseBrowserClient().auth.setSession({
    access_token: auth.accessToken,
    refresh_token: auth.refreshToken,
  });
  if (error) throw new Error(`Browser session failed: ${error.message}`);
};

const encodeSource = async (fixture: 'base' | 'replacement'): Promise<Blob> => {
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
    context.fillStyle = fixture === 'replacement' ? '#ef2020' : `rgb(${red}, 48, ${blue})`;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    if (fixture === 'base') {
      context.fillStyle = '#ffffff';
      context.font = '700 32px sans-serif';
      context.textAlign = 'center';
      context.fillText('DURABLE MASTER', WIDTH / 2, HEIGHT / 2);
    }
    await source.add(frame / FPS, 1 / FPS);
  }
  await output.finalize();
  if (!output.target.buffer) throw new Error('Source encoder returned no bytes.');
  return new Blob([output.target.buffer], { type: 'video/mp4' });
};

const seedSource = async (
  input: BenchAuth & { brandId: string; fixture?: 'base' | 'replacement' },
): Promise<DurableSourceReceipt> => {
  await authenticate(input);
  const fixture = input.fixture ?? 'base';
  const blob = await encodeSource(fixture);
  const uploaded = await uploadMediaAsset({
    brandId: input.brandId,
    file: new File([blob], `durable-editor-${fixture}.mp4`, { type: 'video/mp4' }),
  });
  return {
    assetId: uploaded.assetId,
    versionId: uploaded.versionId,
    storagePath: uploaded.storagePath,
    bytes: blob.size,
  };
};

const readSignedPoint = async (input: {
  url: string;
  timestampSec: number;
  x: number;
  y: number;
}): Promise<DurablePixel> => {
  const response = await fetch(input.url);
  if (!response.ok) throw new Error(`Signed output download failed (${response.status}).`);
  const data = await response.blob();
  const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await import('mediabunny');
  const media = new Input({ source: new BlobSource(data), formats: ALL_FORMATS });
  try {
    const track = await media.getPrimaryVideoTrack();
    if (!track) throw new Error('Stored output has no video track.');
    const wrapped = await new CanvasSink(track).getCanvas(input.timestampSec);
    if (!wrapped) throw new Error(`Stored output has no frame at ${input.timestampSec}s.`);
    const context = wrapped.canvas.getContext('2d');
    if (!context) throw new Error('Stored output has no 2D canvas.');
    const pixel = context.getImageData(
      Math.round(input.x * (wrapped.canvas.width - 1)),
      Math.round(input.y * (wrapped.canvas.height - 1)),
      1,
      1,
    ).data;
    return { r: pixel[0] ?? 0, g: pixel[1] ?? 0, b: pixel[2] ?? 0 };
  } finally {
    media.dispose();
  }
};

const renderTimeline = async (
  input: DurableTimelineRequest,
): Promise<{
  base64: string;
  contentType: string;
  durationSec: number;
  width: number;
  height: number;
}> => {
  const signal = new AbortController().signal;
  const plan = await buildTimelineEditorRenderPlan({
    project: input.project,
    jobInputs: input.inputs.map(({ url: _url, ...item }) => item),
    signedUrls: new Map(
      input.inputs.map((item) => [`${item.storage.bucket}\n${item.storage.path}`, item.url]),
    ),
    signal,
  });
  const result = await composeTimeline({
    ...plan,
    frameRate: input.project.exportSettings.fps,
    targetWidth: input.project.exportSettings.width,
    targetHeight: input.project.exportSettings.height,
    signal,
  });
  URL.revokeObjectURL(result.objectUrl);
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return {
    base64: btoa(binary),
    contentType: result.blob.type || 'video/mp4',
    durationSec: result.durationSec,
    width: result.width,
    height: result.height,
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
  registerDefaultClientRenderExecutors();
  const execute = getClientRenderExecutor('timeline_editor');
  if (!execute) throw new Error('Timeline executor was not registered.');
  const result = await execute({
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
      readSignedPoint: typeof readSignedPoint;
      renderTimeline: typeof renderTimeline;
    };
  }
}

window.__editorV2DurableRenderBench = { seedSource, render, readSignedPoint, renderTimeline };
