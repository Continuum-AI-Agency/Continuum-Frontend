'use client';

// "By platform": one text row per platform from optimizer_get_portfolio_metrics, no chart
// (frontend.html §3). The source is named once, in this block's header; under GA4 or a
// spreadsheet every cost says "· GA4" and the platform's own count sits beside it in grey.
// A Meta-only portfolio renders nothing here and keeps today's screens — including while the
// RPC is missing or failing: the "not available yet" note is owed only to a portfolio known to
// hold a member off Meta, so the ad-set ranking stays the first block of a Meta body.

import { cn } from '@/lib/utils';
import { formatCpa, formatCurrency } from '../../format';
import { attributionHeader, attributionSourceName } from '../attribution/attributionModel';
import {
  capsHoldNonMetaMember,
  usePortfolioPlatformCaps,
} from '../platformCaps/usePortfolioPlatformCaps';
import { MultiPlatformUnavailable } from '../platforms/MultiPlatformUnavailable';
import { PlatformChip } from '../platforms/PlatformChip';
import { PLATFORM_NAMES } from '../platforms/platformTabsModel';
import {
  buildByPlatform,
  formatResults,
  formatShare,
  type PlatformRow,
  type PlatformRowState,
} from './byPlatformModel';
import { type PortfolioMetricsState, usePortfolioMetrics } from './usePortfolioMetrics';

const STATE_TONE: Record<PlatformRowState['kind'], string> = {
  on_target: 'text-success',
  under: 'text-success',
  over: 'text-destructive',
  no_results: 'text-warning',
  no_target: 'text-muted-foreground',
};

const WINDOW_WORDS: Record<string, string> = {
  d3: '3 days',
  d7: '7 days',
  d14: '14 days',
  d30: '30 days',
  period: 'This period',
};

function PlatformRowLine({
  row,
  currency,
  resultKind,
  sourceSuffix,
}: {
  row: PlatformRow;
  currency: string | null;
  resultKind: string;
  sourceSuffix: string | null;
}) {
  return (
    <li
      className="grid grid-cols-2 items-baseline gap-x-4 gap-y-1 py-2 sm:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]"
      data-platform={row.platform}
      data-testid="by-platform-row"
    >
      <span className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
        <PlatformChip platform={row.platform} />
        <span className="truncate text-muted-foreground text-xs">{row.delivering}</span>
      </span>
      <span className="text-sm tabular-nums" data-testid="by-platform-cost">
        <span className="font-semibold">{formatCpa(row.costPerResult, currency)}</span>{' '}
        <span className="text-muted-foreground text-xs">
          per {resultKind}
          {sourceSuffix ? ` · ${sourceSuffix}` : ''}
        </span>
      </span>
      <span className="text-sm tabular-nums" data-testid="by-platform-results">
        <span className="font-semibold">{formatResults(row.results)}</span>{' '}
        <span className="text-muted-foreground text-xs">· {formatShare(row.resultsShare)}</span>
        {row.platformResults !== null ? (
          <span className="block text-muted-foreground text-xs" data-testid="by-platform-own-count">
            {formatResults(row.platformResults)} by {PLATFORM_NAMES[row.platform]}
          </span>
        ) : null}
      </span>
      <span className="text-sm tabular-nums" data-testid="by-platform-spend">
        <span className="font-semibold">{formatCurrency(row.spend, currency)}</span>{' '}
        <span className="text-muted-foreground text-xs">· {formatShare(row.spendShare)}</span>
      </span>
      <span
        className={cn('text-xs font-medium', STATE_TONE[row.state.kind])}
        data-state={row.state.kind}
        data-testid="by-platform-state"
      >
        {row.state.label}
      </span>
    </li>
  );
}

export function ByPlatformView({
  state,
  now,
  nonMetaMember = false,
}: {
  state: PortfolioMetricsState;
  now: Date;
  /** Known, from another read, to hold a member off Meta. Unknown reads as Meta. */
  nonMetaMember?: boolean;
}) {
  if (state.status === 'loading') return null;
  if (state.status !== 'ready' && !nonMetaMember) return null;
  if (state.status === 'unavailable') {
    return <MultiPlatformUnavailable detail="The figures below are Meta's, as today." />;
  }
  if (state.status === 'error') {
    return (
      <p className="text-muted-foreground text-xs" data-testid="by-platform-error" role="status">
        The by-platform read failed. The figures below are Meta's, as today.
      </p>
    );
  }
  const { metrics } = state;
  const view = buildByPlatform(metrics);
  if (view.metaOnly) return null;
  const header = attributionHeader(metrics, now);
  const sourceSuffix = view.sourceIsNotPlatform ? attributionSourceName(header.used) : null;
  const resultKind = metrics.result_kind.replace(/s$/, '');
  return (
    <section aria-label="By platform" data-testid="by-platform">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-sm">By platform</h3>
        <p className="text-muted-foreground text-xs" data-testid="by-platform-attribution">
          {WINDOW_WORDS[metrics.window.label] ?? metrics.window.label} · {header.line}
        </p>
      </header>
      {header.fallback ? (
        <p className="mt-1 text-muted-foreground text-xs" data-testid="by-platform-fallback">
          {header.fallback}
        </p>
      ) : null}
      <ul className="mt-2 divide-y divide-border/60">
        {view.rows.map((row) => (
          <PlatformRowLine
            currency={metrics.currency}
            key={row.platform}
            resultKind={resultKind}
            row={row}
            sourceSuffix={sourceSuffix}
          />
        ))}
      </ul>
    </section>
  );
}

export function ByPlatform({ portfolioId }: { portfolioId: string }) {
  const state = usePortfolioMetrics(portfolioId);
  const caps = usePortfolioPlatformCaps(portfolioId);
  return (
    <ByPlatformView nonMetaMember={capsHoldNonMetaMember(caps)} now={new Date()} state={state} />
  );
}
