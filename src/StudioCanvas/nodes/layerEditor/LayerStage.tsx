'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { LayerEditorLayer } from '../../types';
import { type Frame, fitScale, snapToGrid } from '../../utils/layers/frameModel';
import {
  handleCursor,
  handlePoints,
  RESIZE_HANDLES,
  type ResizeHandle,
  resizeLayer,
  rotateHandlePoint,
  rotateLayer,
} from '../../utils/layers/layerGizmo';
import { nudgeLayers, setLayer } from '../../utils/layers/layerOps';
import {
  layerAtPoint,
  layerCorners,
  layerTransformCss,
  type Point,
} from '../../utils/layers/layerTransform';

/**
 * The composition stage: the document as the user sees it, and the gizmo they grab.
 *
 * Layers are DOM `<img>`s carrying `layerTransformCss` — the SAME four ops
 * `compositeLayers` gives the canvas — so what is on screen is what exports. The
 * arithmetic behind the handles lives in `utils/layers/layerGizmo.ts`; this file is only
 * pointer plumbing, on the window-listener idiom `nodes/timeline/OverlayTrack.tsx` uses.
 */

/** Screen pixels the rotate grip floats above the top edge. */
const ROTATE_GRIP_OFFSET = 28;
/** Screen pixels a handle is across. Divided by the stage scale to stay constant. */
const HANDLE_SIZE = 9;
/** Shift while rotating snaps to this, the way every editor does. */
const ROTATE_SNAP_DEGREES = 15;

export interface LayerStageProps {
  frame: Frame;
  layers: readonly LayerEditorLayer[];
  /** Layer id -> a displayable URL. */
  sources: ReadonlyMap<string, string>;
  selectedIds: readonly string[];
  onSelectionChange: (ids: string[]) => void;
  /** Pointer-down: bank the pre-drag document so the whole drag is ONE undo step. */
  onBegin: () => void;
  /** Pointer-move: the in-flight document. */
  onPreview: (layers: LayerEditorLayer[]) => void;
  /** 0 disables snapping. */
  snapGrid: number;
}

