'use client';

// Rich hover quick-look shown in the gallery HoverCard. Surfaces the adaptive
// metric set for the post's media type, a 7-day per-post trend sparkline (with a
// "building history" hint while the local snapshot walk fills in), and the
// caption. Stat values are lifetime-to-date totals; each tile carries a tooltip
// (definition + period-over-period delta vs the prior 7d, once 14 days of
// history exist). The full deep dive still lives in the side panel that opens
// on click.

import { ExternalLink } from 'lucide-react';
import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { OrganicPost } from '@/lib/schemas/organicMetrics';
import { cn } from '@/lib/utils';
import { deltaTone, formatDateTime } from '../organic-format';
import {
  buildPostMetricSeries,
  countNumericSeriesPoints,
  POST_COMPARISON_UNLOCK_COPY,
  POST_HISTORY_ACCOUNT_STANDIN_COPY,
  POST_HISTORY_EMPTY_COPY,
  POST_HISTORY_TRACKED_DAYS,
  type PostMetricKey,
  postHistoryProgressCopy,
  postPeriodComparisons,
} from '../organic-metrics-utils';
import { getCardMetricSet, resolveCardMediaKind } from './cardMetricSet';
import { Sparkline } from './Sparkline';
import { StatTile } from './StatTile';

const MEDIA_KIND_LABEL = {
  reel: 'Reel',
  image: 'Post',
  carousel: 'Carousel',
} as const;

const SERIES_KEYS: PostMetricKey[] = ['views', 'reach', 'engagement', 'comments'];

// Picks the chartable metric to sparkline: the first primary metric that has a
// per-day series, defaulting to views.
export function resolveSeriesKey(descriptorKeys: Array<string | undefined>): PostMetricKey {
  const match = descriptorKeys.find(
    (key): key is PostMetricKey => key !== undefined && SERIES_KEYS.includes(key as PostMetricKey),
  );
  return match ?? 'views';
}

export type QuickLookTrendState = 'post' | 'account' | 'empty';

// Chooses which trend to show: the per-post series when it carries enough real
// points, otherwise the account trend as context, otherwise an empty hint. Counts
// are of *reported* points, not axis slots — a window padded with unreported days
// must not pass for a series.
export function resolveTrendState(
  postPointCount: number,
  accountPointCount: number,
): QuickLookTrendState {
  if (postPointCount > 1) return 'post';
  if (accountPointCount > 1) return 'account';
  return 'empty';
}

export function PostQuickLook({
  post,
  accountSeries,
  loading = false,
}: {
  post: OrganicPost;
  accountSeries?: Array<{ date: string; value: number | undefined }>;
  loading?: boolean;
}) {
  const kind = resolveCardMediaKind(post);
  const descriptors = React.useMemo(() => getCardMetricSet(post), [post]);
  const comparisons = React.useMemo(() => postPeriodComparisons(post), [post]);

  const primary = descriptors.filter((d) => d.emphasis === 'primary');
  const secondary = descriptors.filter((d) => d.emphasis === 'secondary');
  const hasAnyValue = descriptors.some((d) => typeof d.value === 'number');

  const seriesKey = resolveSeriesKey(primary.map((d) => d.comparisonKey));
  const series = React.useMemo(
    () => buildPostMetricSeries({ post, metricKey: seriesKey }),
    [post, seriesKey],
  );
  const trendDays = post.breakdown7d?.length ?? 0;
  // Reach is lifetime-only and never carries a comparison (see PostComparisonKey),
  // so it can't index the comparisons map — fall back to a flat tone for it.
  const comparisonKey = seriesKey === 'reach' ? undefined : seriesKey;
  const tone = deltaTone(comparisonKey ? comparisons[comparisonKey]?.percentageChange : undefined);
  const trendState = resolveTrendState(
    countNumericSeriesPoints(series),
    countNumericSeriesPoints(accountSeries ?? []),
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {MEDIA_KIND_LABEL[kind]}
            </span>
            {post.isBoosted ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Boosted
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{formatDateTime(post.timestamp)}</span>
            {post.permalink ? (
              <a
                href={post.permalink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open post on platform"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </div>
        </div>

        {loading && !hasAnyValue ? (
          <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <p className="text-2xs leading-snug text-muted-foreground">
              {Object.keys(comparisons).length > 0
                ? 'All-time totals · change shown vs the previous 7 days'
                : `All-time totals · ${POST_COMPARISON_UNLOCK_COPY}`}
            </p>
            <div
              className={cn('grid gap-1.5', primary.length >= 3 ? 'grid-cols-3' : 'grid-cols-2')}
            >
              {primary.map((d) => (
                <StatTile
                  key={d.key}
                  label={d.label}
                  value={d.value}
                  format={d.format}
                  iconKey={d.iconKey}
                  valueColor={d.valueColor}
                  comparison={d.comparisonKey ? comparisons[d.comparisonKey] : undefined}
                  lifetimeOnly={d.lifetimeOnly}
                  tooltip={d.tooltip}
                  emphasis="primary"
                />
              ))}
            </div>

            {secondary.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-1.5 gap-y-0.5 border-t border-subtle pt-2">
                {secondary.map((d) => (
                  <StatTile
                    key={d.key}
                    label={d.label}
                    value={d.value}
                    format={d.format}
                    iconKey={d.iconKey}
                    valueColor={d.valueColor}
                    comparison={d.comparisonKey ? comparisons[d.comparisonKey] : undefined}
                    lifetimeOnly={d.lifetimeOnly}
                    tooltip={d.tooltip}
                    emphasis="secondary"
                  />
                ))}
              </div>
            ) : null}
          </>
        )}

        <div className="border-t border-subtle pt-2">
          {trendState === 'post' ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">7-day trend</span>
                <span className="text-2xs text-muted-foreground">{seriesKey}</span>
              </div>
              <Sparkline
                values={series.map((point) => point.value)}
                tone={tone}
                width={300}
                height={36}
                className="w-full"
                ariaLabel={`${seriesKey} 7-day trend`}
              />
              {trendDays < POST_HISTORY_TRACKED_DAYS ? (
                <p className="text-xs leading-snug text-muted-foreground">
                  {postHistoryProgressCopy(trendDays)}
                </p>
              ) : null}
            </div>
          ) : trendState === 'account' ? (
            <div className="space-y-1">
              <p className="text-xs leading-snug text-muted-foreground">
                {POST_HISTORY_ACCOUNT_STANDIN_COPY} {postHistoryProgressCopy(trendDays)}
              </p>
              <Sparkline
                values={(accountSeries ?? []).map((point) => point.value)}
                tone="flat"
                width={300}
                height={36}
                className="w-full"
                ariaLabel="account trend"
              />
            </div>
          ) : (
            <p className="text-xs leading-snug text-muted-foreground">{POST_HISTORY_EMPTY_COPY}</p>
          )}
        </div>

        {post.caption?.trim().length ? (
          <p className="line-clamp-3 text-pretty text-xs leading-snug text-secondary">
            {post.caption}
          </p>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
