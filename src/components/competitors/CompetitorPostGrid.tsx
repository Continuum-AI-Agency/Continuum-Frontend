'use client';

import { COMPETITOR_POST_FORMAT_LABELS } from '@continuum/contracts';
import { type ReactNode, useState } from 'react';

import { cn } from '@/lib/utils';
import { CompetitorPostHoverTile } from './CompetitorPostHoverTile';
import {
  type CompetitorPostView,
  competitorPostViewKey,
  countBy,
  type FormatFilter,
  filterViews,
  POST_TYPE_LABELS,
  type PostTypeFilter,
} from './competitorPostView';
import { FilterChips } from './inspirationControls';

const DEFAULT_GRID_CLASS =
  'grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5';
const SKELETON_COUNT = 10;

export function CompetitorPostGrid({
  brandId,
  views,
  isLoading,
  isError,
  emptyText,
  errorText = 'Competitor posts are unavailable right now.',
  gridClassName = DEFAULT_GRID_CLASS,
  renderActions,
}: {
  brandId: string;
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
          <div key={index} className="aspect-[4/6] w-full animate-pulse rounded-lg bg-muted/70" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{errorText}</p>;
  }

  if (views.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/70 py-6 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <div data-testid="inspiration-grid" className={cn(gridClassName)}>
      {views.map((view) => (
        <CompetitorPostHoverTile
          key={competitorPostViewKey(view)}
          brandId={brandId}
          view={view}
          actions={renderActions?.(view)}
        />
      ))}
    </div>
  );
}

// The grid behind post-type and format chips. Chip counts come from the posts in
// hand, and the format row counts within the chosen post type, so every chip on
// screen returns what it says. A selected format that the current list no longer
// holds stays visible at 0 so it can be cleared.
export function FilterablePostGrid({
  showFilters = true,
  ...grid
}: Parameters<typeof CompetitorPostGrid>[0] & { showFilters?: boolean }) {
  const [postType, setPostType] = useState<PostTypeFilter>('all');
  const [format, setFormat] = useState<FormatFilter>('all');
  const { views } = grid;

  const typeOptions = countBy(views, (view) => view.post.kind).map(([id, count]) => ({
    id,
    label: POST_TYPE_LABELS[id],
    count,
  }));
  const ofType = filterViews(views, { postType, format: 'all' });
  const formatOptions = countBy(ofType, (view) => view.format).map(([id, count]) => ({
    id,
    label: COMPETITOR_POST_FORMAT_LABELS[id],
    count,
  }));
  if (format !== 'all' && !formatOptions.some((option) => option.id === format)) {
    formatOptions.push({ id: format, label: COMPETITOR_POST_FORMAT_LABELS[format], count: 0 });
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {showFilters && views.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <FilterChips
            label="Post type"
            value={postType}
            options={typeOptions}
            total={views.length}
            onChange={setPostType}
          />
          <FilterChips
            label="Format"
            value={format}
            options={formatOptions}
            total={ofType.length}
            onChange={setFormat}
          />
        </div>
      ) : null}
      <CompetitorPostGrid
        {...grid}
        views={filterViews(views, { postType, format })}
        emptyText={views.length > 0 ? 'No posts match these filters.' : grid.emptyText}
      />
    </div>
  );
}
