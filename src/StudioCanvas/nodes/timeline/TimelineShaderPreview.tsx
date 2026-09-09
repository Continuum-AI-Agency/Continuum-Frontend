'use client';

import { type CSSProperties, type RefObject, useEffect, useRef, useState } from 'react';
import type { ClipEffectSpec } from '../../utils/render/effectSpec';
import { hasShaderStack, shaderStackFromClipEffects } from '../../utils/render/shaderStack';

export function TimelineShaderPreview({
  videoRef,
  imageUrl,
  effects,
  timeSec,
  style,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  imageUrl?: string;
  effects?: ClipEffectSpec;
  timeSec: number;
  style?: CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<ImageBitmap>();
  const [error, setError] = useState<string>();
  const [videoFrameVersion, setVideoFrameVersion] = useState(0);
  const enabled = hasShaderStack(effects);

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
      let rendered: ImageBitmap | undefined;
      try {
        const { renderShaderStackFrame } = await import('@/lib/vgpu/renderShaderStack');
        rendered = await renderShaderStackFrame({
          source,
          width,
          height,
          stack: shaderStackFromClipEffects(effects),
          timeSec,
        });
        if (cancelled) return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) throw new Error('Could not create the timeline shader preview');
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        context.clearRect(0, 0, width, height);
        context.drawImage(rendered, 0, 0, width, height);
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
  }, [effects, enabled, image, timeSec, videoFrameVersion, videoRef]);

  if (!enabled) return null;
  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        style={style}
        aria-label="GPU shader preview"
      />
      {error ? (
        <span className="absolute inset-x-4 top-4 z-20 rounded-md bg-destructive/90 px-3 py-2 text-center text-xs text-destructive-foreground">
          {error}
        </span>
      ) : null}
    </>
  );
}
