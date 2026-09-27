'use client';

// Paints review marks (arrow, line, box, freehand) over the media's content
// rect. Pure presentation from saved or draft shapes, so a comment's drawing
// re-renders exactly where it was drawn — on the authenticated stage and on the
// public share page alike.

import type { DrawingShape } from '@continuum/contracts';
import type { CssRect } from '../annotationGeometry';
import { arrowHead } from './drawing';

type Props = {
  shapes: readonly DrawingShape[];
  contentRect: CssRect;
  /** Marks still being drawn render dashed. */
  draft?: boolean;
  /** Which comment the marks belong to, for hosts and tests that find them. */
  commentId?: string;
};

const STROKE = 3;

export function ShapeLayer({ shapes, contentRect, draft = false, commentId }: Props) {
  const { width, height } = contentRect;
  const px = (point: { x: number; y: number }) => ({ x: point.x * width, y: point.y * height });
  const dash = draft ? '6 4' : undefined;

  return (
    <svg
      aria-hidden="true"
      data-testid="drawing-layer"
      data-comment-id={commentId}
      className="pointer-events-none absolute overflow-visible"
      style={{ left: contentRect.left, top: contentRect.top, width, height }}
      viewBox={`0 0 ${width} ${height}`}
    >
      {shapes.map((shape, index) => {
        const key = `${shape.tool}-${index}`;
        const common = {
          'data-testid': 'drawing-shape',
          'data-tool': shape.tool,
          'data-color': shape.color,
          stroke: shape.color,
          strokeWidth: STROKE,
          strokeDasharray: dash,
          fill: 'none',
          strokeLinecap: 'round' as const,
          strokeLinejoin: 'round' as const,
          style: { filter: 'drop-shadow(0 0 1px rgb(0 0 0 / 0.6))' },
        };
        if (shape.tool === 'box') {
          return (
            <rect
              key={key}
              {...common}
              x={shape.x * width}
              y={shape.y * height}
              width={shape.width * width}
              height={shape.height * height}
            />
          );
        }
        if (shape.tool === 'freehand') {
          return (
            <polyline
              key={key}
              {...common}
              points={shape.points
                .map((point) => `${point.x * width},${point.y * height}`)
                .join(' ')}
            />
          );
        }
        const from = px(shape.from);
        const to = px(shape.to);
        if (shape.tool === 'line') {
          return <line key={key} {...common} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
        }
        const [left, right] = arrowHead(from, to, 14);
        return (
          <g key={key} {...common}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
            <polyline points={`${left.x},${left.y} ${to.x},${to.y} ${right.x},${right.y}`} />
          </g>
        );
      })}
    </svg>
  );
}
