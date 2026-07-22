'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { CompetitorPostHoverTile } from './CompetitorPostHoverTile';
import { type CompetitorPostView, competitorPostViewKey } from './competitorPostView';

const DEFAULT_GRID_CLASS = 'grid grid-cols-3 sm:grid-cols-4 gap-2';
const SKELETON_COUNT = 12;

export function CompetitorPostGrid({
  views,
  isLoading,
  isError,
  emptyText,
  errorText = 'Competitor posts are unavailable right now.',
  gridClassName = DEFAULT_GRID_CLASS,
  renderActions,
}: {
  views: CompetitorPostView[];
  isLoading?: boolean;
  isError?: boolean;
  emptyText: string;
  errorText?: string;
  gridClassName?: string;
  renderActions?: (view: CompetitorPostView) => ReactNode;
}) {
  if (isLoading) {
    return (
      <div className={gridClassName}>
        {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
          <div key={index} className="aspect-square w-full animate-pulse rounded-md bg-muted/70" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{errorText}</p>;
  }

  if (views.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/70 p-8 text-center">
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className={cn(gridClassName)}>
      {views.map((view) => (
        <CompetitorPostHoverTile
          key={competitorPostViewKey(view)}
          view={view}
          actions={renderActions?.(view)}
        />
      ))}
    </div>
  );
}
