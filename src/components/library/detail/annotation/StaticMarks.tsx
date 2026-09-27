'use client';

// Saved review marks drawn over a media element that shares this layer's
// positioned parent — for read-only surfaces (the public share page) that render
// their own <img>/<video> and must not be restructured around an annotation stage.
// Geometry is the same as the Library stage: normalized 0..1 against the media's
// object-contain content rect, so a mark lands on the pixels it was drawn on.

import type { CommentAnnotation, DrawingShape } from '@continuum/contracts';
import { useEffect, useRef, useState } from 'react';
import { type CssRect, fitContentRect } from '../annotationGeometry';
import { shapesAnchor } from './drawing';
import { ShapeLayer } from './ShapeLayer';

export type StaticMark = {
  id: string;
  annotation:
    | Exclude<CommentAnnotation, { kind: 'time' }>
    | { kind: 'shapes'; shapes: DrawingShape[] };
};

const LEGACY_COLOR = '#3B82F6';

function marksOf(mark: StaticMark['annotation']): DrawingShape[] {
  if (mark.kind === 'shapes') return mark.shapes;
  if (mark.kind === 'point') return mark.shapes ?? [];
  if (mark.kind === 'box') {
    const { x, y, width, height } = mark;
    return [{ tool: 'box', color: LEGACY_COLOR, x, y, width, height }];
  }
  return [{ tool: 'freehand', color: LEGACY_COLOR, points: mark.points }];
}

function pinOf(mark: StaticMark['annotation']): { x: number; y: number } | null {
  if (mark.kind === 'point') return { x: mark.x, y: mark.y };
  const shapes = marksOf(mark);
  return shapes.length > 0 ? shapesAnchor(shapes) : null;
}

export function StaticMarks({
  marks,
  numbered = true,
  mediaSelector = 'img, video',
}: {
  marks: StaticMark[];
  /** Number each mark's pin in order, as the Library stage does. */
  numbered?: boolean;
  mediaSelector?: string;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<CssRect | null>(null);

  useEffect(() => {
    const parent = layerRef.current?.parentElement;
    const media = parent?.querySelector<HTMLImageElement | HTMLVideoElement>(mediaSelector);
    if (!parent || !media) return;
    const measure = () => {
      const natural =
        media instanceof HTMLVideoElement
          ? { width: media.videoWidth, height: media.videoHeight }
          : { width: media.naturalWidth, height: media.naturalHeight };
      const box = media.getBoundingClientRect();
      const origin = parent.getBoundingClientRect();
      const fitted = fitContentRect({ width: box.width, height: box.height }, natural);
      setRect(
        fitted
          ? {
              ...fitted,
              left: fitted.left + box.left - origin.left,
              top: fitted.top + box.top - origin.top,
            }
          : null,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(media);
    media.addEventListener('load', measure);
    media.addEventListener('loadedmetadata', measure);
    return () => {
      observer.disconnect();
      media.removeEventListener('load', measure);
      media.removeEventListener('loadedmetadata', measure);
    };
  }, [mediaSelector]);

  if (marks.length === 0) return null;
  return (
    <div
      ref={layerRef}
      data-testid="static-marks"
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
    >
      {rect
        ? marks.map((mark, index) => {
            const shapes = marksOf(mark.annotation);
            const pin = numbered ? pinOf(mark.annotation) : null;
            return (
              <div key={mark.id}>
                {shapes.length > 0 ? (
                  <ShapeLayer shapes={shapes} contentRect={rect} commentId={mark.id} />
                ) : null}
                {pin ? (
                  <span
                    data-comment-pin={mark.id}
                    className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-2xs font-semibold text-primary-foreground shadow-md ring-2 ring-background"
                    style={{
                      left: rect.left + pin.x * rect.width,
                      top: rect.top + pin.y * rect.height,
                    }}
                  >
                    {index + 1}
                  </span>
                ) : null}
              </div>
            );
          })
        : null}
    </div>
  );
}
