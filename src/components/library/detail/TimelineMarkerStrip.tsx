'use client';

// The comment lane that rides above a video scrubber: a circular initials chip
// for a point comment, and a Frame.io-style span bar for a range (a comment
// carrying `endMs`). Purely presentational and dependency-light on purpose —
// the annotating player and the read-only public share player both render this,
// so a marker looks and behaves identically wherever a video is reviewed.

import { cn } from '@/lib/utils';
import { formatTimecode, formatTimecodeRange, seekFraction, seekSpan } from './annotationGeometry';

// Exactly what the lane renders, and nothing more. Hosts extend it with what
// only they need — the authenticated player adds the frame box it draws on the
// stage — and hand their own marker type straight in, so neither host has to
// launder its model through a shape this component would ignore anyway.
export type TimeMarker = {
  id: string;
  timeMs: number;
  /** End of the commented span; null for a comment pinned to a single moment. */
  endMs: number | null;
  initials: string;
  title: string;
  selected?: boolean;
};

type Props<M extends TimeMarker> = {
  markers: M[];
  durationMs: number;
  /** Takes over selection when the host holds it by id instead of on the marker. */
  selectedId?: string | null;
  onSelect: (marker: M) => void;
  /** Render markers as indicators only — no clicking, no hover affordance. */
  readOnly?: boolean;
};

const CHIP_CLASS =
  'flex size-5 items-center justify-center rounded-full text-3xs font-semibold uppercase shadow-sm transition-transform';

function chipTone(selected: boolean): string {
  return selected
    ? 'scale-110 bg-primary text-primary-foreground ring-2 ring-background'
    : 'bg-background text-foreground ring-1 ring-border';
}

export function TimelineMarkerStrip<M extends TimeMarker>({
  markers,
  durationMs,
  selectedId,
  onSelect,
  readOnly = false,
}: Props<M>) {
  if (durationMs <= 0) return null;

  const isSelected = (marker: M) =>
    selectedId === undefined ? (marker.selected ?? false) : marker.id === selectedId;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-5">
      {markers.map((marker) => {
        const selected = isSelected(marker);
        const label =
          marker.endMs === null
            ? `Comment at ${formatTimecode(marker.timeMs)}: ${marker.title}`
            : `Comment from ${formatTimecodeRange(marker.timeMs, marker.endMs)}: ${marker.title}`;
        const span =
          marker.endMs === null ? null : seekSpan(marker.timeMs, marker.endMs, durationMs);
        const left = `${seekFraction(marker.timeMs, durationMs) * 100}%`;

        // A range is one hit target spanning its bar; the chip anchors its start
        // edge and overflows the button box, which still counts as the button.
        if (span) {
          return (
            <button
              key={marker.id}
              type="button"
              title={marker.title}
              aria-label={label}
              data-time-ms={marker.timeMs}
              disabled={readOnly}
              onClick={() => onSelect(marker)}
              className={cn(
                'absolute top-0 h-5',
                readOnly ? 'cursor-default' : 'pointer-events-auto group',
              )}
              style={{ left, width: `${span.width * 100}%` }}
            >
              <span
                className={cn(
                  'absolute inset-x-0 bottom-0 h-1 rounded-full transition-colors',
                  selected ? 'bg-primary ring-1 ring-background' : 'bg-primary/25',
                  !readOnly && 'group-hover:bg-primary/60',
                )}
              />
              <span
                className={cn(
                  CHIP_CLASS,
                  chipTone(selected),
                  'absolute left-0 top-0 -translate-x-1/2',
                  !readOnly && 'group-hover:scale-110',
                )}
              >
                {marker.initials}
              </span>
            </button>
          );
        }

        return (
          <button
            key={marker.id}
            type="button"
            title={marker.title}
            aria-label={label}
            data-time-ms={marker.timeMs}
            disabled={readOnly}
            onClick={() => onSelect(marker)}
            className={cn(
              CHIP_CLASS,
              chipTone(selected),
              'absolute top-0 -translate-x-1/2',
              readOnly ? 'cursor-default' : 'pointer-events-auto hover:scale-110',
            )}
            style={{ left }}
          >
            {marker.initials}
          </button>
        );
      })}
    </div>
  );
}
