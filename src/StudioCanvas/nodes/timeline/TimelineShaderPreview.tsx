'use client';

import { useTranslations as useUiTranslations } from 'next-intl';
import { type CSSProperties, type RefObject, useEffect, useRef, useState } from 'react';
import { useUiErrorMessage } from '@/i18n/errors';
import {
  type ClipEffectSpec,
  filterString,
  resolveAdjustments,
} from '../../utils/render/effectSpec';
import { hasShaderStack, shaderStackFromClipEffects } from '../../utils/render/shaderStack';
import { computeCropRects } from '../../utils/splice/letterbox';

// A filtered picture is drawn through the canvas as well: a <video> element shows the browser's
// display decode, which drifts from the Canvas/WebCodecs decode the export draws (8–13 RGB on
// recorded footage), and a filter's contrast widens the gap. The CSS filter stays on the style.
export const needsCanvasPreview = (effects?: ClipEffectSpec): boolean =>
  hasShaderStack(effects) ||
  Boolean(effects && filterString(resolveAdjustments(effects))) ||
  Boolean(effects?.crop && Object.values(effects.crop).some((value) => value !== 0));

/**
 * Runs tasks one at a time and keeps only the newest one waiting. The playhead commits every
 * animation frame and a shader frame can take longer than that: queueing each request behind
 * the GPU made the picture fall further behind, and cancelling stale ones threw away every
 * frame that finished, so the canvas froze while the GPU kept working.
 */
export function latestWins(): (task: () => Promise<void>) => void {
  let running = false;
  let waiting: (() => Promise<void>) | undefined;
  const drain = async () => {
    running = true;
    while (waiting) {
      const task = waiting;
      waiting = undefined;
      await task().catch(() => undefined);
    }
    running = false;
  };
  return (task) => {
    waiting = task;
    if (!running) void drain();
  };
}

const SHADER_LONG_EDGE_CAP = 960;
const SHADER_LONG_EDGE_STEP = 240;

/**
 * The scale a video frame is shaded at: its displayed size in device pixels, at most ~960 px on
 * the long edge, never above the source. Stepped, because every new size rebuilds the GPU
 * device (renderShaderStack's acquireRenderer), so a resize only rebuilds it across a step.
 */
export function videoShaderScale(
  sourceLongEdge: number,
  displayedLongEdge: number,
  devicePixelRatio: number,
): number {
  const wanted =
    Math.ceil((displayedLongEdge * devicePixelRatio) / SHADER_LONG_EDGE_STEP) *
    SHADER_LONG_EDGE_STEP;
  const longEdge = Math.min(SHADER_LONG_EDGE_CAP, Math.max(SHADER_LONG_EDGE_STEP, wanted));
  return Math.min(1, longEdge / sourceLongEdge);
}

