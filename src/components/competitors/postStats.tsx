'use client';

import { useLocale, useTranslations } from 'next-intl';
// The numbers an Inspiration post is judged by, shared by the tile face and the
// Analyse panel: its outlier multiple against its own account, and its public
// views / likes / comments (Instagram has views on reels only; YouTube on every video).

import { Eye, Heart, MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { type CompetitorPostView, formatOutlier } from './competitorPostView';

const countFormatters = new Map<string, Intl.NumberFormat>();
export function formatCount(value: number | null | undefined, locale = 'en'): string {
  if (typeof value !== 'number') return '–';
  let formatter = countFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    countFormatters.set(locale, formatter);
  }
  return formatter.format(value);
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
  const uiText = useTranslations('competitor');
  const uiLocale = useLocale();
  const label = formatOutlier(view.post.outlierScore, uiLocale);
  if (!label) return null;
  const standout = (view.post.outlierScore ?? 0) >= STANDOUT_OUTLIER;
  const baseline = view.post.baselineEngagement;
  return (
    <span
      data-testid="outlier-badge"
      title={
        typeof baseline === 'number'
          ? uiText('m_48a8ddc2ac', {
              multiple: label,
              name: view.instagramUsername,
              median: formatCount(baseline, uiLocale),
            })
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
      {post.kind === 'reel' || typeof post.viewCount === 'number' ? (
        <Metric
          icon={<Eye className="size-3" aria-hidden />}
          value={post.viewCount}
          metric="views"
        />
      ) : null}
      <Metric
        icon={<Heart className="size-3 text-red-500" aria-hidden />}
        value={post.likeCount}
        metric="likes"
      />
      <Metric
        icon={<MessageCircle className="size-3 text-blue-500" aria-hidden />}
        value={post.commentsCount}
        metric="comments"
      />
    </div>
  );
}

function Metric({
  icon,
  value,
  metric,
}: {
  icon: ReactNode;
  value: number | null | undefined;
  metric: 'views' | 'likes' | 'comments';
}) {
  const uiText = useTranslations('competitor');
  const uiLocale = useLocale();
  return (
    <span
      data-metric={metric}
      data-value={typeof value === 'number' ? value : ''}
      className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-foreground/80"
    >
      {icon}
      <span aria-hidden>{formatCount(value, uiLocale)}</span>
      <span className="sr-only">
        {typeof value === 'number'
          ? metric === 'views'
            ? uiText('m_978e15fd0e', { count: value })
            : metric === 'likes'
              ? uiText('m_9ab560b8c2', { count: value })
              : uiText('m_5643f7d54f', { count: value })
          : metric === 'views'
            ? uiText('m_24be61285e')
            : metric === 'likes'
              ? uiText('m_e9f009d9df')
              : uiText('m_fce06e20e5')}
      </span>
    </span>
  );
}
