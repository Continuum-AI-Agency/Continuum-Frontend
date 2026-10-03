'use client';

import { type CSSProperties, type RefObject, useEffect, useRef, useState } from 'react';
import type { ClipEffectSpec } from '../../utils/render/effectSpec';
import { hasShaderStack, shaderStackFromClipEffects } from '../../utils/render/shaderStack';
import { computeCropRects } from '../../utils/splice/letterbox';

export const needsCanvasPreview = (effects?: ClipEffectSpec): boolean =>
  hasShaderStack(effects) ||
  Boolean(effects?.crop && Object.values(effects.crop).some((value) => value !== 0));

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<ImageBitmap>();
  const [error, setError] = useState<string>();
  const [videoFrameVersion, setVideoFrameVersion] = useState(0);
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
        if (!cancelled) setError(problem instanceof Error ? problem.message : String(problem));
      }
    })();
    return () => {
      cancelled = true;
      loaded?.close();
    };
  }, [enabled, imageUrl]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const render = async () => {
      const source = image ?? videoRef.current;
      const width = image?.width ?? videoRef.current?.videoWidth ?? 0;
      const height = image?.height ?? videoRef.current?.videoHeight ?? 0;
      if (!source || width <= 0 || height <= 0) return;
      // A seek changes currentTime before the decoded picture is available.
      if (!image && (videoRef.current?.seeking || (videoRef.current?.readyState ?? 0) < 2)) return;
      let rendered: ImageBitmap | undefined;
      try {
        if (hasShaderStack(effects)) {
          const { renderShaderStackFrame } = await import(
            '@continuum/contracts/ai-studio/hyperframes-runtime/renderShaderStack'
          );
          rendered = await renderShaderStackFrame({
            source,
            width,
            height,
            stack: shaderStackFromClipEffects(effects),
            timeSec,
          });
        }
        if (
          cancelled ||
          (!image && (videoRef.current?.seeking || (videoRef.current?.readyState ?? 0) < 2))
        )
          return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) throw new Error('Could not create the timeline media preview');
        const targetWidth =
          canvasSize?.width ?? Math.round(canvas.parentElement?.clientWidth ?? width);
        const targetHeight =
          canvasSize?.height ?? Math.round(canvas.parentElement?.clientHeight ?? height);
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth;
          canvas.height = targetHeight;
        }
        context.clearRect(0, 0, targetWidth, targetHeight);
        const { source: cropped, target: rect } = computeCropRects(
          width,
          height,
          targetWidth,
          targetHeight,
          effects?.crop,
        );
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
        if (!image) canvas.dataset.sourceSec = String(videoRef.current?.currentTime);
        setError(undefined);
      } catch (problem) {
        if (!cancelled) setError(problem instanceof Error ? problem.message : String(problem));
      } finally {
        rendered?.close();
      }
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [
    effects,
    enabled,
    image,
    timeSec,
    videoFrameVersion,
    videoRef,
    canvasSize?.width,
    canvasSize?.height,
  ]);

  if (!enabled) return null;
  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        style={style}
        aria-label="Media effect preview"
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
