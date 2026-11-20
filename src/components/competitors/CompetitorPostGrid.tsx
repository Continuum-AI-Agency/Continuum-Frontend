'use client';

import { COMPETITOR_POST_FORMAT_LABELS } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { localizeCompetitorCopy } from '@/i18n/competitorCopy';
import { cn } from '@/lib/utils';
import { CompetitorPostHoverTile } from './CompetitorPostHoverTile';
import {
  type CompetitorPostView,
  competitorPostViewKey,
  countBy,
  type FormatFilter,
  filterViews,
  type PostTypeFilter,
  postTypeLabel,
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
  errorText,
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
  const uiText = useTranslations('competitor');
  if (isLoading) {
    return (
      <div className={gridClassName}>
        {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
          <Skeleton key={index} className="aspect-[4/6] w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {errorText ?? localizeCompetitorCopy('Competitor posts are unavailable right now.', uiText)}
      </p>
    );
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
  const uiText = useTranslations('competitor');
  const [postType, setPostType] = useState<PostTypeFilter>('all');
  const [format, setFormat] = useState<FormatFilter>('all');
  const { views } = grid;
  // A grid is one platform's posts (YouTube is never interleaved with Instagram).
  const platform = views[0]?.post.platform;

  const typeOptions = countBy(views, (view) => view.post.kind).map(([id, count]) => ({
    id,
    label: postTypeLabel(id, platform),
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
            label={uiText('post_type_e5c31e2')}
            value={postType}
            options={typeOptions}
            total={views.length}
            onChange={setPostType}
          />
          {/* A YouTube format would only restate the post type (Reel/Photo), and
              inferring a video's category is off-policy. */}
          {platform === 'youtube' ? null : (
            <FilterChips
              label={uiText('format_2f34366')}
              value={format}
              options={formatOptions}
              total={ofType.length}
              onChange={setFormat}
            />
          )}
        </div>
      ) : null}
      <CompetitorPostGrid
        {...grid}
        views={filterViews(views, { postType, format })}
        emptyText={
          views.length > 0 ? uiText('no_posts_match_these_filters_6c9220f') : grid.emptyText
        }
      />
    </div>
  );
}
