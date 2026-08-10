'use client';

// "What's Working" — the brand's data-derived winning angles/hooks, mined from its
// own top-performing posts and ads and grounded in measured performance + audience.
// Reads the materialized creative_strategy_reports row (RLS) via
// useCreativeStrategyReport and renders the insights as a sortable data table
// (CreativeStrategyTable) whose top-creative thumbnails carry their real metric,
// a hover preview, and click-through to the live post. Keeps the section chrome
// (header, audience subtitle, hook/angle leaderboards, collapse, dashed
// placeholder while assembling).

import type { CreativeLeaderboardEntry } from '@continuum/contracts';
import { TrendingUp } from 'lucide-react';
import * as React from 'react';

import { Pill, type PillProps, PillStatus } from '@/components/kibo-ui/pill';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCreativeStrategyReport } from '@/hooks/useCreativeStrategyReport';
import { audienceLine } from '@/lib/organic/creative-strategy-rows';
import { cn } from '@/lib/utils';
import { CreativeStrategyTable } from './creative-strategy/CreativeStrategyTable';

// An angle's label is a full sentence in the report. The chip shows as much as fits;
// the tooltip carries the whole thing plus the measured number behind it.
function leaderboardMetricLine(entry: CreativeLeaderboardEntry): string {
  const base = `${entry.count} ${entry.count === 1 ? 'creative' : 'creatives'}`;
  if (entry.metricName && entry.avgMetric !== null) {
    const formatted =
      Math.abs(entry.avgMetric) < 1 ? entry.avgMetric.toFixed(3) : entry.avgMetric.toFixed(2);
    return `${entry.label} — ${base} · avg ${entry.metricName.replace(/_/g, ' ')} ${formatted}`;
  }
  return `${entry.label} — ${base}`;
}

// The leaderboards are already ordered by the report. Rank is what the eye should
// read first, so it carries both the numeral and the tone — brand violet for the
// winner, teal for the runner-up, muted for the rest.
function rankVariant(rank: number): PillProps['variant'] {
  if (rank === 0) return 'violet';
  if (rank === 1) return 'teal';
  return 'muted';
}

function Leaderboard({ title, entries }: { title: string; entries: CreativeLeaderboardEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div>
      <span className="mb-1.5 block text-2xs font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </span>
      <div className="flex gap-1.5 flex-wrap">
        {entries.map((entry, rank) => (
          <Tooltip key={`${title}-${entry.label}`}>
            <TooltipTrigger
              render={
                <Pill
                  variant={rankVariant(rank)}
                  className="cursor-default px-2 py-1 text-xs"
                  data-testid="creative-leaderboard-chip"
                >
                  <PillStatus className="text-2xs tabular-nums">#{rank + 1}</PillStatus>
                  <span className="max-w-64 truncate font-medium">{entry.label}</span>
                  <span className="tabular-nums opacity-70">{entry.count}</span>
                </Pill>
              }
            />
            <TooltipContent>{leaderboardMetricLine(entry)}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

function EmptyCard({ status }: { status: string }) {
  const message =
    status === 'empty'
      ? 'We could not find enough top posts or ads to mine yet. As your content performs, winning angles will appear here.'
      : 'Your winning angles are assembling. The flash-lite agents analyze your top posts and ads to surface the hooks and angles that work — and who they resonate with.';
  return (
    <div className="rounded-lg border border-dashed border-subtle bg-surface/60">
      <div className="px-4 py-6">
        <span className="block text-sm font-medium">What&apos;s Working — your winning angles</span>
        <span className="mt-1 block text-xs text-muted-foreground">{message}</span>
      </div>
    </div>
  );
}

export function CreativeStrategyCard({ brandId }: { brandId?: string }) {
  const { status, report, refreshedAt } = useCreativeStrategyReport(brandId);
  const [open, setOpen] = React.useState(true);

  if (status !== 'ready' || !report || report.insights.length === 0) {
    return <EmptyCard status={status} />;
  }

  const audience = audienceLine(report.audienceSnapshot);
  const sources = report.sourceCounts;

  return (
    // The highest-value panel on the tab: it is the only one that carries the
    // brand accent, so it reads as the focal card among otherwise-flat surfaces.
    <div
      data-tour-id="organic-whats-working"
      className="rounded-lg border border-primary/30 bg-primary/[0.04]"
    >
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <TrendingUp className="size-4 shrink-0 text-primary" aria-hidden="true" />
              What&apos;s Working
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              from your top {sources.topOrganicPosts} posts + {sources.topAds} ads
              {audience ? ` · audience ${audience}` : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className={cn(
              'shrink-0 rounded-md border border-primary/30 px-2 py-1 text-xs text-muted-foreground transition-colors',
              'hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
            aria-expanded={open}
          >
            {open ? 'Hide' : 'Show'}
          </button>
        </div>

        {open ? (
          <TooltipProvider delay={200}>
            <div className="mt-3 grid gap-3">
              <div className="flex gap-4 flex-wrap">
                <Leaderboard title="Top hooks" entries={report.hookLeaderboard} />
                <Leaderboard title="Top angles" entries={report.angleLeaderboard} />
              </div>
              <CreativeStrategyTable insights={report.insights} />
              {refreshedAt ? (
                <span className="block text-right text-xs text-muted-foreground">
                  Updated {new Date(refreshedAt).toLocaleDateString()}
                </span>
              ) : null}
            </div>
          </TooltipProvider>
        ) : null}
      </div>
    </div>
  );
}
