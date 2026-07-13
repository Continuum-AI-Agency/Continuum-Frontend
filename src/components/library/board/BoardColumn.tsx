'use client';

// One lane on the Kanban board: droppable body, count in the header, and a
// subtle drop hint when empty. The lane knows nothing about WHAT it groups —
// its id already encodes the write a drop performs (see boardGrouping).

import type { MediaAsset } from '@continuum/contracts';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { BoardCard } from './BoardCard';
import type { BoardLane } from './boardGrouping';

export function BoardColumn({
  lane,
  onOpenDetail,
}: {
  lane: BoardLane;
  onOpenDetail: (asset: MediaAsset) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: lane.id });

  return (
    <div className="flex w-56 shrink-0 flex-col rounded-lg border bg-muted/30">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <span className={cn('inline-flex size-2 shrink-0 rounded-full', lane.dotClass)} />
        <h3 className="truncate text-xs font-medium">{lane.label}</h3>
        <span className="ml-auto text-2xs text-muted-foreground tabular-nums">
          {lane.assets.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-32 flex-1 flex-col gap-1.5 overflow-y-auto rounded-b-lg p-1.5',
          isOver && 'bg-primary/5 ring-1 ring-inset ring-primary/30',
        )}
      >
        {lane.assets.map((asset) => (
          <BoardCard key={asset.id} asset={asset} onOpen={onOpenDetail} />
        ))}
        {lane.assets.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border/60 p-3">
            <p className="text-2xs text-muted-foreground">Drop assets here</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