export function TimelineShaderPreview({
  videoRef,
  imageUrl,
  effects,
  timeSec,
  canvasSize,
  style,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  imageUrl?: string;
  effects?: ClipEffectSpec;
  timeSec: number;
  canvasSize?: { width: number; height: number };
  style?: CSSProperties;
}) {
  const translateUi = useUiTranslations('studio');

  const uiErrorText = useUiErrorMessage();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<ImageBitmap>();
  const [error, setError] = useState<string>();
  const [videoFrameVersion, setVideoFrameVersion] = useState(0);
  const [schedule] = useState(latestWins);
  const requestRef = useRef(0);
  const enabled = needsCanvasPreview(effects);

  useEffect(() => {
    const video = videoRef.current;
    if (!enabled || imageUrl || !video) return;
    const refresh = () => setVideoFrameVersion((version) => version + 1);
    video.addEventListener('loadeddata', refresh);
    video.addEventListener('seeked', refresh);
    return () => {
      video.removeEventListener('loadeddata', refresh);
      video.removeEventListener('seeked', refresh);
    };
  }, [enabled, imageUrl, videoRef]);

  useEffect(() => {
    let cancelled = false;
    let loaded: ImageBitmap | undefined;
    if (!enabled || !imageUrl) {
      setImage(undefined);
      return;
    }
    setImage(undefined);
    void (async () => {
      try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Could not read preview (${response.status})`);
        loaded = await createImageBitmap(await response.blob());
        if (cancelled) loaded.close();
        else setImage(loaded);
      } catch (problem) {
        if (!cancelled) setError(uiErrorText(problem));
      }
    })();
    return () => {
      cancelled = true;
      loaded?.close();
    };
  }, [enabled, imageUrl, uiErrorText]);

  useEffect(() => {
    if (!enabled) return;
    const request = ++requestRef.current;
    schedule(async () => {
      const video = videoRef.current;
      const source = image ?? video;
      const width = image?.width ?? video?.videoWidth ?? 0;
      const height = image?.height ?? video?.videoHeight ?? 0;
      if (!source || width <= 0 || height <= 0) return;
      // A seek changes currentTime before the decoded picture is available.
      if (!image && (video?.seeking || (video?.readyState ?? 0) < 2)) return;
      const sourceSec = video?.currentTime;
      const canvas = canvasRef.current;
      // Unmounted (or the effect was switched off) while this request waited.
      if (!canvas) return;
      let rendered: ImageBitmap | undefined;
      try {
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not create the timeline media preview');
        const targetWidth =
          canvasSize?.width ?? Math.round(canvas.parentElement?.clientWidth ?? width);
        const targetHeight =
          canvasSize?.height ?? Math.round(canvas.parentElement?.clientHeight ?? height);
        const shaded = hasShaderStack(effects);
        // A video frame is shaded at display resolution. An image keeps its own size: the stack
        // copies the source region without scaling it, so a smaller size would crop the image.
        const scale =
          shaded && !image
            ? videoShaderScale(
                Math.max(width, height),
                Math.max(canvas.clientWidth, canvas.clientHeight),
                globalThis.devicePixelRatio || 1,
              )
            : 1;
        const shadeWidth = Math.round(width * scale);
        const shadeHeight = Math.round(height * scale);
        const { source: cropped, target: rect } = computeCropRects(
          shadeWidth,
          shadeHeight,
          targetWidth,
          targetHeight,
          effects?.crop,
        );
        if (shaded) {
          const { renderShaderStackFrame } = await import(
            '@continuum/contracts/ai-studio/hyperframes-runtime/renderShaderStack'
          );
          rendered = await renderShaderStackFrame({
            source,
            width: shadeWidth,
            height: shadeHeight,
            stack: shaderStackFromClipEffects(effects),
            timeSec,
            viewport: cropped,
          });
        }
        // A finished frame is always painted, even when a newer request is waiting: under load
        // that keeps the picture moving at the GPU's pace instead of freezing it.
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth;
          canvas.height = targetHeight;
        }
        context.clearRect(0, 0, targetWidth, targetHeight);
        context.drawImage(
          rendered ?? source,
          cropped.x,
          cropped.y,
          cropped.width,
          cropped.height,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
        );
        canvas.dataset.timeSec = String(timeSec);
        if (!image) canvas.dataset.sourceSec = String(sourceSec);
        setError(undefined);
      } catch (problem) {
        // A stale request can fail on a source that has since been released; only the newest
        // request reports.
        if (request === requestRef.current) setError(uiErrorText(problem));
      } finally {
        rendered?.close();
      }
    });
  }, [
    effects,
    enabled,
    image,
    schedule,
    timeSec,
    videoFrameVersion,
    videoRef,
    canvasSize?.width,
    canvasSize?.height,
    uiErrorText,
  ]);

  if (!enabled) return null;
  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        style={style}
        aria-label={translateUi('media_effect_preview_bfaef742')}
        data-testid="media-effect-preview"
      />
      {error ? (
        <span className="absolute inset-x-4 top-4 z-20 rounded-md bg-destructive/90 px-3 py-2 text-center text-xs text-destructive-foreground">
          {error}
        </span>
      ) : null}
    </>
  );
}
