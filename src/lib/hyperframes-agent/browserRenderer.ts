'use client';

import type {
  CompositionSpec,
  HyperframesLayoutMetrics,
  HyperframesTemporalMetrics,
  ShaderStackV1,
} from '@continuum/contracts';
import {
  audioElements,
  seekComposition as seekDocument,
} from '@continuum/contracts/ai-studio/hyperframes-runtime/composition';
import {
  buildTemporalMetrics,
  canvasLuma,
  changedPixels,
  contactSheetSampleIndexes,
  createCanvas,
  measureLayout,
  motionLuma,
  motionStrip,
  reviewPlan,
} from '@continuum/contracts/ai-studio/hyperframes-runtime/review';
import {
  AUDIO_CHANNELS,
  AUDIO_SAMPLE_RATE,
  type AudioPlanItem,
  feedMixdown,
  mixdownTimelineAudio,
} from '@/StudioCanvas/utils/splice/audioMix';

export { buildTemporalMetrics, contactSheetSampleIndexes };

export type HyperframesBrowserAsset = {
  assetId: string;
  assetVersionId?: string;
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
  fps: 30 | 60;
  shaderStack?: ShaderStackV1;
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

/**
 * Largest attached video we will inline as a data URL. Inlining makes the media
 * same-origin, which is the only way a `<video>` can be snapshotted into the
 * foreignObject rasterizer without tainting the canvas. Past this size the string
 * cost outweighs the benefit and we fall back to a CORS-mode fetch instead.
 */
const MAX_INLINE_VIDEO_BYTES = 24 * 1024 * 1024;

/**
 * Force CORS mode on every element that references an attached asset.
 *
 * Without `crossorigin`, the browser fetches media in no-cors mode and taints the
 * canvas REGARDLESS of the response's CORS headers — so a perfectly permissive
 * `Access-Control-Allow-Origin: *` from Supabase Storage does not save us. The
 * attribute is what opts the request into CORS mode; the header only decides
 * whether that request is allowed. Both are required, and only this half was
 * missing.
 */
export const withCrossOrigin = (html: string): string =>
  html.replace(/<(img|video|audio)\b([^>]*?)(\/?)>/gi, (tag, name, attrs: string, selfClose) => {
    if (!/hf-asset:\/\//i.test(attrs) || /\bcrossorigin\s*=/i.test(attrs)) return tag;
    return `<${name}${attrs} crossorigin="anonymous"${selfClose}>`;
  });

export async function resolveCompositionHtml(
  composition: HyperframesBrowserComposition,
  signal?: AbortSignal,
): Promise<string> {
  const rawHtml = await fetchCompositionHtml(composition.htmlUrl, signal);
  return resolveCompositionAssets(rawHtml, composition, signal);
}

async function fetchCompositionHtml(htmlUrl: string, signal?: AbortSignal): Promise<string> {
  let response: Response;
  try {
    response = await fetch(htmlUrl, { signal, credentials: 'omit' });
  } catch (error) {
    throw new Error('Could not load the composition. Check your connection and retry.', {
      cause: error,
    });
  }
  if (!response.ok) throw new Error(`Composition fetch failed (${response.status})`);
  return response.text();
}

async function resolveCompositionAssets(
  rawHtml: string,
  composition: HyperframesBrowserComposition,
  signal?: AbortSignal,
): Promise<string> {
  let html = withCrossOrigin(rawHtml);

  const replacements = await Promise.all(
    composition.assets.map(async (asset) => {
      throwIfAborted(signal);
      if (asset.kind === 'audio') return { asset, replacement: asset.url };
      let media: Response;
      try {
        media = await fetch(asset.url, { signal, credentials: 'omit' });
      } catch (error) {
        throw new Error(
          `Could not load attached ${asset.kind} ${asset.assetId}. Check your connection and retry.`,
          { cause: error },
        );
      }
      if (!media.ok) throw new Error(`Attached ${asset.kind} fetch failed (${media.status})`);
      const blob = await media.blob();
      return {
        asset,
        replacement:
          asset.kind === 'image' || blob.size <= MAX_INLINE_VIDEO_BYTES
            ? await blobToDataUrl(blob)
            : asset.url,
      };
    }),
  );
  for (const { asset, replacement } of replacements) {
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

const seekComposition = async (iframe: HTMLIFrameElement, timestamp: number): Promise<void> => {
  if (iframe.contentDocument && iframe.contentWindow) {
    await seekDocument(iframe.contentDocument, iframe.contentWindow, timestamp);
  }
};

/**
 * Snapshot the current video frame as an embeddable data URL.
 *
 * Returns null instead of throwing on a tainted canvas. That distinction is
 * load-bearing: this runs once per video per frame, so an uncaught SecurityError
 * here does not lose one frame, it destroys an entire multi-minute render (and
 * the review capture, which shares this path). Degrading to "drop the video
 * element" keeps the rest of the composition renderable and lets the caller
 * surface a warning.
 *
 * JPEG rather than PNG: this is the hot path (30fps x duration x N videos) and
 * PNG-encoding photographic frames is both far slower and several times larger.
 */
function videoFrameDataUrl(video: HTMLVideoElement): string | null {
  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
}

const KEYFRAME_METADATA = new Set(['offset', 'easing', 'composite', 'computedOffset']);

/**
 * The CSS property names a set of keyframes actually animates, in kebab-case.
 * Keyframes report properties camelCased (`backgroundColor`) while
 * `getPropertyValue`/`setProperty` need `background-color`; the mismatch reads
 * as "the freeze silently did nothing" rather than as an error.
 */
export const animatedCssProperties = (keyframes: readonly Keyframe[]): string[] => {
  const names = new Set<string>();
  for (const keyframe of keyframes) {
    for (const property of Object.keys(keyframe)) {
      if (KEYFRAME_METADATA.has(property)) continue;
      names.add(property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`));
    }
  }
  return [...names];
};

/**
 * Bake the current state of every running animation onto the serialization clone.
 *
 * This is what makes a seek visible in the output. Cloning captures INLINE styles
 * — which is why a GSAP composition (GSAP writes element.style directly) always
 * rendered correctly — but a CSS `@keyframes` animation applies computed values
 * without touching the inline style at all. The clone therefore carried the
 * animation's base state, and once rasterized inside a static SVG (a
 * script-free, non-animating context) every frame came out identical. The
 * composition agent is told never to load external scripts, so CSS animation is
 * exactly what it writes, and every one of its videos was a still.
 *
 * Only animated elements and only their animated properties are touched: the
 * Web Animations API already knows both, so there is no need to copy hundreds of
 * computed properties per node. Written onto the CLONE, never the live document
 * — an `!important` inline value on the source would override the animation and
 * freeze it for every later frame.
 */
function freezeAnimationsOnClone(doc: Document, source: HTMLElement, clone: HTMLElement): void {
  const animations = doc.getAnimations?.() ?? [];
  if (animations.length === 0) return;
  const view = doc.defaultView;
  if (!view) return;

  // cloneNode(true) preserves document order, so the Nth element of one tree is
  // the Nth of the other — the same pairing the video substitution above relies on.
  const sourceElements = Array.from(source.querySelectorAll('*'));
  const cloneElements = Array.from(clone.querySelectorAll('*'));
  const indexOf = new Map<Element, number>();
  sourceElements.forEach((element, index) => indexOf.set(element, index));

  for (const animation of animations) {
    const effect = animation.effect;
    if (!effect || typeof (effect as KeyframeEffect).getKeyframes !== 'function') continue;
    const target = (effect as KeyframeEffect).target;
    if (!target) continue;
    const index = indexOf.get(target);
    if (index === undefined) continue;
    const twin = cloneElements[index];
    if (!(twin instanceof (view as Window & typeof globalThis).HTMLElement)) continue;

    const computed = view.getComputedStyle(target);
    for (const cssName of animatedCssProperties((effect as KeyframeEffect).getKeyframes())) {
      const value = computed.getPropertyValue(cssName);
      if (value) twin.style.setProperty(cssName, value, 'important');
    }
    // The frozen values are the truth for this frame; leaving the animation
    // shorthand on would let the SVG re-apply the keyframes' base state over them.
    twin.style.setProperty('animation', 'none', 'important');
    twin.style.setProperty('transition', 'none', 'important');
  }
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
  freezeAnimationsOnClone(doc, doc.documentElement, clone);
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

export type PreparedHyperframesComposition = {
  composition: HyperframesBrowserComposition;
  rawHtml: string;
  html: string;
  iframe: HTMLIFrameElement;
  canvas: HTMLCanvasElement | OffscreenCanvas;
  reset: () => Promise<void>;
  dispose: () => void;
};

export async function prepareHyperframesComposition(
  composition: HyperframesBrowserComposition,
  signal?: AbortSignal,
): Promise<PreparedHyperframesComposition> {
  const rawHtml = await fetchCompositionHtml(composition.htmlUrl, signal);
  const html = await resolveCompositionAssets(rawHtml, composition, signal);
  const iframe = await loadIframe(html, composition.width, composition.height);
  const canvas = createCanvas(composition.width, composition.height);
  let disposed = false;
  return {
    composition,
    rawHtml,
    html,
    iframe,
    canvas,
    reset: () => seekComposition(iframe, 0),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      iframe.remove();
    },
  };
}

const applyShaderStack = async (
  canvas: HTMLCanvasElement | OffscreenCanvas,
  stack: ShaderStackV1 | undefined,
  timeSec: number,
): Promise<void> => {
  if (!stack?.effects.some((effect) => effect.enabled)) return;
  const runtime = await import(
    '@continuum/contracts/ai-studio/hyperframes-runtime/renderShaderStack'
  );
  await runtime.applyShaderStack(canvas, stack, timeSec);
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
  prepared?: PreparedHyperframesComposition;
}): Promise<Blob[]> {
  const prepared =
    params.prepared ?? (await prepareHyperframesComposition(params.composition, params.signal));
  const { iframe, canvas } = prepared;
  try {
    const frames: Blob[] = [];
    for (const timestamp of params.timestampsSeconds) {
      throwIfAborted(params.signal);
      await seekComposition(iframe, timestamp);
      await rasterizeFrame(iframe, canvas, params.composition.width, params.composition.height);
      await applyShaderStack(canvas, params.composition.shaderStack, timestamp);
      frames.push(await canvasToPng(canvas));
    }
    return frames;
  } finally {
    if (!params.prepared) prepared.dispose();
  }
}

export async function captureHyperframesReviewEvidence(params: {
  composition: HyperframesBrowserComposition;
  spec: CompositionSpec;
  timestampsSeconds: number[];
  signal?: AbortSignal;
  prepared?: PreparedHyperframesComposition;
}): Promise<{
  frames: Blob[];
  frameTimestampsSeconds: number[];
  motionStrip: Blob;
  temporalMetrics: HyperframesTemporalMetrics;
  layoutMetrics: HyperframesLayoutMetrics;
}> {
  const prepared =
    params.prepared ?? (await prepareHyperframesComposition(params.composition, params.signal));
  const { sampleFps, denseTimestamps, timestamps, frameTimestampsSeconds } = reviewPlan(
    params.composition.durationSeconds,
    params.timestampsSeconds,
  );
  const requested = new Map(frameTimestampsSeconds.map((timestamp, index) => [timestamp, index]));
  const dense = new Set(denseTimestamps);
  const strip = motionStrip(params.spec.scenes, sampleFps, denseTimestamps.length);
  const frames: Array<Blob | undefined> = Array(frameTimestampsSeconds.length).fill(undefined);
  const samples: Uint8Array[] = [];
  // Motion is read before the shader: grain re-seeds every pixel of every frame.
  const motionPixels: number[] = [];
  let previousMotion: Uint8Array | null = null;
  const clippedTextIds = new Set<string>();
  const lowContrastTextIds = new Set<string>();
  const missingFontFamilies = new Set<string>();
  try {
    for (const timestamp of timestamps) {
      throwIfAborted(params.signal);
      await seekComposition(prepared.iframe, timestamp);
      await rasterizeFrame(
        prepared.iframe,
        prepared.canvas,
        params.composition.width,
        params.composition.height,
      );
      if (dense.has(timestamp)) {
        const motion = motionLuma(prepared.canvas);
        if (previousMotion) motionPixels.push(changedPixels(previousMotion, motion));
        previousMotion = motion;
      }
      await applyShaderStack(prepared.canvas, params.composition.shaderStack, timestamp);
      if (dense.has(timestamp)) {
        const sampleIndex = samples.length;
        samples.push(canvasLuma(prepared.canvas));
        strip.draw(
          prepared.canvas,
          sampleIndex,
          params.composition.width,
          params.composition.height,
        );
      }
      const frameIndex = requested.get(timestamp);
      if (frameIndex !== undefined) {
        frames[frameIndex] = await canvasToPng(prepared.canvas);
        const { contentDocument, contentWindow } = prepared.iframe;
        if (!contentDocument || !contentWindow) {
          throw new Error('Composition document is unavailable for layout review.');
        }
        const measured = measureLayout(contentDocument, contentWindow);
        for (const id of measured.clippedTextIds) clippedTextIds.add(id);
        for (const id of measured.lowContrastTextIds) lowContrastTextIds.add(id);
        for (const family of measured.missingFontFamilies) missingFontFamilies.add(family);
      }
    }
    if (frames.some((frame) => !frame)) throw new Error('Review frame capture was incomplete.');
    return {
      frames: frames as Blob[],
      frameTimestampsSeconds,
      motionStrip: await canvasToPng(strip.canvas),
      temporalMetrics: buildTemporalMetrics(samples, sampleFps, params.spec.scenes, motionPixels),
      layoutMetrics: {
        clippedTextIds: [...clippedTextIds],
        lowContrastTextIds: [...lowContrastTextIds],
        missingFontFamilies: [...missingFontFamilies],
      },
    };
  } finally {
    if (!params.prepared) prepared.dispose();
  }
}

export async function renderHyperframesVideo(params: {
  composition: HyperframesBrowserComposition;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
  prepared?: PreparedHyperframesComposition;
}): Promise<HyperframesRenderResult> {
  const mb = await import('mediabunny');
  const capabilities = await probeHyperframesCapabilities();
  if (!capabilities.avc) throw new Error('H.264 encoding is unavailable in this browser.');

  const prepared =
    params.prepared ?? (await prepareHyperframesComposition(params.composition, params.signal));
  await prepared.reset();
  const { rawHtml, iframe, canvas } = prepared;
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
        gain: element.gain,
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
      await applyShaderStack(canvas, params.composition.shaderStack, timestamp);
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
    if (!params.prepared) prepared.dispose();
    for (const input of inputs) input.dispose();
  }
}
