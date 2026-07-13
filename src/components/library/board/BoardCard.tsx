'use client';

// One asset card on the Kanban board: draggable between status columns,
// clickable to open the detail modal. BoardCardContent is shared with the
// DragOverlay so the floating drag preview matches the card exactly.

import type { MediaAsset } from '@continuum/contracts';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { FileIcon } from 'lucide-react';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';

function CardPreview({ asset }: { asset: MediaAsset }) {
  const previewUrl = asset.thumbnailUrl ?? asset.signedUrl ?? null;
  // A postered video is a still image on the board — no <video>, no video bytes.
  if (asset.thumbnailUrl && asset.kind === 'video') {
    return (
      <img
        src={asset.thumbnailUrl}
        alt={asset.title ?? asset.fileName}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    );
  }
  if (previewUrl && asset.kind === 'image') {
    return (
      <img
        src={previewUrl}
        alt={asset.title ?? asset.fileName}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    );
  }
  if (previewUrl && asset.kind === 'video') {
    return (
      // biome-ignore lint/a11y/useMediaCaption: silent board thumbnail of the user's own upload; no caption track exists
      <video src={previewUrl} muted preload="metadata" className="h-full w-full object-cover" />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center">
      <FileIcon className="size-5 text-muted-foreground" />
    </div>
  );
}

export function BoardCardContent({ asset }: { asset: MediaAsset }) {
  return (
    <div className="space-y-1 rounded-md border bg-card p-1.5 text-left shadow-sm">
      <div className="h-20 w-full overflow-hidden rounded bg-muted">
        <CardPreview asset={asset} />
      </div>
      <p className="truncate text-xs font-medium">{asset.title ?? asset.fileName}</p>
      <p className="truncate text-2xs text-muted-foreground">
        {formatRelativeTime(asset.updatedAt)}
      </p>
    </div>
  );
}

export function BoardCard({
  asset,
  onOpen,
}: {
  asset: MediaAsset;
  onOpen: (asset: MediaAsset) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: asset.id,
    data: { type: 'library-asset' },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onOpen(asset)}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        'block w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isDragging && 'opacity-40',
      )}
      {...listeners}
      {...attributes}
    >
      <BoardCardContent asset={asset} />
    </button>
  );
}
