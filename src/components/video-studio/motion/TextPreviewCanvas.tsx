'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { drawPreviewFrame, type PreviewLayer } from './textPreview';

/** A beat on the last frame after the exit, so each loop reads as its own entrance. */
const LOOP_HOLD_SEC = 0.6;

/**
 * A text preview on a real canvas. At rest it holds one settled frame; while `playing`
 * (hover or focus) it loops the layers' own clock. Drawn at `backingHeight` so the
 * renderer's 16 px type floor never inflates small layouts.
 */
export function TextPreviewCanvas({
  layers,
  durationSec,
  aspect,
  playing,
  restSec,
  backingHeight = 640,
  label,
  className,
}: {
  layers: readonly PreviewLayer[];
  durationSec: number;
  aspect: number;
  playing: boolean;
  restSec: number;
  backingHeight?: number;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = Math.round(backingHeight * aspect);

  useEffect(() => {
    const context = ref.current?.getContext('2d');
    if (!context) return;
    if (!playing) {
      drawPreviewFrame(context, layers, restSec, width, backingHeight);
      return;
    }
    const loopSec = durationSec + LOOP_HOLD_SEC;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = ((now - startedAt) / 1_000) % loopSec;
      drawPreviewFrame(context, layers, Math.min(t, durationSec - 0.001), width, backingHeight);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [backingHeight, durationSec, layers, playing, restSec, width]);

  return (
    <canvas
      ref={ref}
      width={width}
      height={backingHeight}
      role="img"
      aria-label={label}
      className={cn('block h-auto w-full rounded-md bg-muted', className)}
      style={{ aspectRatio: `${width} / ${backingHeight}` }}
    />
  );
}
