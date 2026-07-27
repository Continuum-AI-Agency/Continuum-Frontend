'use client';

import {
  AUDIO_CHANNELS,
  AUDIO_SAMPLE_RATE,
  type AudioPlanItem,
  feedMixdown,
  mixdownTimelineAudio,
} from '@/StudioCanvas/utils/splice/audioMix';

export type HyperframesBrowserAsset = {
  assetId: string;
  kind: 'image' | 'video' | 'audio';
  mimeType: string;
  url: string;
};

export type HyperframesBrowserComposition = {
  htmlUrl: string;
  assets: HyperframesBrowserAsset[];
  width: number;
  height: number;
  durationSeconds: number;
  fps: 30;
};

export type HyperframesBrowserCapabilities = {
  avc: boolean;
  aac: boolean;
};

export type HyperframesRenderResult = {
  blob: Blob;
  width: number;
  height: number;
  durationSeconds: number;
};

const XHTML_NS = 'http://www.w3.org/1999/xhtml';

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new DOMException('HyperFrames render aborted', 'AbortError');
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not inline media'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function resolveCompositionHtml(
  composition: HyperframesBrowserComposition,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(composition.htmlUrl, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error(`Composition fetch failed (${response.status})`);
  let html = await response.text();

  for (const asset of composition.assets) {
    throwIfAborted(signal);
    let replacement = asset.url;
    if (asset.kind === 'image') {
      const media = await fetch(asset.url, { signal, credentials: 'omit' });
      if (!media.ok) throw new Error(`Attached image fetch failed (${media.status})`);
      replacement = await blobToDataUrl(await media.blob());
    }
    html = html.replace(new RegExp(`hf-asset://${escapeRegExp(asset.assetId)}`, 'g'), replacement);
  }
  if (html.includes('hf-asset://')) {
    throw new Error('Composition contains an unresolved media asset.');
  }
  return html;
}

async function loadIframe(html: string, width: number, height: number): Promise<HTMLIFrameElement> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.width = String(width);
  iframe.height = String(height);
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-99999px',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    border: '0',
    pointerEvents: 'none',
  });
  const loaded = new Promise<void>((resolve, reject) => {
    iframe.addEventListener('load', () => resolve(), { once: true });
    iframe.addEventListener('error', () => reject(new Error('Composition iframe failed to load')), {
      once: true,
    });
  });
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
  await loaded;
  await iframe.contentDocument?.fonts?.ready;
  return iframe;
}

const waitForSeek = (media: HTMLMediaElement, timestamp: number): Promise<void> => {
  if (!Number.isFinite(media.duration) || media.readyState < 1) return Promise.resolve();
  const target = Math.max(0, Math.min(timestamp, Math.max(0, media.duration - 0.001)));
  if (Math.abs(media.currentTime - target) < 0.01) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Media seek timed out')), 10_000);
    media.addEventListener(
      'seeked',
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    media.currentTime = target;
  });
};

