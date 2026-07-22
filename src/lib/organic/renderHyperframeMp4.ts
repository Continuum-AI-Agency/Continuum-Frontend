/**
 * Client-side HyperFrames-HTML -> MP4 renderer (mediabunny).
 *
 * Capture strategy (same-origin): the signed composition HTML is fetched and
 * injected into an offscreen iframe via `srcdoc` with `allow-same-origin`, so the
 * parent CAN read the document (a cross-origin `iframe.src` would taint any
 * canvas read with a SecurityError). The composition's GSAP timeline autoplays;
 * at each frame we serialize the live DOM (inline styles/transforms included)
 * into an SVG `<foreignObject>`, rasterize it through an Image, and draw it to a
 * canvas that mediabunny encodes to MP4.
 *
 * Honest limits: this works best for typographic / kinetic-type / stat-reveal
 * compositions (pure DOM + CSS). It still fails (and throws a typed
 * HyperframeCaptureError, swallowed by the fire-and-forget persist path) when the
 * composition draws cross-origin images/video without CORS (canvas taint) or
 * renders via in-iframe WebGL/<canvas> (foreignObject can't read it). External
 * webfonts may not rasterize inside foreignObject. A server-side headless-Chrome
 * renderer behind the `link-hyperframe-mp4` edge path remains the fully faithful
 * path; this is the best-effort client shot.
 */

export class HyperframeCaptureError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'HyperframeCaptureError';
  }
}

export type HyperframeMp4RendererConfig = {
  htmlUrl: string;
  width: number;
  height: number;
  durationSec: number;
  fps?: number;
};

const DEFAULT_FPS = 30;
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

export function resolveFrameCount(durationSec: number, fps: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  if (!Number.isFinite(fps) || fps <= 0) return 0;
  return Math.max(1, Math.round(durationSec * fps));
}

export function resolveRenderPlan(config: HyperframeMp4RendererConfig): {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  frameCount: number;
  frameDuration: number;
} {
  const fps = config.fps && config.fps > 0 ? config.fps : DEFAULT_FPS;
  const width = Math.max(2, Math.round(config.width));
  const height = Math.max(2, Math.round(config.height));
  const durationSec = config.durationSec;
  const frameCount = resolveFrameCount(durationSec, fps);
  return {
    width,
    height,
    fps,
    durationSec,
    frameCount,
    frameDuration: 1 / fps,
  };
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

async function loadCompositionIframe(
  htmlUrl: string,
  width: number,
  height: number,
): Promise<HTMLIFrameElement> {
  if (typeof document === 'undefined') {
    throw new HyperframeCaptureError('DOM is unavailable; cannot render hyperframe to MP4');
  }

  let html: string;
  try {
    const response = await fetch(htmlUrl, { credentials: 'omit' });
    if (!response.ok) {
      throw new HyperframeCaptureError(`Composition fetch failed (${response.status})`);
    }
    html = await response.text();
  } catch (err) {
    if (err instanceof HyperframeCaptureError) throw err;
    throw new HyperframeCaptureError('Composition fetch failed', { cause: err });
  }

  const iframe = document.createElement('iframe');
  // allow-same-origin keeps the srcdoc document same-origin so the parent can
  // read it for capture; allow-scripts lets the GSAP timeline run.
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.width = String(width);
  iframe.height = String(height);
  iframe.style.position = 'fixed';
  iframe.style.left = '-99999px';
  iframe.style.top = '0';
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;
  iframe.style.border = '0';
  iframe.style.pointerEvents = 'none';
  iframe.srcdoc = html;

  const loaded = new Promise<void>((resolve, reject) => {
    iframe.addEventListener('load', () => resolve(), { once: true });
    iframe.addEventListener(
      'error',
      () => reject(new HyperframeCaptureError('Composition iframe failed to load')),
      { once: true },
    );
  });

  document.body.appendChild(iframe);
  await loaded;
  return iframe;
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  // Must be a data: URI, NOT a blob: URL. Chromium (and WebKit) taint the canvas
  // when a foreignObject SVG is drawn from a blob: URL, which makes mediabunny's
  // VideoFrame read throw "tainted sources". All browsers agree NOT to taint a
  // foreignObject SVG referenced as a data: URI — so this is the encode-safe path.
  const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new HyperframeCaptureError('Composition frame could not be rasterized'));
    img.src = dataUri;
  });
}

