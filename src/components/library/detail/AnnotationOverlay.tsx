'use client';

// Annotation surface shared by the image stage and the paused video frame:
// renders existing spatial annotations (numbered pins, legacy box/freehand
// outlines, and saved drawings), captures new marks with the draw tools, and
// anchors a composer to the draft. All geometry is normalized 0..1 against the
// object-contain content rect so marks land on the pixels regardless of
// letterboxing.

import type { CommentAnnotation, DrawingShape } from '@continuum/contracts';
import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { StageTool } from './annotation/DrawingToolbar';
import { freehandShape, shapeFromDrag, shapesAnchor, shapesBounds } from './annotation/drawing';
import { ShapeLayer } from './annotation/ShapeLayer';
import {
  type CssRect,
  composerAnchor,
  containerPointToNormalized,
  type NormalizedBox,
  type NormalizedPoint,
  normalizedBoxToCssRect,
  type Size,
} from './annotationGeometry';

export type SpatialAnnotation = Exclude<CommentAnnotation, { kind: 'time' }>;

export type OverlayPin = {
  id: string;
  annotation: SpatialAnnotation;
  label: string;
  title: string;
  selected: boolean;
};

type Props = {
  containerSize: Size | null;
  contentRect: CssRect | null;
  pins: OverlayPin[];
  /** Numbered pin markers (image mode). Video mode shows only the selected marks. */
  showPinMarkers?: boolean;
  /** "View all annotations": every pin's marks, not only the hovered or selected one's. */
  showAllMarks?: boolean;
  onSelectPin?: (id: string | null) => void;
  drawEnabled: boolean;
  tool?: StageTool;
  color?: string;
  /** Marks already drawn in the open draft. */
  draftShapes?: readonly DrawingShape[];
  onShapeDrawn?: (shape: DrawingShape) => void;
  /** A pin dropped with the point tool. */
  draftPoint?: NormalizedPoint | null;
  onDraftPoint?: (point: NormalizedPoint) => void;
  /** Composer anchored to the draft. Hosts pass it for a pin only: beside a drawing
   *  it would cover where the reviewer draws next. */
  composer?: React.ReactNode;
  composerWidth?: number;
};

function annotationAnchor(annotation: SpatialAnnotation): NormalizedPoint {
  if (annotation.kind === 'point') return annotation;
  if (annotation.kind === 'box') return { x: annotation.x, y: annotation.y };
  return annotation.points[0] ?? { x: 0, y: 0 };
}

// A saved annotation as marks: new drawings carry their own shapes; legacy box
// and freehand rows outline in the theme colour they were always drawn in.
function annotationShapes(annotation: SpatialAnnotation, color: string): DrawingShape[] {
  if (annotation.kind === 'point') return annotation.shapes ?? [];
  if (annotation.kind === 'box') return [{ tool: 'box', color, ...boxOf(annotation) }];
  return [{ tool: 'freehand', color, points: annotation.points }];
}

