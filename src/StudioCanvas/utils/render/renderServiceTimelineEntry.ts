import type { EditorProjectV2 } from '@continuum/contracts';
import { buildTimelineEditorRenderPlan } from '@/lib/client-render/executors/timelineEditor';
import { registerCaptionFonts } from '@/lib/clips/captionFonts';
import { runTimelineInWorker } from '@/StudioCanvas/workers/spliceWorkerClient';
import { composeTimeline } from '../splice/composeTimeline';

type TimelineServiceRequest = {
  project: EditorProjectV2;
  inputs: Array<{
    sourceId: string;
    sourceAssetId: string;
    sourceRevision: string;
    storage: { bucket: string; path: string };
  }>;
  urls: Record<string, string>;
  sinkPath: string;
  frameTimeSec?: number;
  maxWidth?: number;
};

async function run(request: TimelineServiceRequest) {
  const signal = new AbortController().signal;
  const plan = await buildTimelineEditorRenderPlan({
    project: request.project,
    jobInputs: request.inputs,
    signedUrls: new Map(Object.entries(request.urls)),
    signal,
  });
  if (request.frameTimeSec !== undefined) await registerCaptionFonts(plan.captionFonts);
  const render = request.frameTimeSec === undefined ? runTimelineInWorker : composeTimeline;
  const rendered = await render({
    ...plan,
    videoBitrate: request.project.exportSettings.videoBitrateKbps * 1_000,
    audioBitrate: request.project.exportSettings.audioBitrateKbps * 1_000,
    frameRate:
      request.project.exportSettings.frameRate.numerator /
      request.project.exportSettings.frameRate.denominator,
    targetWidth: request.project.exportSettings.width,
    targetHeight: request.project.exportSettings.height,
    frameTimeSec: request.frameTimeSec,
    signal,
  });
  try {
    let blob = rendered.blob;
    let outputWidth = rendered.width;
    let outputHeight = rendered.height;
    if (request.frameTimeSec !== undefined && rendered.width > (request.maxWidth ?? 768)) {
      const width = request.maxWidth ?? 768;
      const height = Math.max(1, Math.round((rendered.height * width) / rendered.width));
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Snapshot canvas unavailable.');
      const image = await createImageBitmap(blob);
      try {
        ctx.drawImage(image, 0, 0, width, height);
      } finally {
        image.close();
      }
      blob = await canvas.convertToBlob({ type: 'image/png' });
      outputWidth = width;
      outputHeight = height;
    }
    const response = await fetch(`${request.sinkPath}/0`, {
      method: 'POST',
      headers: { 'content-type': blob.type || 'video/mp4' },
      body: blob,
    });
    if (!response.ok) throw new Error(`Timeline sink rejected the output (${response.status}).`);
    return {
      durationSec: rendered.durationSec,
      width: outputWidth,
      height: outputHeight,
    };
  } finally {
    URL.revokeObjectURL(rendered.objectUrl);
  }
}

declare global {
  interface Window {
    __continuumTimeline?: { run: typeof run };
  }
}

window.__continuumTimeline = { run };
