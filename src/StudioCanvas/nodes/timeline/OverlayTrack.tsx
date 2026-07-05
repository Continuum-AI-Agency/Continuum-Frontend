'use client';

import { useDroppable } from '@dnd-kit/core';
import { Cross2Icon, ImageIcon, VideoIcon } from '@radix-ui/react-icons';
import type React from 'react';
import { cn } from '@/lib/utils';

export const OVERLAY_DROP_ID = 'overlay-drop';

// Per-lane droppable id + parser, so a media-bin drop lands in the specific
// overlay lane it was dropped on (not always the first).
export const overlayDropId = (trackId: string): string => `${OVERLAY_DROP_ID}::${trackId}`;
export function trackIdFromOverlayDrop(dropId: string): string | undefined {
  if (!dropId.startsWith(OVERLAY_DROP_ID)) return undefined;
  const marker = dropId.indexOf('::');
  return marker >= 0 ? dropId.slice(marker + 2) : undefined;
}

const TRACK_PADDING_PX = 240;

export interface OverlayLaneItem {
  id: string;
  kind: 'video' | 'image';
  label: string;
  startSec: number;
  durationSec: number;
}

// The overlay layer lane: clips float at an absolute `startSec` above the base
// track. Blocks are pointer-dragged to retime; dropping a media-bin tile here
// places an overlay at the playhead. Selection routes editing to the inspector.
export function OverlayTrack({
  items,
  pxPerSec,
  totalSec,
  selectedId,
  dropId,
  label,
  onSelect,
  onSetStart,
  onRemove,
}: {
  items: OverlayLaneItem[];
  pxPerSec: number;
  totalSec: number;
  selectedId?: string;
  // Per-lane dnd droppable id (see overlayDropId) so each lane is its own target.
  dropId: string;
  label: string;
  onSelect: (id: string) => void;
  onSetStart: (id: string, startSec: number) => void;
  onRemove: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const contentWidth = Math.max(totalSec * pxPerSec + TRACK_PADDING_PX, 480);

  const startDrag = (id: string, origStart: number) => (event: React.PointerEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const startX = event.clientX;
    const move = (moveEvent: PointerEvent) => {
      onSetStart(id, Math.max(0, origStart + (moveEvent.clientX - startX) / pxPerSec));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="min-h-0 overflow-x-auto rounded-lg border border-border/60 bg-muted/10">
        <div
          ref={setNodeRef}
          className={cn('relative h-12 min-w-full', isOver ? 'bg-primary/5' : undefined)}
          style={{ width: contentWidth }}
        >
          {items.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xs text-muted-foreground">
              Drag media here to overlay it (placed at the playhead)
            </div>
          ) : null}
          {items.map((item) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: pointer-drag retime surface
            // biome-ignore lint/a11y/useKeyWithClickEvents: selection mirrors the drag handlers
            <div
              key={item.id}
              onPointerDown={startDrag(item.id, item.startSec)}
              onClick={() => onSelect(item.id)}
              className={cn(
                'group/ov absolute top-1 bottom-1 flex items-center gap-1 overflow-hidden rounded-md border bg-gradient-to-b from-muted/60 to-muted/30 px-2 cursor-grab active:cursor-grabbing',
                item.id === selectedId ? 'border-primary ring-1 ring-primary' : 'border-border/60',
              )}
              style={{
                left: item.startSec * pxPerSec,
                width: Math.max(24, item.durationSec * pxPerSec),
              }}
            >
              {item.kind === 'video' ? (
                <VideoIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
              ) : (
                <ImageIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate text-2xs font-medium">{item.label}</span>
              <button
                type="button"
                aria-label="Remove overlay"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(item.id);
                }}
                className="ml-auto hidden h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground hover:bg-destructive hover:text-destructive-foreground group-hover/ov:flex"
              >
                <Cross2Icon className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
