'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, Image, Scissors, Trash2, Video, Volume2, VolumeX, X } from 'lucide-react';
import type React from 'react';
import { useCallback } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { ClipWaveform } from './ClipWaveform';
import { useClipMediaPreview } from './useClipMediaPreview';
import type { ClipLayout } from './useTimelineEditorModel';

export const CLIP_DRAG_PREFIX = 'clip:';

// One placement on the timeline track. The body is the dnd-kit sortable drag
// surface (reorder); the left/right edges are pointer-drag trim handles for
// video clips (image stills resize via the inspector). Trim handles stop
// propagation so they never start a sort drag. The block is its own context-menu
// trigger: the editor dialog is portaled to the body, so without one the
// right-click bubbles the React tree and opens the canvas node menu instead.
export function TimelineClipBlock({
  clip,
  pxPerSec,
  label,
  selected,
  previewUrl,
  onSelect,
  onTrim,
  onRemove,
  onSplitAtPlayhead,
  onDuplicate,
  onToggleMute,
}: {
  clip: ClipLayout;
  pxPerSec: number;
  label: string;
  selected: boolean;
  previewUrl?: string;
  onSelect: () => void;
  onTrim: (range: { startSec?: number; endSec?: number }) => void;
  onRemove: () => void;
  // Omitted while the playhead sits outside this clip: there is nothing here to
  // cut, so the menu item renders disabled rather than silently doing nothing.
  onSplitAtPlayhead?: () => void;
  // Omitted by hosts whose document model has no such mutation; the menu hides
  // the item rather than offering a no-op.
  onDuplicate?: () => void;
  onToggleMute?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${CLIP_DRAG_PREFIX}${clip.item.id}`,
  });

  const isVideo = clip.item.kind === 'video';
  const hasAudio = isVideo && !clip.item.muteAudio;
  const { thumbnails, peaks } = useClipMediaPreview({ url: previewUrl, isVideo, hasAudio });

  const startTrim = useCallback(
    (edge: 'start' | 'end') => (event: React.PointerEvent) => {
      event.stopPropagation();
      event.preventDefault();
      const startX = event.clientX;
      const origStart = Math.max(0, clip.item.trimStartSec ?? 0);
      const origEnd = clip.item.trimEndSec ?? origStart + clip.durationSec;

      const handleMove = (moveEvent: PointerEvent) => {
        const deltaSec = (moveEvent.clientX - startX) / pxPerSec;
        if (edge === 'start') onTrim({ startSec: origStart + deltaSec });
        else onTrim({ endSec: origEnd + deltaSec });
      };
      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [clip.durationSec, clip.item.trimEndSec, clip.item.trimStartSec, onTrim, pxPerSec],
  );

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: Math.max(24, clip.widthPx),
    opacity: isDragging ? 0.6 : 1,
  };

  const muted = Boolean(clip.item.muteAudio);

  const clipBlock = (
    // biome-ignore lint/a11y/noStaticElementInteractions: sortable clip surface; dnd-kit supplies keyboard reorder
    // biome-ignore lint/a11y/useKeyWithClickEvents: selection mirrors the dnd-kit keyboard handlers on this element
    <div
      ref={setNodeRef}
      data-testid="timeline-clip"
      style={style}
      onClick={onSelect}
      // Right-click selects too, so the inspector follows whatever the menu will act on.
      onContextMenu={onSelect}
      className={cn(
        'group/clip relative flex h-14 shrink-0 cursor-grab items-center overflow-hidden rounded-md border bg-gradient-to-b from-muted/60 to-muted/30 active:cursor-grabbing',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border/60',
      )}
      {...attributes}
      {...listeners}
    >
      {thumbnails.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 flex opacity-80" aria-hidden="true">
          {thumbnails.map((src, index) => (
            <img
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-order filmstrip frames from one source
              key={`${clip.item.id}-thumb-${index}`}
              src={src}
              alt=""
              className="h-full min-w-0 flex-1 object-cover"
              draggable={false}
            />
          ))}
        </div>
      ) : null}

      {thumbnails.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/40" />
      ) : null}

      {peaks.length > 0 ? (
        <ClipWaveform
          peaks={peaks}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-4 text-primary/70"
        />
      ) : null}

      <div
        className={cn(
          'pointer-events-none relative flex min-w-0 flex-1 items-center gap-1.5 px-2',
          thumbnails.length > 0 && 'text-white',
        )}
      >
        {isVideo ? (
          <Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Image className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate text-2xs font-medium">{label}</span>
        <span className="ml-auto shrink-0 text-2xs tabular-nums text-muted-foreground">
          {clip.durationSec.toFixed(1)}s
        </span>
      </div>

      {isVideo ? (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-drag trim handle; keyboard trim is via numeric edit */}
          <div
            title="Trim clip start"
            onPointerDown={startTrim('start')}
            className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-primary/0 transition-colors hover:bg-primary/60 group-hover/clip:bg-primary/30"
          />
          {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-drag trim handle; keyboard trim is via numeric edit */}
          <div
            title="Trim clip end"
            onPointerDown={startTrim('end')}
            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-primary/0 transition-colors hover:bg-primary/60 group-hover/clip:bg-primary/30"
          />
        </>
      ) : null}

      <button
        type="button"
        aria-label="Remove clip"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        className="absolute right-1 top-1 hidden h-4 w-4 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground group-hover/clip:flex"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger className="contents">{clipBlock}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem disabled={!onSplitAtPlayhead} onClick={() => onSplitAtPlayhead?.()}>
          <Scissors />
          Split at playhead
          <ContextMenuShortcut>S</ContextMenuShortcut>
        </ContextMenuItem>
        {onDuplicate ? (
          <ContextMenuItem onClick={onDuplicate}>
            <Copy />
            Duplicate
            <ContextMenuShortcut>D</ContextMenuShortcut>
          </ContextMenuItem>
        ) : null}
        {onToggleMute && isVideo ? (
          <ContextMenuItem onClick={onToggleMute}>
            {muted ? <Volume2 /> : <VolumeX />}
            {muted ? 'Unmute' : 'Mute'}
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={onRemove}>
          <Trash2 />
          Remove
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
