'use client';

// The SERVER LOG — what the optimizer's machinery did, newest first. Cycle lifecycle only:
// a cycle completed, was skipped, or threw; a roster drifted; an ingest dropped malformed
// rows; a persist failed. Nothing here touched the ad account.
//
// It used to be one merged feed. public.optimizer_list_logs is narrowed to lifecycle
// server-side now, and everything it dropped — money writes, setting edits, recommendation
// decisions — arrives from public.optimizer_list_actions with a before, an after, an actor
// and a revert, which is more than a flat log line could ever carry. The client-side family
// triage that used to paper over the merge is gone with it.
//
// Each event renders its own shape (readLifecycleRow) rather than the first four keys of its
// `fields` bag printed as monospace `key: value`.

import type { OptimizerLogRow } from '@continuum/contracts';
import { ScrollTextIcon } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/state/EmptyState';
import { useOptimizerLogs } from '../useOptimizerData';
import { FeedFooter, FeedSkeleton, PortfolioFilter, RowHeader } from './feedChrome';
import {
  ALL_PORTFOLIOS,
  distinctPortfolioNames,
  filterByPortfolio,
  type LifecycleFact,
  readLifecycleRow,
} from './logFilters';
import { OptimizerReadError } from './OptimizerReadError';

type OptimizerLogsProps = { brandId: string };

const LEVEL_STYLES: Record<OptimizerLogRow['level'], string> = {
  info: 'border-border/70 bg-muted/40 text-muted-foreground',
  warn: 'border-warning/40 bg-warning/10 text-warning',
  error: 'border-destructive/40 bg-destructive/10 text-destructive',
};

function LevelBadge({ level }: { level: OptimizerLogRow['level'] }) {
  return (
    <span
      className={`mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide ${LEVEL_STYLES[level]}`}
    >
      {level}
    </span>
  );
}

function FactList({ facts }: { facts: LifecycleFact[] }) {
  if (facts.length === 0) return null;
  return (
    <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
      {facts.map((fact) => (
        <div key={fact.label} className="flex items-baseline gap-1">
          <dt className="text-2xs text-muted-foreground">{fact.label}</dt>
          <dd className="font-mono text-2xs font-semibold tabular-nums">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The long tail of a row — the drifted ad sets, the per-item failures. Collapsed by default
 *  so a 40-ad-set drift does not bury the rest of the feed, but present rather than truncated
 *  to four keys with the rest silently dropped. */
function DetailList({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-2xs text-muted-foreground underline-offset-2 hover:underline">
        {lines.length} listed
      </summary>
      <ul className="mt-1 space-y-0.5">
        {lines.map((line) => (
          <li key={line} className="truncate font-mono text-2xs text-muted-foreground">
            {line}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function LifecycleLogRow({ row }: { row: OptimizerLogRow }) {
  const read = readLifecycleRow(row);
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border/70 bg-card px-3 py-2">
      <LevelBadge level={row.level} />
      <div className="min-w-0 flex-1">
        <RowHeader title={read.title} ts={row.ts} />
        {row.portfolio_name ? (
          <span className="text-xs text-muted-foreground">{row.portfolio_name}</span>
        ) : null}
        {read.summary ? (
          <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">{read.summary}</p>
        ) : null}
        <FactList facts={read.facts} />
        <DetailList lines={read.detail} />
      </div>
    </li>
  );
}

export function OptimizerLogs({ brandId }: OptimizerLogsProps) {
  const logsQuery = useOptimizerLogs(brandId);
  const [portfolio, setPortfolio] = useState<string>(ALL_PORTFOLIOS);

  if (logsQuery.isLoading) return <FeedSkeleton />;

  // Before this branch existed, a failed read fell straight through to "No optimizer
  // activity yet" — the outage and the genuinely-quiet brand rendered identically.
  if (logsQuery.isError) {
    return (
      <OptimizerReadError
        error={logsQuery.error}
        onRetry={() => void logsQuery.refetch()}
        subject="the server log"
      />
    );
  }

  const logs = logsQuery.data;
  if (logs.length === 0) {
    return (
      <EmptyState
        headline="The optimizer has not run yet"
        media={<ScrollTextIcon aria-hidden="true" />}
        description="Cycle results, skips and failures appear here. Anything the optimizer changed on the ad account is in Actions."
      />
    );
  }

  const portfolioNames = distinctPortfolioNames(logs);
  // A previously-chosen portfolio can vanish after a refetch; fall back to "all"
  // so the feed never silently renders empty against a stale selection.
  const effectivePortfolio = portfolioNames.includes(portfolio) ? portfolio : ALL_PORTFOLIOS;
  const visible = filterByPortfolio(logs, effectivePortfolio);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <PortfolioFilter
          names={portfolioNames}
          value={effectivePortfolio}
          onChange={setPortfolio}
          label="Filter the server log by portfolio"
        />
      </div>
      {visible.length === 0 ? (
        <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
          No events for this portfolio in what has loaded.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => (
            <LifecycleLogRow key={row.id} row={row} />
          ))}
        </ul>
      )}
      <FeedFooter
        loaded={logs.length}
        hasMore={logsQuery.hasNextPage}
        isFetchingMore={logsQuery.isFetchingNextPage}
        onLoadMore={() => void logsQuery.fetchNextPage()}
        noun="events"
      />
    </div>
  );
}
