'use client';

import type { EditorKeyframe } from '@continuum/contracts';
import { useMemo } from 'react';
import { sampleValueSpeedGraph } from './sampleValueSpeedGraph';

const WIDTH = 280;
const HEIGHT = 72;
const PAD_X = 8;
const PAD_Y = 8;

function pathFor(
  points: Array<{ t: number; value: number }>,
  durationSec: number,
  min: number,
  max: number,
): string {
  const span = Math.max(1e-6, max - min);
  return points
    .map((point, index) => {
      const x = PAD_X + (point.t / Math.max(1e-6, durationSec)) * (WIDTH - PAD_X * 2);
      const y = HEIGHT - PAD_Y - ((point.value - min) / span) * (HEIGHT - PAD_Y * 2);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export function MotionGraph({
  keys,
  durationSec,
  fallback,
  playheadSec,
  label,
}: {
  keys: readonly EditorKeyframe[];
  durationSec: number;
  fallback: number;
  playheadSec: number;
  label: string;
}) {
  const points = useMemo(
    () => sampleValueSpeedGraph(keys, durationSec, fallback),
    [keys, durationSec, fallback],
  );
  const valueExtent = useMemo(() => {
    const values = points.map((point) => point.value);
    const min = Math.min(...values, fallback);
    const max = Math.max(...values, fallback);
    return min === max ? { min: min - 1, max: max + 1 } : { min, max };
  }, [points, fallback]);
  const speedExtent = useMemo(() => {
    const speeds = points.map((point) => point.speed);
    const min = Math.min(...speeds, 0);
    const max = Math.max(...speeds, 0);
    return min === max ? { min: -1, max: 1 } : { min, max };
  }, [points]);
  const valuePath = pathFor(points, durationSec, valueExtent.min, valueExtent.max);
  const speedPath = pathFor(
    points.map((point) => ({ t: point.t, value: point.speed })),
    durationSec,
    speedExtent.min,
    speedExtent.max,
  );
  const playheadX =
    PAD_X +
    (Math.max(0, Math.min(durationSec, playheadSec)) / Math.max(1e-6, durationSec)) *
      (WIDTH - PAD_X * 2);

  if (keys.length === 0) {
    return (
      <p className="px-3 py-2 text-2xs text-muted-foreground">
        Add keys on {label} to plot value and speed.
      </p>
    );
  }

  return (
    <div className="border-t border-border/60 px-3 py-2" data-testid="motion-graph">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-2xs font-medium">{label}</span>
        <span className="font-mono text-2xs tabular-nums text-muted-foreground">value / speed</span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[4.5rem] w-full text-primary"
        role="img"
        aria-label={`${label} value and speed graph`}
      >
        <title>{`${label} value and speed`}</title>
        <rect
          x={PAD_X}
          y={PAD_Y}
          width={WIDTH - PAD_X * 2}
          height={HEIGHT - PAD_Y * 2}
          className="fill-muted/30 stroke-border"
          rx="3"
        />
        <path d={speedPath} fill="none" className="stroke-muted-foreground/50" strokeWidth="1" />
        <path d={valuePath} fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line
          x1={playheadX}
          x2={playheadX}
          y1={PAD_Y}
          y2={HEIGHT - PAD_Y}
          className="stroke-primary"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
