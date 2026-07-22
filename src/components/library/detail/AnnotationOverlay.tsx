'use client';

// Annotation surface shared by the image stage and the paused video frame:
// renders existing spatial annotations (numbered pins + geometry), supports
// point, rectangle, and freehand drafts, and anchors a composer to the draft.
// All geometry is normalized 0..1 against the object-contain content rect so
// pins land on the pixels regardless of letterboxing.

import type { CommentAnnotation } from '@continuum/contracts';
import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  type CssRect,
  composerAnchor,
  containerPointToNormalized,
  isMeaningfulBox,
  type NormalizedBox,
  type NormalizedPoint,
  normalizedBoxFromPoints,
  normalizedBoxToCssRect,
  type Size,
} from './annotationGeometry';

export type OverlayPin = {
  id: string;
  annotation: SpatialAnnotation;
  label: string;
  title: string;
  selected: boolean;
};

export type SpatialAnnotation = Exclude<CommentAnnotation, { kind: 'time' }>;
export type AnnotationTool = SpatialAnnotation['kind'];

type Props = {
  containerSize: Size | null;
  contentRect: CssRect | null;
  pins: OverlayPin[];
  /** Numbered pin markers (image mode). Video mode shows only box outlines. */
  showPinMarkers?: boolean;
  onSelectPin?: (id: string | null) => void;
  drawEnabled: boolean;
  tool?: AnnotationTool;
  draftAnnotation: SpatialAnnotation | null;
  onDraftAnnotation?: (annotation: SpatialAnnotation | null) => void;
  /** Composer anchored to the draft annotation. */
  composer?: React.ReactNode;
  composerWidth?: number;
};

function boxStyle(rect: CssRect): React.CSSProperties {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function annotationBounds(annotation: SpatialAnnotation): NormalizedBox {
  if (annotation.kind === 'box') return annotation;
  if (annotation.kind === 'point') {
    return { x: annotation.x, y: annotation.y, width: 0, height: 0 };
  }
  const xs = annotation.points.map((point) => point.x);
  const ys = annotation.points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

function annotationAnchor(annotation: SpatialAnnotation): NormalizedPoint {
  if (annotation.kind === 'point') return annotation;
  if (annotation.kind === 'box') return { x: annotation.x, y: annotation.y };
  return annotation.points[0] ?? { x: 0, y: 0 };
}

function SpatialShape({
  annotation,
  contentRect,
  draft = false,
}: {
  annotation: SpatialAnnotation;
  contentRect: CssRect;
  draft?: boolean;
}) {
  const colorClass = draft ? 'border-dashed' : '';
  if (annotation.kind === 'box') {
    return (
      <div
        className={cn(
          'pointer-events-none absolute rounded-sm border-2 border-primary bg-primary/10',
          colorClass,
        )}
        style={boxStyle(normalizedBoxToCssRect(annotation, contentRect))}
      />
    );
  }
  if (annotation.kind === 'point') {
    return (
      <div
        className={cn(
          'pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/20',
          colorClass,
        )}
        style={{
          left: contentRect.left + annotation.x * contentRect.width,
          top: contentRect.top + annotation.y * contentRect.height,
        }}
      />
    );
  }
  const points = annotation.points
    .map((point) => `${point.x * contentRect.width},${point.y * contentRect.height}`)
    .join(' ');
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute overflow-visible"
      style={boxStyle(contentRect)}
      viewBox={`0 0 ${contentRect.width} ${contentRect.height}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        strokeDasharray={draft ? '5 4' : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function AnnotationOverlay({
  containerSize,
  contentRect,
  pins,
  showPinMarkers = true,
  onSelectPin,
  drawEnabled,
  tool = 'box',
  draftAnnotation,
  onDraftAnnotation,
  composer,
  composerWidth = 288,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<NormalizedPoint | null>(null);
  const [dragCurrent, setDragCurrent] = useState<NormalizedPoint | null>(null);
  const [freehandPoints, setFreehandPoints] = useState<NormalizedPoint[]>([]);
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

  const canDraw =
    drawEnabled && !draftAnnotation && Boolean(contentRect) && Boolean(onDraftAnnotation);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!canDraw || e.button !== 0) return;
    const point = pointFromEvent(e);
    if (!point) return;
    if (tool === 'point') {
      onDraftAnnotation?.({ kind: 'point', ...point });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragStart(point);
    setDragCurrent(point);
    if (tool === 'freehand') setFreehandPoints([point]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart) return;
    const point = pointFromEvent(e);
    if (!point) return;
    setDragCurrent(point);
    if (tool === 'freehand') {
      setFreehandPoints((current) => {
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
    const box = normalizedBoxFromPoints(dragStart, end);
    const completedFreehand =
      tool === 'freehand'
        ? [...freehandPoints, end].filter(
            (point, index, points) =>
              index === 0 || point.x !== points[index - 1]?.x || point.y !== points[index - 1]?.y,
          )
        : [];
    setDragStart(null);
    setDragCurrent(null);
    setFreehandPoints([]);
    if (tool === 'freehand' && completedFreehand.length >= 2) {
      onDraftAnnotation?.({ kind: 'freehand', points: completedFreehand.slice(0, 1024) });
    } else if (tool === 'box' && isMeaningfulBox(box)) {
      onDraftAnnotation?.({ kind: 'box', ...box });
    } else {
      onSelectPin?.(null);
    }
  };

  const liveAnnotation: SpatialAnnotation | null =
    tool === 'freehand' && freehandPoints.length >= 2
      ? { kind: 'freehand', points: freehandPoints }
      : dragStart && dragCurrent
        ? { kind: 'box', ...normalizedBoxFromPoints(dragStart, dragCurrent) }
        : null;
  const anchor =
    draftAnnotation && contentRect && containerSize
      ? composerAnchor(annotationBounds(draftAnnotation), contentRect, containerSize, composerWidth)
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
          const outlined = pin.selected || hoveredPinId === pin.id;
          return (
            <div key={pin.id}>
              {outlined && <SpatialShape annotation={pin.annotation} contentRect={contentRect} />}
              {showPinMarkers && (
                <button
                  type="button"
                  title={pin.title}
                  aria-label={`Comment ${pin.label}: ${pin.title}`}
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

      {contentRect && liveAnnotation && (
        <SpatialShape annotation={liveAnnotation} contentRect={contentRect} draft />
      )}

      {contentRect && draftAnnotation && (
        <SpatialShape annotation={draftAnnotation} contentRect={contentRect} />
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
