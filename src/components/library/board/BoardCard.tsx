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
  const previewUrl =
    (asset.preview?.state === 'ready' ? asset.preview.signedUrl : null) ??
    asset.thumbnailUrl ??
    asset.signedUrl ??
    null;
  // A postered video is a still image on the board — no <video>, no video bytes.
  if (
    (asset.thumbnailUrl && asset.kind === 'video') ||
    (asset.preview?.state === 'ready' && asset.preview.kind === 'image')
  ) {
    return (
      <img
        src={previewUrl ?? undefined}
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
  if (
    previewUrl &&
    (asset.kind === 'video' ||
      (asset.preview?.state === 'ready' && asset.preview.kind === 'video'))
  ) {
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
  selected = false,
  onToggleSelected,
}: {
  asset: MediaAsset;
  onOpen: (asset: MediaAsset) => void;
  selected?: boolean;
  onToggleSelected?: (asset: MediaAsset) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: asset.id,
    data: { type: 'library-asset' },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        'group relative block w-full touch-none rounded-md outline-none',
        selected && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
        isDragging && 'opacity-40',
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(asset)}
        className="block w-full cursor-grab rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...listeners}
        {...attributes}
      >
        <BoardCardContent asset={asset} />
      </button>
      {onToggleSelected ? (
        <button
          type="button"
          aria-label={selected ? `Deselect ${asset.title ?? asset.fileName}` : `Select ${asset.title ?? asset.fileName}`}
          aria-pressed={selected}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelected(asset);
          }}
          className={cn(
            'absolute left-2 top-2 flex size-5 items-center justify-center rounded border bg-background/90 text-primary shadow-sm backdrop-blur transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selected ? 'border-primary opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          {selected ? <span aria-hidden>✓</span> : null}
        </button>
      ) : null}
    </div>
  );
}
