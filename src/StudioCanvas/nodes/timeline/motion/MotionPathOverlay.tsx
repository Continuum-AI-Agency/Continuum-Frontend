'use client';

import type { EditorOverlayClip } from '@continuum/contracts';
import { motionPathPoints } from './motionPath';

export function MotionPathOverlay({ clip }: { clip: EditorOverlayClip }) {
  const points = motionPathPoints(clip);
  if (points.length < 2) return null;
  const d = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x * 100} ${point.y * 100}`)
    .join(' ');
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      role="img"
      aria-label="Motion path"
    >
      <title>Motion path</title>
      <path
        d={d}
        fill="none"
        className="stroke-primary"
        strokeWidth="0.6"
        strokeDasharray="1.5 1.2"
        vectorEffect="non-scaling-stroke"
      />
      {points
        .filter((_, index) => index === 0 || index === points.length - 1)
        .map((point, index) => (
          <rect
            key={index}
            x={point.x * 100 - 1}
            y={point.y * 100 - 1}
            width="2"
            height="2"
            className="fill-primary"
            transform={`rotate(45 ${point.x * 100} ${point.y * 100})`}
          />
        ))}
    </svg>
  );
}
