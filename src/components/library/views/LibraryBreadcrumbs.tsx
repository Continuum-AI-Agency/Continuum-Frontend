'use client';

import type { MediaCollection } from '@continuum/contracts';
import { ChevronRight } from 'lucide-react';
import type { DragEvent } from 'react';
import { cn } from '@/lib/utils';
import { collectionTrail } from './collectionTrail';

type DropHandlers = {
  overCollectionId: string | null;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
};

// "Library › Parent › Child". Every segment is also a drop target (it carries
// data-collection-id), so assets can be filed into an ancestor from inside a child.
export function LibraryBreadcrumbs({
  collections,
  collectionId,
  onSelectCollection,
  drop,
}: {
  collections: readonly MediaCollection[];
  collectionId: string;
  onSelectCollection: (id: string | null) => void;
  drop: DropHandlers;
}) {
  const trail = collectionTrail(collections, collectionId);
  if (trail.length === 0) return null;

  return (
    <nav
      aria-label="Collection path"
      data-testid="library-breadcrumbs"
      className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground"
    >
      <button
        type="button"
        onClick={() => onSelectCollection(null)}
        className="rounded px-1 py-0.5 hover:text-foreground"
      >
        Library
      </button>
      {trail.map((segment, index) => {
        const current = index === trail.length - 1;
        return (
          <span key={segment.id} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="size-3.5 shrink-0" aria-hidden />
            <button
              type="button"
              data-testid="library-breadcrumb"
              data-collection-id={segment.id}
              aria-current={current ? 'page' : undefined}
              onClick={() => onSelectCollection(segment.id)}
              onDragOver={drop.onDragOver}
              onDragLeave={drop.onDragLeave}
              onDrop={drop.onDrop}
              className={cn(
                'max-w-48 truncate rounded px-1 py-0.5 hover:text-foreground',
                current && 'font-medium text-foreground',
                drop.overCollectionId === segment.id && 'bg-primary/10 ring-2 ring-primary/50',
              )}
            >
              {segment.name}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
