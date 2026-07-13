'use client';

// Annotation surface shared by the image stage and the paused video frame:
// renders existing annotation boxes (numbered pins + outlines), supports
// drag-to-draw a new normalized box, and anchors a composer to the draft box.
// All geometry is normalized 0..1 against the object-contain content rect so
// pins land on the pixels regardless of letterboxing.

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
  box: NormalizedBox;
  label: string;
  title: string;
  selected: boolean;
};

type Props = {
  containerSize: Size | null;
  contentRect: CssRect | null;
  pins: OverlayPin[];
  /** Numbered pin markers (image mode). Video mode shows only box outlines. */
  showPinMarkers?: boolean;
  onSelectPin?: (id: string | null) => void;
  drawEnabled: boolean;
  draftBox: NormalizedBox | null;
  onDraftBox?: (box: NormalizedBox | null) => void;
  /** Composer anchored to the draft box. */
  composer?: React.ReactNode;
  composerWidth?: number;
};

function boxStyle(rect: CssRect): React.CSSProperties {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export function AnnotationOverlay({
  containerSize,
  contentRect,
  pins,
  showPinMarkers = true,
  onSelectPin,
  drawEnabled,
  draftBox,
  onDraftBox,
  composer,
  composerWidth = 288,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<NormalizedPoint | null>(null);
  const [dragCurrent, setDragCurrent] = useState<NormalizedPoint | null>(null);
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

  const canDraw = drawEnabled && !draftBox && Boolean(contentRect) && Boolean(onDraftBox);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!canDraw || e.button !== 0) return;
    const point = pointFromEvent(e);
    if (!point) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragStart(point);
    setDragCurrent(point);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart) return;
    const point = pointFromEvent(e);
    if (point) setDragCurrent(point);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragStart) return;
    const end = pointFromEvent(e) ?? dragCurrent ?? dragStart;
    const box = normalizedBoxFromPoints(dragStart, end);
    setDragStart(null);
    setDragCurrent(null);
    if (isMeaningfulBox(box)) {
      onDraftBox?.(box);
    } else {
      onSelectPin?.(null);
    }
  };

  const liveDragBox =
    dragStart && dragCurrent ? normalizedBoxFromPoints(dragStart, dragCurrent) : null;
  const anchor =
    draftBox && contentRect && containerSize
      ? composerAnchor(draftBox, contentRect, containerSize, composerWidth)
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
          const rect = normalizedBoxToCssRect(pin.box, contentRect);
          const outlined = pin.selected || hoveredPinId === pin.id;
          return (
            <div key={pin.id}>
              {outlined && (
                <div
                  className="pointer-events-none absolute rounded-sm border-2 border-primary bg-primary/10"
                  style={boxStyle(rect)}
                />
              )}
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
                  style={{ left: rect.left, top: rect.top }}
                >
                  {pin.label}
                </button>
              )}
            </div>
          );
        })}

      {contentRect && liveDragBox && (
        <div
          className="pointer-events-none absolute rounded-sm border-2 border-dashed border-primary bg-primary/10"
          style={boxStyle(normalizedBoxToCssRect(liveDragBox, contentRect))}
        />
      )}

      {contentRect && draftBox && (
        <div
          className="pointer-events-none absolute rounded-sm border-2 border-primary bg-primary/10"
          style={boxStyle(normalizedBoxToCssRect(draftBox, contentRect))}
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