/**
 * Serialize the live composition DOM to an SVG <foreignObject> and draw it onto
 * the canvas. Throws HyperframeCaptureError when the document is unreadable, the
 * SVG fails to load, or drawing taints the canvas (cross-origin media).
 */
async function captureCompositionFrame(
  iframe: HTMLIFrameElement,
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
): Promise<void> {
  const doc = iframe.contentDocument;
  if (!doc?.documentElement) {
    throw new HyperframeCaptureError('Composition document is unreadable');
  }

  const clone = doc.documentElement.cloneNode(true) as HTMLElement;
  clone.setAttribute('xmlns', XHTML_NS);
  clone.querySelectorAll('script').forEach((node) => node.remove());
  const serialized = new XMLSerializer().serializeToString(clone);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${serialized}</foreignObject>` +
    `</svg>`;

  const img = await loadSvgImage(svg);
  ctx.clearRect(0, 0, width, height);
  try {
    ctx.drawImage(img, 0, 0, width, height);
  } catch (err) {
    throw new HyperframeCaptureError('Composition frame draw failed', { cause: err });
  }
}

/**
 * Builds a renderer that encodes the composition to an MP4 Blob via mediabunny.
 * Returns a function so callers (persistHyperframeMp4OnFirstRender) can defer the
 * expensive work and run it at most once.
 */
export function createHyperframeMp4Renderer(
  config: HyperframeMp4RendererConfig,
): () => Promise<Blob> {
  const plan = resolveRenderPlan(config);

  return async function renderHyperframeMp4(): Promise<Blob> {
    if (plan.frameCount === 0) {
      throw new HyperframeCaptureError('Invalid hyperframe duration/fps; nothing to render');
    }

    const { Output, BufferTarget, Mp4OutputFormat, CanvasSource, QUALITY_HIGH } = await import(
      'mediabunny'
    );

    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(plan.width, plan.height)
        : (() => {
            if (typeof document === 'undefined') {
              throw new HyperframeCaptureError('No canvas available to render hyperframe MP4');
            }
            const el = document.createElement('canvas');
            el.width = plan.width;
            el.height = plan.height;
            return el;
          })();

    const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) {
      throw new HyperframeCaptureError('2D canvas context unavailable');
    }

    const output = new Output({
      format: new Mp4OutputFormat(),
      target: new BufferTarget(),
    });
    const videoSource = new CanvasSource(canvas as HTMLCanvasElement | OffscreenCanvas, {
      codec: 'avc',
      bitrate: QUALITY_HIGH,
    });
    output.addVideoTrack(videoSource);

    const iframe = await loadCompositionIframe(config.htmlUrl, plan.width, plan.height);
    try {
      await output.start();
      // Capture in real-time playback cadence: the GSAP timeline runs live in the
      // iframe, so we snapshot the DOM at each frame's wall-clock position.
      const startMs = Date.now();
      for (let frame = 0; frame < plan.frameCount; frame += 1) {
        const targetMs = frame * plan.frameDuration * 1000;
        const elapsedMs = Date.now() - startMs;
        if (elapsedMs < targetMs) await delay(targetMs - elapsedMs);
        await captureCompositionFrame(iframe, ctx, plan.width, plan.height);
        await videoSource.add(frame * plan.frameDuration, plan.frameDuration);
      }
      await output.finalize();
      const buffer = output.target.buffer;
      if (!buffer) {
        throw new HyperframeCaptureError('mediabunny produced no output buffer');
      }
      return new Blob([buffer], { type: 'video/mp4' });
    } finally {
      iframe.remove();
    }
  };
}
