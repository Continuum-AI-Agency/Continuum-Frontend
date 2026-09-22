'use client';

// The numbers an Inspiration post is judged by, shared by the tile face and the
// Analyse panel: its outlier multiple against its own account, and its public
// views / likes / comments (views exist on reels only).

import { Eye, Heart, MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { type CompetitorPostView, formatOutlier } from './competitorPostView';

const countFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatCount(value: number | null | undefined): string {
  return typeof value === 'number' ? countFormatter.format(value) : '–';
}

// A post that doubled its account's median is the signal worth a colour; the rest
// stay neutral so the badge does not shout on every card.
const STANDOUT_OUTLIER = 2;

export function OutlierBadge({
  view,
  className,
}: {
  view: CompetitorPostView;
  className?: string;
}) {
  const label = formatOutlier(view.post.outlierScore);
  if (!label) return null;
  const standout = (view.post.outlierScore ?? 0) >= STANDOUT_OUTLIER;
  const baseline = view.post.baselineEngagement;
  return (
    <span
      data-testid="outlier-badge"
      title={
        typeof baseline === 'number'
          ? `${label} @${view.instagramUsername}'s median engagement (likes + comments, median ${formatCount(baseline)})`
          : undefined
      }
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-semibold tabular-nums',
        standout ? 'bg-primary text-primary-foreground' : 'bg-black/60 text-white',
        className,
      )}
    >
      {label}
    </span>
  );
}

export function PostMetrics({ view, className }: { view: CompetitorPostView; className?: string }) {
  const { post } = view;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 text-2xs tabular-nums', className)}>
      {post.kind === 'reel' ? (
        <Metric icon={<Eye className="size-3" aria-hidden />} value={post.viewCount} unit="views" />
      ) : null}
      <Metric
        icon={<Heart className="size-3 text-red-500" aria-hidden />}
        value={post.likeCount}
        unit="likes"
      />
      <Metric
        icon={<MessageCircle className="size-3 text-blue-500" aria-hidden />}
        value={post.commentsCount}
        unit="comments"
      />
    </div>
  );
}

function Metric({
  icon,
  value,
  unit,
}: {
  icon: ReactNode;
  value: number | null | undefined;
  unit: 'views' | 'likes' | 'comments';
}) {
  return (
    <span
      data-metric={unit}
      data-value={typeof value === 'number' ? value : ''}
      className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-foreground/80"
    >
      {icon}
      {formatCount(value)}
      <span className="sr-only"> {unit}</span>
    </span>
  );
}
