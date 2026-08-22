'use client';

import { useDroppable } from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { Scissors } from 'lucide-react';
import type React from 'react';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { boundaryTimes, snapSec } from './snapping';
import { CLIP_DRAG_PREFIX, TimelineClipBlock } from './TimelineClipBlock';
import { clipAtTime, type TimelineLayout } from './useTimelineEditorModel';

export const TIMELINE_DROP_ID = 'timeline-drop';

const TRACK_PADDING_PX = 240;
const MIN_PX_PER_SEC = 20;
const MAX_PX_PER_SEC = 240;

function tickInterval(pxPerSec: number): number {
  if (pxPerSec >= 120) return 1;
  if (pxPerSec >= 60) return 2;
  return 5;
}

export function TimelineTrack({
  layout,
  pxPerSec,
  onZoomChange,
  playheadSec,
  onSeek,
  selectedItemId,
  onSelectItem,
  labelFor,
  previewUrlFor,
  extraSnapTimes,
  markers,
  onTrim,
  onRemove,
  onSplit,
  onDuplicate,
  onSetMute,
  commentLane,
}: {
  layout: TimelineLayout;
  pxPerSec: number;
  onZoomChange?: (pxPerSec: number) => void;
  playheadSec: number;
  onSeek: (sec: number) => void;
  selectedItemId?: string;
  onSelectItem: (itemId: string) => void;
  labelFor: (sourceNodeId: string) => string;
  previewUrlFor?: (sourceNodeId: string) => string | undefined;
  // Cross-track snap targets (e.g. overlay-lane edges) merged into the playhead
  // snap candidates alongside this track's own clip boundaries.
  extraSnapTimes?: number[];
  // Reference marks (output seconds) rendered on the ruler and used as snap targets.
  markers?: number[];
  onTrim: (itemId: string, range: { startSec?: number; endSec?: number }) => void;
  onRemove: (itemId: string) => void;
  onSplit: (itemId: string, localSec: number) => void;
  // Clip-menu actions only some hosts model. Left out, the menu hides the item.
  onDuplicate?: (itemId: string) => void;
  onSetMute?: (itemId: string, mute: boolean) => void;
  // Review-comment markers, rendered on this track's pixel scale so they scroll
  // and zoom with the clips. Only the Library host supplies one.
  commentLane?: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: TIMELINE_DROP_ID });
  const laneRef = useRef<HTMLDivElement>(null);

  const contentWidth = Math.max(layout.totalSec * pxPerSec + TRACK_PADDING_PX, 480);
  const tick = tickInterval(pxPerSec);
  const tickCount = Math.ceil(layout.totalSec / tick) + 1;

  const secFromClientX = useCallback(
    (clientX: number): number => {
      const lane = laneRef.current;
      if (!lane) return 0;
      const rect = lane.getBoundingClientRect();
      return Math.max(0, Math.min((clientX - rect.left) / pxPerSec, layout.totalSec));
    },
    [layout.totalSec, pxPerSec],
  );

  // Snap the scrub position to clip edges / timeline bounds when close, so
  // clicks and playhead drags land precisely on cuts. Keyboard seeks stay exact
  // (they bypass this and call onSeek directly).
  const snapTimes = useMemo(
    () => [...boundaryTimes(layout), ...(extraSnapTimes ?? []), ...(markers ?? [])],
    [layout, extraSnapTimes, markers],
  );
  const seekAt = useCallback(
    (clientX: number) => onSeek(snapSec(secFromClientX(clientX), snapTimes, pxPerSec)),
    [onSeek, pxPerSec, secFromClientX, snapTimes],
  );

  const handleLaneSeek = useCallback(
    (event: React.PointerEvent) => {
      if (event.target !== event.currentTarget) return;
      seekAt(event.clientX);
    },
    [seekAt],
  );

  const startPlayheadDrag = useCallback(
    (event: React.PointerEvent) => {
      event.stopPropagation();
      event.preventDefault();
      const handleMove = (moveEvent: PointerEvent) => seekAt(moveEvent.clientX);
      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [seekAt],
  );

  const handleSplit = useCallback(() => {
    const clip = clipAtTime(layout, playheadSec);
    if (!clip) return;
    onSplit(clip.item.id, playheadSec - clip.startSec);
  }, [layout, onSplit, playheadSec]);

  const sortableIds = layout.clips.map((clip) => `${CLIP_DRAG_PREFIX}${clip.item.id}`);
  const playheadClipId = clipAtTime(layout, playheadSec)?.item.id;
  const playheadLeft = playheadSec * pxPerSec;

  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Timeline</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={handleSplit}
          disabled={layout.clips.length === 0}
        >
          <Scissors className="h-3.5 w-3.5" />
          Split at playhead
        </Button>
        {onZoomChange ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-2xs text-muted-foreground">Zoom</span>
            <Slider
              className="w-28"
              aria-label="Timeline zoom"
              min={MIN_PX_PER_SEC}
              max={MAX_PX_PER_SEC}
              step={5}
              value={[pxPerSec]}
              onValueChange={(value) => onZoomChange(value[0] ?? pxPerSec)}
            />
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border/60 bg-muted/20">
        <div ref={laneRef} className="relative min-h-full" style={{ width: contentWidth }}>
          {/* Review markers ride inside the scrolling content, on the same pixel
              scale as the clips, so a comment stays over the frame it points at
              when the timeline is zoomed or scrolled. */}
          {commentLane}

          {/* Ruler */}
          <div
            className="relative h-5 border-b border-border/50"
            onPointerDown={(event) => seekAt(event.clientX)}
          >
            {Array.from({ length: tickCount }, (_, index) => {
              const sec = index * tick;
              return (
                <div key={sec} className="absolute top-0 h-full" style={{ left: sec * pxPerSec }}>
                  <div className="h-2 w-px bg-border" />
                  <span className="absolute left-1 top-1.5 text-3xs tabular-nums text-muted-foreground">
                    {sec}s
                  </span>
                </div>
              );
            })}
          </div>

          {/* Clip lane (drop target) */}
          <div
            ref={setNodeRef}
            onPointerDown={handleLaneSeek}
            className="relative flex min-h-[72px] items-center gap-1 p-2"
          >
            <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
              {layout.clips.map((clip) => (
                <TimelineClipBlock
                  key={clip.item.id}
                  clip={clip}
                  pxPerSec={pxPerSec}
                  label={labelFor(clip.item.sourceNodeId)}
                  selected={clip.item.id === selectedItemId}
                  previewUrl={previewUrlFor?.(clip.item.sourceNodeId)}
                  onSelect={() => onSelectItem(clip.item.id)}
                  onTrim={(range) => onTrim(clip.item.id, range)}
                  onRemove={() => onRemove(clip.item.id)}
                  onSplitAtPlayhead={playheadClipId === clip.item.id ? handleSplit : undefined}
                  onDuplicate={onDuplicate ? () => onDuplicate(clip.item.id) : undefined}
                  onToggleMute={
                    onSetMute ? () => onSetMute(clip.item.id, !clip.item.muteAudio) : undefined
                  }
                />
              ))}
            </SortableContext>

            {layout.clips.length === 0 ? (
              <div className="pointer-events-none flex h-14 flex-1 items-center justify-center rounded-md border border-dashed border-border/50 text-2xs text-muted-foreground">
                Drop clips here
              </div>
            ) : null}
          </div>

          {/* Markers (M) — reference lines across the lane */}
          {(markers ?? []).map((marker) => (
            <div
              key={`marker-${marker}`}
              className="pointer-events-none absolute bottom-0 top-0 z-[5] w-px bg-amber-500/50"
              style={{ left: marker * pxPerSec }}
            >
              <div className="absolute -left-1 top-0 h-2 w-2 rounded-b-sm bg-amber-500" />
            </div>
          ))}

          {/* Playhead */}
          <div
            className={cn('absolute bottom-0 top-0 z-10 w-px bg-primary')}
            style={{ left: playheadLeft }}
          >
            <div
              onPointerDown={startPlayheadDrag}
              className="absolute -left-1.5 -top-1 h-3 w-3 cursor-ew-resize rounded-sm bg-primary shadow"
              aria-label="Playhead"
              role="slider"
              tabIndex={0}
              aria-valuenow={Math.round(playheadSec)}
              aria-valuemin={0}
              aria-valuemax={Math.round(layout.totalSec)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
