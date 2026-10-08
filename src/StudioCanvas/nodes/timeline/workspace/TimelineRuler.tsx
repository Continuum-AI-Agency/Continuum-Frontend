'use client';

import type { EditorMarker } from '@continuum/contracts';
import { Flag, Waves } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { TIMELINE_SHORTCUT_KEYS as KEYS } from '../useTimelineKeymap';

/** A label every N seconds so labels never crowd at any zoom. */
const labelStepSec = (pxPerSec: number): number =>
  [1, 2, 5, 10, 15, 30, 60].find((step) => step * pxPerSec >= 56) ?? 120;

/**
 * Time ruler with the beat grid drawn as ticks. Scrubbing is the container's job (it
 * owns snapping); the ruler draws time and offers beat detection and markers.
 */
export function TimelineRuler({
  totalSec,
  pxPerSec,
  markers,
  onPointerDown,
  onDetectBeats,
  onAddMarker,
}: {
  totalSec: number;
  pxPerSec: number;
  markers: readonly EditorMarker[];
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onDetectBeats: () => void;
  onAddMarker: () => void;
}) {
  const step = labelStepSec(pxPerSec);
  const labels = Array.from(
    { length: Math.floor(totalSec / step) + 1 },
    (_, index) => index * step,
  );
  const beats = markers.filter((marker) => marker.kind === 'beat');
  const cues = markers.filter((marker) => marker.kind !== 'beat');
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          // biome-ignore lint/a11y/noStaticElementInteractions: scrub surface; the keymap seeks by keyboard.
          <div
            data-timeline-ruler=""
            className="relative h-7 cursor-text touch-none border-b border-border/60 bg-muted/30"
            style={{ width: totalSec * pxPerSec }}
            onPointerDown={onPointerDown}
          />
        }
      >
        {labels.map((sec) => (
          <span
            key={sec}
            className="pointer-events-none absolute top-0 h-full border-l border-border/70 pl-1 text-3xs text-muted-foreground tabular-nums"
            style={{ left: sec * pxPerSec }}
          >
            {sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `${sec}s`}
          </span>
        ))}
        {beats.map((beat) => (
          <span
            key={beat.id}
            data-beat-tick=""
            className={`pointer-events-none absolute bottom-0 w-px bg-rose-400 ${(beat.beatIndex ?? 1) % 4 === 0 ? 'h-3.5' : 'h-2'}`}
            style={{ left: beat.timeSec * pxPerSec }}
          />
        ))}
        {cues.map((marker) => (
          <Flag
            key={marker.id}
            aria-label={marker.label}
            className="pointer-events-none absolute top-0.5 size-3 -translate-x-1/2 fill-amber-400 text-amber-500"
            style={{ left: marker.timeSec * pxPerSec }}
          />
        ))}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onClick={onDetectBeats}>
          <Waves /> {beats.length > 0 ? 'Re-detect beats' : 'Detect beats'}
        </ContextMenuItem>
        <ContextMenuItem onClick={onAddMarker}>
          <Flag /> Add marker at playhead
          <ContextMenuShortcut>{KEYS.marker}</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
