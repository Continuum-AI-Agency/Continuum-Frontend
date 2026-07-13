'use client';

import { useDraggable } from '@dnd-kit/core';
import { Cross2Icon, ImageIcon, PlusIcon, VideoIcon } from '@radix-ui/react-icons';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TimelineInputSource } from '../../types';

// The Video Editor input bin: every source in the host's media pool, shown as a
// placeable tile. Drag a tile onto the timeline, or click "Add" / double-click to
// append it to the end of the track. Hosts whose pool is editable (the Library)
// pass an `action` for the header and `onRemove` to drop a source; the canvas pool
// is derived from the node's edges, so it passes neither.

export const BIN_DRAG_PREFIX = 'bin:';

function BinTile({
  source,
  onPlace,
  onRemove,
}: {
  source: TimelineInputSource;
  onPlace: (source: TimelineInputSource) => void;
  onRemove?: (sourceId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${BIN_DRAG_PREFIX}${source.nodeId}`,
    data: { type: 'bin', sourceNodeId: source.nodeId, kind: source.kind },
  });

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: draggable media tile; the Add button is the keyboard-accessible action
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onDoubleClick={() => onPlace(source)}
      className={cn(
        'group/tile flex cursor-grab items-center gap-2 rounded-md border border-border/60 bg-muted/30 p-2 active:cursor-grabbing',
        isDragging && 'opacity-50',
      )}
    >
      <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded bg-black/80">
        {source.previewUrl ? (
          source.kind === 'image' ? (
            // biome-ignore lint/performance/noImgElement: in-memory data/blob preview; next/image adds no value for canvas media
            <img
              src={source.previewUrl}
              alt={source.label}
              className="h-full w-full object-cover"
            />
          ) : (
            <video
              src={source.previewUrl}
              muted
              preload="metadata"
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            {source.kind === 'image' ? (
              <ImageIcon className="h-4 w-4" />
            ) : (
              <VideoIcon className="h-4 w-4" />
            )}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium">{source.label}</span>
        <span className="text-2xs uppercase tracking-wide text-muted-foreground">
          {source.kind}
        </span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover/tile:opacity-100"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onPlace(source);
        }}
        aria-label={`Add ${source.label} to the timeline`}
      >
        <PlusIcon className="h-3.5 w-3.5" />
      </Button>

      {onRemove ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover/tile:opacity-100"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onRemove(source.nodeId);
          }}
          aria-label={`Remove ${source.label} from the media bin`}
        >
          <Cross2Icon className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

export function MediaBin({
  pool,
  onPlace,
  onRemove,
  action,
}: {
  pool: TimelineInputSource[];
  onPlace: (source: TimelineInputSource) => void;
  onRemove?: (sourceId: string) => void;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-muted-foreground">Media bin</div>
        {action}
      </div>
      {pool.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border/60 p-4 text-center text-2xs text-muted-foreground">
          Wire image or video nodes into this editor to place them here.
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
          {pool.map((source) => (
            <BinTile key={source.nodeId} source={source} onPlace={onPlace} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}