export function LayerStage({
  frame,
  layers,
  sources,
  selectedIds,
  onSelectionChange,
  onBegin,
  onPreview,
  snapGrid,
}: LayerStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const scale = fitScale(frame, viewport);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** Screen -> composition pixels. Every interaction below works in composition space. */
  const toComposition = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect || scale <= 0) return { x: 0, y: 0 };
      return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
    },
    [scale],
  );

  /**
   * One drag, one set of window listeners.
   *
   * `pointermove` on the window rather than the element so a fast drag that leaves the
   * stage does not silently drop the gesture mid-way.
   */
  const runDrag = useCallback(
    (onMove: (point: Point, event: PointerEvent) => void) => {
      onBegin();
      const move = (event: PointerEvent) => {
        event.preventDefault();
        onMove(toComposition(event), event);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [onBegin, toComposition],
  );

  const startMove = useCallback(
    (ids: string[], origin: Point) => {
      const startLayers = [...layers];
      const primary = startLayers.find((layer) => layer.id === ids[0]);
      if (!primary) return;
      runDrag((point) => {
        let dx = point.x - origin.x;
        let dy = point.y - origin.y;
        if (snapGrid > 0) {
          // Snap the layer the user grabbed onto the grid, not the raw delta: snapping
          // the delta leaves whatever sub-grid offset the layer already had.
          dx = snapToGrid(primary.position.x + dx, snapGrid) - primary.position.x;
          dy = snapToGrid(primary.position.y + dy, snapGrid) - primary.position.y;
        }
        onPreview(nudgeLayers(startLayers, ids, dx, dy));
      });
    },
    [layers, onPreview, runDrag, snapGrid],
  );

  const onStagePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      const point = toComposition(event);
      const hit = layerAtPoint(layers, point);
      const additive = event.ctrlKey || event.metaKey;

      if (!hit) {
        // Empty space clears the selection — but not while adding, or a mis-click during
        // a multi-select would throw the whole selection away.
        if (!additive) onSelectionChange([]);
        return;
      }

      if (additive) {
        onSelectionChange(
          selectedIds.includes(hit.id)
            ? selectedIds.filter((id) => id !== hit.id)
            : [...selectedIds, hit.id],
        );
        return;
      }

      const next = selectedIds.includes(hit.id) ? [...selectedIds] : [hit.id];
      // Put the grabbed layer first: it is the one snapping measures against.
      const ordered = [hit.id, ...next.filter((id) => id !== hit.id)];
      onSelectionChange(ordered);
      startMove(ordered, point);
    },
    [layers, onSelectionChange, selectedIds, startMove, toComposition],
  );

  const startResize = useCallback(
    (layer: LayerEditorLayer, handle: ResizeHandle) => (event: React.PointerEvent) => {
      event.stopPropagation();
      if (event.button !== 0) return;
      const startLayers = [...layers];
      runDrag((point, moveEvent) => {
        onPreview(
          setLayer(startLayers, layer.id, resizeLayer(layer, handle, point, moveEvent.shiftKey)),
        );
      });
    },
    [layers, onPreview, runDrag],
  );

  const startRotate = useCallback(
    (layer: LayerEditorLayer) => (event: React.PointerEvent) => {
      event.stopPropagation();
      if (event.button !== 0) return;
      const startLayers = [...layers];
      const origin = toComposition(event);
      runDrag((point, moveEvent) => {
        onPreview(
          setLayer(
            startLayers,
            layer.id,
            rotateLayer(layer, origin, point, moveEvent.shiftKey ? ROTATE_SNAP_DEGREES : 0),
          ),
        );
      });
    },
    [layers, onPreview, runDrag, toComposition],
  );

  // A drag that ends outside the window still has to end.
  useEffect(() => {
    const cancel = () => window.dispatchEvent(new PointerEvent('pointerup'));
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, []);

  const selected = layers.filter((layer) => selectedIds.includes(layer.id));
  const only = selected.length === 1 && !selected[0].locked ? selected[0] : null;
  const handleSize = HANDLE_SIZE / (scale || 1);
  const gripOffset = ROTATE_GRIP_OFFSET / (scale || 1);

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/20 p-4"
      data-testid="layer-stage"
    >
      <div
        ref={frameRef}
        className="relative shadow-sm ring-1 ring-border/60"
        style={{ width: frame.width * scale, height: frame.height * scale }}
        onPointerDown={onStagePointerDown}
      >
        {/* The checkerboard says "this frame is transparent", which it is. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(-45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, hsl(var(--muted)) 75%), linear-gradient(-45deg, transparent 75%, hsl(var(--muted)) 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
          }}
        />
        <div
          className="absolute left-0 top-0 origin-top-left overflow-hidden"
          style={{ width: frame.width, height: frame.height, transform: `scale(${scale})` }}
        >
          {layers.map((layer) =>
            layer.visible && sources.has(layer.id) ? (
              <img
                key={layer.id}
                src={sources.get(layer.id)}
                alt={layer.name}
                draggable={false}
                className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
                style={{
                  width: layer.sourceWidth,
                  height: layer.sourceHeight,
                  transformOrigin: '0 0',
                  transform: layerTransformCss(layer),
                  opacity: layer.opacity,
                  mixBlendMode: layer.blendMode === 'normal' ? undefined : layer.blendMode,
                }}
              />
            ) : null,
          )}

          {/* Gizmo. In composition coordinates, with non-scaling strokes so the outline
              is one screen pixel whatever the zoom. */}
          <svg
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
            width={frame.width}
            height={frame.height}
            aria-hidden
          >
            <title>Selection</title>
            {selected.map((layer) => (
              <polygon
                key={layer.id}
                points={layerCorners(layer)
                  .map((corner) => `${corner.x},${corner.y}`)
                  .join(' ')}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {only ? (
              <>
                <line
                  x1={only.position.x}
                  y1={only.position.y}
                  x2={rotateHandlePoint(only, gripOffset).x}
                  y2={rotateHandlePoint(only, gripOffset).y}
                  stroke="hsl(var(--primary))"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  className="pointer-events-auto cursor-grab"
                  cx={rotateHandlePoint(only, gripOffset).x}
                  cy={rotateHandlePoint(only, gripOffset).y}
                  r={handleSize * 0.6}
                  fill="hsl(var(--background))"
                  stroke="hsl(var(--primary))"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={startRotate(only)}
                  data-testid="layer-rotate-handle"
                />
                {/* The anchor, drawn because it is the pivot everything turns on. */}
                <circle
                  cx={only.position.x}
                  cy={only.position.y}
                  r={handleSize * 0.35}
                  fill="hsl(var(--primary))"
                  data-testid="layer-anchor-marker"
                />
                {RESIZE_HANDLES.map((handle) => {
                  const point = handlePoints(only)[handle];
                  return (
                    <rect
                      key={handle}
                      className="pointer-events-auto"
                      x={point.x - handleSize / 2}
                      y={point.y - handleSize / 2}
                      width={handleSize}
                      height={handleSize}
                      fill="hsl(var(--background))"
                      stroke="hsl(var(--primary))"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                      style={{ cursor: handleCursor(handle, only.rotation) }}
                      onPointerDown={startResize(only, handle)}
                      data-testid={`layer-resize-${handle}`}
                    />
                  );
                })}
              </>
            ) : null}
          </svg>
        </div>
      </div>

      <span
        className={cn(
          'pointer-events-none absolute bottom-2 right-3 rounded bg-background/80 px-1.5 py-0.5',
          'text-2xs tabular-nums text-muted-foreground',
        )}
      >
        {frame.width} × {frame.height} · {Math.round(scale * 100)}%
      </span>
    </div>
  );
}
