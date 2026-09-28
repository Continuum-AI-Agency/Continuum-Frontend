// The in/out trim strip at the bottom of a canvas video or audio reference node: the
// clip's waveform, two overlaid range handles, and the kept span as text. It also owns
// the trim during playback, so the node's own <video>/<audio> never plays outside it.

import type React from 'react';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useStudioStore } from '../../stores/useStudioStore';
import { clampTrim, formatTrimTime, MIN_TRIM_SPAN_MS, msToFraction } from './mediaTrim';
import { useMediaWaveform } from './useMediaWaveform';

// Stops a seek back to the in-point from re-triggering itself when the element lands a
// hair before the requested time.
const SEEK_TOLERANCE_SEC = 0.05;
// Fine enough that the snap to a step multiple never visibly clips a clip's last frames.
const STEP_MS = 10;

// Two full-width ranges stacked on one track: the inputs ignore the pointer so the one
// on top cannot swallow the other's drags, and only each thumb takes it back.
const HANDLE_CLASS = cn(
  'pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent outline-none',
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-1.5 [&::-webkit-slider-thumb]:cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:bg-primary',
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-1.5 [&::-moz-range-thumb]:cursor-ew-resize [&::-moz-range-thumb]:rounded-sm [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary',
  'focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ring',
  'disabled:[&::-webkit-slider-thumb]:bg-muted-foreground/40 disabled:[&::-moz-range-thumb]:bg-muted-foreground/40',
);

type MediaTrimStripProps = {
  nodeId: string;
  src: string;
  mediaRef: RefObject<HTMLMediaElement | null>;
  trimStartMs?: number;
  trimEndMs?: number;
  /** A looping preview jumps back to the in-point at the out-point; a one-shot player stops. */
  atOutPoint: 'loop' | 'pause';
};

export function MediaTrimStrip({
  nodeId,
  src,
  mediaRef,
  trimStartMs,
  trimEndMs,
  atOutPoint,
}: MediaTrimStripProps) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const trackRef = useRef<HTMLDivElement>(null);
  const decoded = useMediaWaveform(src, trackRef);
  const [elementDuration, setElementDuration] = useState<{ src: string; ms: number } | null>(null);

  // The decode is the primary duration (cached, so a remount pays nothing); the element
  // covers media Mediabunny cannot open but the browser can still play.
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const readDuration = () => {
      if (Number.isFinite(media.duration) && media.duration > 0) {
        setElementDuration({ src, ms: media.duration * 1000 });
      }
    };
    readDuration();
    media.addEventListener('loadedmetadata', readDuration);
    return () => media.removeEventListener('loadedmetadata', readDuration);
  }, [mediaRef, src]);

  const durationMs =
    decoded?.durationMs ?? (elementDuration?.src === src ? elementDuration.ms : null);
  const range = durationMs
    ? clampTrim({ startMs: trimStartMs, endMs: trimEndMs }, durationMs)
    : null;
  const startMs = range?.startMs;
  const endMs = range?.endMs;

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || startMs === undefined || endMs === undefined) return;
    const startSec = startMs / 1000;
    const endSec = endMs / 1000;
    const outside = () =>
      media.currentTime < startSec - SEEK_TOLERANCE_SEC || media.currentTime >= endSec;
    const enterRange = () => {
      if (outside()) media.currentTime = startSec;
    };
    // A native `loop` wraps to 0 on its own, so a looping preview also has to catch
    // time that fell BEFORE the in-point, not just time past the out-point.
    const holdRange = () => {
      if (media.paused || !outside()) return;
      media.currentTime = startSec;
      if (atOutPoint === 'pause') media.pause();
    };
    media.addEventListener('play', enterRange);
    media.addEventListener('timeupdate', holdRange);
    return () => {
      media.removeEventListener('play', enterRange);
      media.removeEventListener('timeupdate', holdRange);
    };
  }, [mediaRef, startMs, endMs, atOutPoint]);

  const persist = (next: { startMs: number; endMs: number }) => {
    updateNodeData(nodeId, { trimStartMs: next.startMs, trimEndMs: next.endMs });
    triggerSave();
  };

  const peaks = decoded?.peaks ?? null;
  const startFraction = range && durationMs ? msToFraction(range.startMs, durationMs) : 0;
  const endFraction = range && durationMs ? msToFraction(range.endMs, durationMs) : 1;

  return (
    <div
      data-testid="node-trim"
      data-trim-start-ms={trimStartMs}
      data-trim-end-ms={trimEndMs}
      className="nodrag nopan flex h-7 shrink-0 items-center gap-1.5 border-t border-border/60 bg-background/85 px-1.5 backdrop-blur-sm"
    >
      <div ref={trackRef} className="relative h-6 min-w-0 flex-1">
        <svg
          data-testid="node-waveform"
          data-peaks={decoded ? (peaks?.length ?? 0) : undefined}
          viewBox={`0 0 ${Math.max(1, peaks?.length ?? 1)} 2`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Audio waveform"
          className="absolute inset-0 h-full w-full text-emerald-500"
        >
          {peaks && (
            <path
              d={peaks
                .map((peak, column) => {
                  const half = Math.max(peak, 0.02);
                  return `M${column + 0.5} ${1 - half}V${1 + half}`;
                })
                .join('')}
              stroke="currentColor"
              strokeWidth={0.6}
              fill="none"
            />
          )}
        </svg>
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-background/70"
          style={{ width: `${startFraction * 100}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-background/70"
          style={{ width: `${(1 - endFraction) * 100}%` }}
        />
        <input
          type="range"
          aria-label="Trim start"
          aria-valuetext={range ? formatTrimTime(range.startMs) : undefined}
          min={0}
          max={durationMs ?? 0}
          step={STEP_MS}
          value={range?.startMs ?? 0}
          disabled={!range}
          className={HANDLE_CLASS}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            if (!range || !durationMs) return;
            const requested = Math.min(Number(event.target.value), range.endMs - MIN_TRIM_SPAN_MS);
            persist(clampTrim({ startMs: requested, endMs: range.endMs }, durationMs));
          }}
        />
        <input
          type="range"
          aria-label="Trim end"
          aria-valuetext={range ? formatTrimTime(range.endMs) : undefined}
          min={0}
          max={durationMs ?? 0}
          step={STEP_MS}
          value={range?.endMs ?? 0}
          disabled={!range}
          className={HANDLE_CLASS}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            if (!range || !durationMs) return;
            const requested = Math.max(
              Number(event.target.value),
              range.startMs + MIN_TRIM_SPAN_MS,
            );
            persist(clampTrim({ startMs: range.startMs, endMs: requested }, durationMs));
          }}
        />
      </div>
      <span className="shrink-0 font-mono text-3xs tabular-nums text-muted-foreground">
        {range ? `${formatTrimTime(range.startMs)} – ${formatTrimTime(range.endMs)}` : '–:–'}
      </span>
    </div>
  );
}