async function seekComposition(iframe: HTMLIFrameElement, timestamp: number): Promise<void> {
  const doc = iframe.contentDocument;
  const view = iframe.contentWindow as
    | (Window & {
        __hyperframe?: { seek?: (seconds: number) => void | Promise<void> };
        __timelines?: Record<string, { seek?: (seconds: number) => void }>;
      })
    | null;
  await view?.__hyperframe?.seek?.(timestamp);
  for (const timeline of Object.values(view?.__timelines ?? {})) timeline.seek?.(timestamp);
  for (const animation of doc?.getAnimations() ?? []) {
    animation.pause();
    animation.currentTime = timestamp * 1000;
  }
  await Promise.all(
    Array.from(doc?.querySelectorAll('video') ?? []).map(async (video) => {
      video.muted = true;
      video.pause();
      const start = Number(video.dataset.start ?? 0);
      await waitForSeek(video, Math.max(0, timestamp - start));
    }),
  );
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function videoFrameDataUrl(video: HTMLVideoElement): string | null {
  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL('image/png');
}

async function rasterizeFrame(
  iframe: HTMLIFrameElement,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  width: number,
  height: number,
): Promise<void> {
  const doc = iframe.contentDocument;
  if (!doc?.documentElement) throw new Error('Composition document is unreadable');
  const clone = doc.documentElement.cloneNode(true) as HTMLElement;
  clone.setAttribute('xmlns', XHTML_NS);
  clone.querySelectorAll('script').forEach((node) => node.remove());
  const sourceVideos = Array.from(doc.querySelectorAll('video'));
  const clonedVideos = Array.from(clone.querySelectorAll('video'));
  clonedVideos.forEach((video, index) => {
    const dataUrl = sourceVideos[index] ? videoFrameDataUrl(sourceVideos[index]) : null;
    if (!dataUrl) {
      video.remove();
      return;
    }
    const image = doc.createElement('img');
    for (const attr of Array.from(video.attributes)) image.setAttribute(attr.name, attr.value);
    image.src = dataUrl;
    video.replaceWith(image);
  });
  const serialized = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${serialized}</foreignObject></svg>`;
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Composition frame could not be rasterized'));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;
  const ctx = canvas instanceof OffscreenCanvas ? canvas.getContext('2d') : canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is unavailable');
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
}

const canvasToPng = async (canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> => {
  if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Frame PNG encoding failed'))),
      'image/png',
    ),
  );
};

const createCanvas = (width: number, height: number): HTMLCanvasElement | OffscreenCanvas => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

export async function probeHyperframesCapabilities(): Promise<HyperframesBrowserCapabilities> {
  const { canEncodeAudio, canEncodeVideo } = await import('mediabunny');
  const [avc, aac] = await Promise.all([
    canEncodeVideo('avc', { width: 640, height: 360, bitrate: 1_000_000 }),
    canEncodeAudio('aac', {
      numberOfChannels: AUDIO_CHANNELS,
      sampleRate: AUDIO_SAMPLE_RATE,
      bitrate: 128_000,
    }),
  ]);
  return { avc, aac };
}

export async function captureHyperframesReviewFrames(params: {
  composition: HyperframesBrowserComposition;
  timestampsSeconds: number[];
  signal?: AbortSignal;
}): Promise<Blob[]> {
  const html = await resolveCompositionHtml(params.composition, params.signal);
  const iframe = await loadIframe(html, params.composition.width, params.composition.height);
  const canvas = createCanvas(params.composition.width, params.composition.height);
  try {
    const frames: Blob[] = [];
    for (const timestamp of params.timestampsSeconds) {
      throwIfAborted(params.signal);
      await seekComposition(iframe, timestamp);
      await rasterizeFrame(iframe, canvas, params.composition.width, params.composition.height);
      frames.push(await canvasToPng(canvas));
    }
    return frames;
  } finally {
    iframe.remove();
  }
}

function audioElements(html: string): Array<{
  assetId: string;
  start: number;
  duration: number;
  sourceStart: number;
  gain: number;
}> {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(
    document.querySelectorAll('audio[src^="hf-asset://"], video[src^="hf-asset://"]'),
  )
    .map((element) => {
      const source = element.getAttribute('src') ?? '';
      const assetId = source.slice('hf-asset://'.length);
      return {
        assetId,
        start: Number(element.getAttribute('data-start') ?? 0),
        duration: Number(element.getAttribute('data-duration') ?? 0),
        sourceStart: Number(element.getAttribute('data-source-start') ?? 0),
        gain: Number(element.getAttribute('data-volume') ?? 1),
      };
    })
    .filter((element) => element.assetId && element.duration > 0);
}

export async function renderHyperframesVideo(params: {
  composition: HyperframesBrowserComposition;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}): Promise<HyperframesRenderResult> {
  const mb = await import('mediabunny');
  const capabilities = await probeHyperframesCapabilities();
  if (!capabilities.avc) throw new Error('H.264 encoding is unavailable in this browser.');

  const rawHtmlResponse = await fetch(params.composition.htmlUrl, {
    signal: params.signal,
    credentials: 'omit',
  });
  if (!rawHtmlResponse.ok) throw new Error(`Composition fetch failed (${rawHtmlResponse.status})`);
  const rawHtml = await rawHtmlResponse.text();
  const html = await resolveCompositionHtml(params.composition, params.signal);
  const iframe = await loadIframe(html, params.composition.width, params.composition.height);
  const canvas = createCanvas(params.composition.width, params.composition.height);
  const output = new mb.Output({
    format: new mb.Mp4OutputFormat(),
    target: new mb.BufferTarget(),
  });
  const videoSource = new mb.CanvasSource(canvas, {
    codec: 'avc',
    bitrate: mb.QUALITY_HIGH,
  });
  output.addVideoTrack(videoSource);

  const inputs: InstanceType<typeof mb.Input>[] = [];
  let audioSource: InstanceType<typeof mb.AudioSampleSource> | null = null;
  const audioPlan: AudioPlanItem[] = [];
  if (capabilities.aac) {
    for (const element of audioElements(rawHtml)) {
      const asset = params.composition.assets.find(
        (candidate) => candidate.assetId === element.assetId,
      );
      if (!asset || asset.kind === 'image') continue;
      const input = new mb.Input({
        formats: mb.ALL_FORMATS,
        source: new mb.UrlSource(asset.url),
      });
      inputs.push(input);
      audioPlan.push({
        input,
        sourceStartSec: element.sourceStart,
        sourceEndSec: element.sourceStart + element.duration,
        speed: 1,
        outputStartSec: element.start,
        gain: Number.isFinite(element.gain) ? element.gain : 1,
        fadeInSec: 0,
        fadeOutSec: 0,
      });
    }
    if (audioPlan.length > 0) {
      audioSource = new mb.AudioSampleSource({
        codec: 'aac',
        bitrate: 128_000,
      });
      output.addAudioTrack(audioSource);
    }
  }

  const frameCount = Math.max(
    1,
    Math.round(params.composition.durationSeconds * params.composition.fps),
  );
  const frameDuration = 1 / params.composition.fps;
  try {
    const mixdown =
      audioSource && audioPlan.length > 0
        ? await mixdownTimelineAudio(
            mb,
            audioPlan,
            params.composition.durationSeconds,
            params.signal,
          )
        : null;
    await output.start();
    if (audioSource && mixdown) await feedMixdown(mb, audioSource, mixdown, params.signal);
    for (let frame = 0; frame < frameCount; frame += 1) {
      throwIfAborted(params.signal);
      const timestamp = frame * frameDuration;
      await seekComposition(iframe, timestamp);
      await rasterizeFrame(iframe, canvas, params.composition.width, params.composition.height);
      await videoSource.add(timestamp, frameDuration);
      params.onProgress?.((frame + 1) / frameCount);
    }
    await output.finalize();
    if (!output.target.buffer) throw new Error('Mediabunny produced no MP4 buffer.');
    return {
      blob: new Blob([output.target.buffer], { type: 'video/mp4' }),
      width: params.composition.width,
      height: params.composition.height,
      durationSeconds: params.composition.durationSeconds,
    };
  } finally {
    iframe.remove();
    for (const input of inputs) input.dispose();
  }
}
