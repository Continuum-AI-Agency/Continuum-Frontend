'use client';

// Deep-look hover card for a single creative. Wraps any trigger (a thumbnail, a
// legend chip, a hovered timeline point) and reveals the creative in context: its
// thumbnail, the communication angle + hook Jaina tagged it with, the angle
// confidence, and a per-day spend sparkline from the ad_daily_trends read. When
// the daily scope isn't deployed the card degrades to the static fields — the
// sparkline simply doesn't render. This is the "hover anything creative to see
// what's going on" affordance.

import type { AdDailyTrend, AdsetAd, PaidAdAngle } from '@continuum/contracts';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { formatCpa, formatCurrency, humanize } from '../format';

function Sparkline({ values, color = 'var(--chart-1)' }: { values: number[]; color?: string }) {
  const points = values.filter((value) => Number.isFinite(value));
  if (points.length < 2) return null;
  const width = 240;
  const height = 32;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const path = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      aria-hidden="true"
      className="w-full"
      height={height}
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
    >
      <polyline
        fill="none"
        points={path}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
    </svg>
  );
}

type CreativeHoverCardProps = {
  ad: AdsetAd;
  angle?: PaidAdAngle | null;
  trend?: AdDailyTrend | null;
  currency?: string | null;
  children: ReactNode;
};

export function CreativeHoverCard({
  ad,
  angle,
  trend,
  currency,
  children,
}: CreativeHoverCardProps) {
  const series = trend?.series ?? [];
  const spend = series.reduce((sum, point) => sum + point.spend, 0);
  const lastCpa = series.at(-1)?.cpa ?? null;
  const confidence = angle?.confidence ?? null;

  return (
    <HoverCard closeDelay={80} openDelay={120}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-72 space-y-3">
        <div className="flex gap-3">
          {ad.thumbnailUrl ? (
            // Meta CDN thumbnail — a plain img is correct here (external, ephemeral URL).
            // biome-ignore lint/performance/noImgElement: external ad-thumbnail URL, not a bundled asset
            <img
              alt={ad.name ?? 'Creative'}
              className="size-14 shrink-0 rounded-md object-cover"
              loading="lazy"
              src={ad.thumbnailUrl}
            />
          ) : (
            <div className="grid size-14 shrink-0 place-items-center rounded-md bg-muted text-3xs text-muted-foreground">
              no image
            </div>
          )}
          <div className="min-w-0 space-y-1">
            <p className="truncate font-medium text-sm">{ad.name ?? ad.id}</p>
            {angle ? (
              <Badge className="text-3xs" variant="secondary">
                {humanize(angle.angle)}
              </Badge>
            ) : null}
            {ad.status ? <p className="text-3xs text-muted-foreground">{ad.status}</p> : null}
          </div>
        </div>

        {angle?.hook ? (
          <p className="line-clamp-2 text-muted-foreground text-xs">“{angle.hook}”</p>
        ) : null}

        {confidence != null ? (
          <div className="space-y-1">
            <div className="flex justify-between text-3xs text-muted-foreground">
              <span>Angle confidence</span>
              <span className="tabular-nums">{Math.round(confidence * 100)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.round(confidence * 100)}%`, background: 'var(--chart-1)' }}
              />
            </div>
          </div>
        ) : null}

        {series.length >= 2 ? (
          <div className="space-y-1 border-border/60 border-t pt-2">
            <div className="flex items-center justify-between text-3xs text-muted-foreground tabular-nums">
              <span>Last {series.length}d</span>
              <span>
                spend {formatCurrency(spend, currency)} · CPA {formatCpa(lastCpa, currency)}
              </span>
            </div>
            <Sparkline values={series.map((point) => point.spend)} />
          </div>
        ) : (
          <p className="text-3xs text-muted-foreground">
            Per-day creative trend appears once daily metrics load.
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