function boxOf(box: NormalizedBox): NormalizedBox {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

const LEGACY_COLOR = '#3B82F6';

export function AnnotationOverlay({
  containerSize,
  contentRect,
  pins,
  showPinMarkers = true,
  showAllMarks = false,
  onSelectPin,
  drawEnabled,
  tool = 'box',
  color = LEGACY_COLOR,
  draftShapes = [],
  onShapeDrawn,
  draftPoint = null,
  onDraftPoint,
  composer,
  composerWidth = 288,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<NormalizedPoint | null>(null);
  const [dragCurrent, setDragCurrent] = useState<NormalizedPoint | null>(null);
  const [strokePoints, setStrokePoints] = useState<NormalizedPoint[]>([]);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);

  const pointFromEvent = useCallback(
    (e: React.PointerEvent): NormalizedPoint | null => {
      const root = rootRef.current;
      if (!root || !contentRect) return null;
      const bounds = root.getBoundingClientRect();
      return containerPointToNormalized(
        { x: e.clientX - bounds.left, y: e.clientY - bounds.top },
        contentRect,
      );
    },
    [contentRect],
  );

  const pinning = tool === 'point';
  // A pin is one click and closes the draft; marks keep coming until it posts.
  const canDraw =
    drawEnabled &&
    Boolean(contentRect) &&
    (pinning
      ? Boolean(onDraftPoint) && !draftPoint && draftShapes.length === 0
      : Boolean(onShapeDrawn));

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!canDraw || e.button !== 0) return;
    const point = pointFromEvent(e);
    if (!point) return;
    if (pinning) {
      onDraftPoint?.(point);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragStart(point);
    setDragCurrent(point);
    if (tool === 'freehand') setStrokePoints([point]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart) return;
    const point = pointFromEvent(e);
    if (!point) return;
    setDragCurrent(point);
    if (tool === 'freehand') {
      setStrokePoints((current) => {
        const previous = current[current.length - 1];
        if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.002) {
          return current.length >= 1024 ? current : [...current, point];
        }
        return current;
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragStart) return;
    const end = pointFromEvent(e) ?? dragCurrent ?? dragStart;
    const shape =
      tool === 'freehand'
        ? freehandShape([...strokePoints, end], color)
        : tool === 'point'
          ? null
          : shapeFromDrag(tool, dragStart, end, color);
    setDragStart(null);
    setDragCurrent(null);
    setStrokePoints([]);
    if (shape) onShapeDrawn?.(shape);
    else if (draftShapes.length === 0) onSelectPin?.(null);
  };

  const liveShape: DrawingShape | null =
    dragStart && dragCurrent && tool !== 'point'
      ? tool === 'freehand'
        ? freehandShape(strokePoints, color)
        : shapeFromDrag(tool, dragStart, dragCurrent, color)
      : null;

  const draftBounds: NormalizedBox | null =
    draftShapes.length > 0
      ? shapesBounds(draftShapes)
      : draftPoint
        ? { ...draftPoint, width: 0, height: 0 }
        : null;
  const anchor =
    draftBounds && contentRect && containerSize
      ? composerAnchor(draftBounds, contentRect, containerSize, composerWidth)
      : null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer-driven draw surface; the keyboard-accessible path is the sidebar composer
    <div
      ref={rootRef}
      data-testid="annotation-overlay"
      className={cn('absolute inset-0', canDraw && 'cursor-crosshair')}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {contentRect &&
        pins.map((pin) => {
          const marker = annotationAnchor(pin.annotation);
          const outlined = showAllMarks || pin.selected || hoveredPinId === pin.id;
          const shapes = annotationShapes(pin.annotation, LEGACY_COLOR);
          return (
            <div key={pin.id}>
              {outlined && shapes.length > 0 && (
                <ShapeLayer shapes={shapes} contentRect={contentRect} commentId={pin.id} />
              )}
              {showPinMarkers && (
                <button
                  type="button"
                  title={pin.title}
                  aria-label={`Comment ${pin.label}: ${pin.title}`}
                  data-comment-pin={pin.id}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPin?.(pin.id);
                  }}
                  onMouseEnter={() => setHoveredPinId(pin.id)}
                  onMouseLeave={() => setHoveredPinId((prev) => (prev === pin.id ? null : prev))}
                  onFocus={() => setHoveredPinId(pin.id)}
                  onBlur={() => setHoveredPinId((prev) => (prev === pin.id ? null : prev))}
                  className={cn(
                    'absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-2xs font-semibold shadow-md transition-transform',
                    pin.selected
                      ? 'scale-110 bg-primary text-primary-foreground ring-2 ring-background'
                      : 'bg-background text-foreground ring-1 ring-border hover:scale-110',
                  )}
                  style={{
                    left: contentRect.left + marker.x * contentRect.width,
                    top: contentRect.top + marker.y * contentRect.height,
                  }}
                >
                  {pin.label}
                </button>
              )}
            </div>
          );
        })}

      {contentRect && draftShapes.length > 0 && (
        <ShapeLayer shapes={draftShapes} contentRect={contentRect} />
      )}
      {contentRect && liveShape && (
        <ShapeLayer shapes={[liveShape]} contentRect={contentRect} draft />
      )}
      {contentRect && draftPoint && (
        <div
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/20"
          style={normalizedPointStyle(draftPoint, contentRect)}
        />
      )}

      {anchor && composer && (
        <div
          className="absolute z-10"
          style={{
            left: anchor.left,
            top: anchor.top,
            width: composerWidth,
            transform: anchor.placement === 'above' ? 'translateY(-100%)' : undefined,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="rounded-lg border border-border bg-popover p-2.5 shadow-lg">
            {composer}
          </div>
        </div>
      )}
    </div>
  );
}

function normalizedPointStyle(point: NormalizedPoint, rect: CssRect): React.CSSProperties {
  const css = normalizedBoxToCssRect({ ...point, width: 0, height: 0 }, rect);
  return { left: css.left, top: css.top };
}

// The saved annotation a draft becomes: a pin, anchored where the first mark
// started when the reviewer drew rather than clicked.
export function draftToSpatialAnnotation(
  point: NormalizedPoint | null,
  shapes: readonly DrawingShape[],
): SpatialAnnotation | null {
  if (shapes.length > 0) return { kind: 'point', ...shapesAnchor(shapes), shapes: [...shapes] };
  return point ? { kind: 'point', ...point } : null;
}
