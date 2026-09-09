'use client';

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import type { LayerEditorLayer } from '../../types';
import { hasShaderStack, shaderStackFromClipEffects } from '../../utils/render/shaderStack';

export function ShaderLayerImage({
  layer,
  src,
  style,
}: {
  layer: LayerEditorLayer;
  src: string;
  style: CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string>();
  const stack = useMemo(() => shaderStackFromClipEffects(layer.effects), [layer.effects]);
  const enabled = hasShaderStack(layer.effects);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      let source: ImageBitmap | undefined;
      let rendered: ImageBitmap | undefined;
      try {
        setError(undefined);
        const response = await fetch(src);
        if (!response.ok) throw new Error(`Could not read layer (${response.status})`);
        source = await createImageBitmap(await response.blob());
        const { renderShaderStackFrame } = await import('@/lib/vgpu/renderShaderStack');
        rendered = await renderShaderStackFrame({
          source,
          width: layer.sourceWidth,
          height: layer.sourceHeight,
          stack,
        });
        if (cancelled) return;
        const context = canvasRef.current?.getContext('2d');
        if (!context) throw new Error('Could not create the shader preview canvas');
        context.clearRect(0, 0, layer.sourceWidth, layer.sourceHeight);
        context.drawImage(rendered, 0, 0, layer.sourceWidth, layer.sourceHeight);
      } catch (problem) {
        if (!cancelled) setError(problem instanceof Error ? problem.message : String(problem));
      } finally {
        source?.close();
        rendered?.close();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, layer.sourceHeight, layer.sourceWidth, src, stack]);

  if (!enabled) {
    return (
      <img
        data-layer-id={layer.id}
        src={src}
        alt={layer.name}
        draggable={false}
        className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
        style={style}
      />
    );
  }

  return (
    <div
      data-layer-id={layer.id}
      className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
      style={style}
    >
      <canvas
        ref={canvasRef}
        width={layer.sourceWidth}
        height={layer.sourceHeight}
        className="h-full w-full"
      />
      {error ? (
        <span className="absolute inset-0 flex items-center justify-center bg-destructive/80 p-2 text-center text-xs text-destructive-foreground">
          {error}
        </span>
      ) : null}
    </div>
  );
}
