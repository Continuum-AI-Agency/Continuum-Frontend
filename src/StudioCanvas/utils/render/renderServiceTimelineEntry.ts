import type { EditorProjectV2 } from '@continuum/contracts';
import { buildTimelineEditorRenderPlan } from '@/lib/client-render/executors/timelineEditor';
import { runTimelineInWorker } from '@/StudioCanvas/workers/spliceWorkerClient';

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
};

async function run(request: TimelineServiceRequest) {
  const signal = new AbortController().signal;
  const plan = await buildTimelineEditorRenderPlan({
    project: request.project,
    jobInputs: request.inputs,
    signedUrls: new Map(Object.entries(request.urls)),
    signal,
  });
  const rendered = await runTimelineInWorker({
    ...plan,
    videoBitrate: request.project.exportSettings.videoBitrateKbps * 1_000,
    audioBitrate: request.project.exportSettings.audioBitrateKbps * 1_000,
    frameRate:
      request.project.exportSettings.frameRate.numerator /
      request.project.exportSettings.frameRate.denominator,
    targetWidth: request.project.exportSettings.width,
    targetHeight: request.project.exportSettings.height,
    signal,
  });
  try {
    const response = await fetch(`${request.sinkPath}/0`, {
      method: 'POST',
      headers: { 'content-type': rendered.blob.type || 'video/mp4' },
      body: rendered.blob,
    });
    if (!response.ok) throw new Error(`Timeline sink rejected the output (${response.status}).`);
    return {
      durationSec: rendered.durationSec,
      width: rendered.width,
      height: rendered.height,
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
