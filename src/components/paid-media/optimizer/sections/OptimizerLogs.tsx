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

import type { OptimizerFeedWindowDays, OptimizerLogRow } from '@continuum/contracts';
import { ScrollTextIcon } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/state/EmptyState';
import { cn } from '@/lib/utils';
import * as typeScale from '../typeScale';
import { useOptimizerLogs } from '../useOptimizerData';
import { FeedFooter, FeedSkeleton, PortfolioFilter } from './feedChrome';
import {
  FeedToolbar,
  groupByDay,
  QuietTextButton,
  TimelineDay,
  TimelineEntry,
  type TimelineTone,
} from './feedTimeline';
import {
  ALL_PORTFOLIOS,
  distinctPortfolioNames,
  filterByPortfolio,
  type LifecycleFact,
  readLifecycleRow,
} from './logFilters';
import { OptimizerReadError } from './OptimizerReadError';

type OptimizerLogsProps = {
  brandId: string;
  windowDays?: OptimizerFeedWindowDays;
  /** The host's filters (feed switch, window), drawn on the same line as the portfolio filter. */
  controls?: ReactNode;
};

// An error is red on the dot; a warning keeps a muted dot but names itself, so a skip or a
// drift is not mistaken for a quiet cycle. Info carries nothing extra.
const LEVEL_TONE: Record<OptimizerLogRow['level'], TimelineTone> = {
  info: 'neutral',
  warn: 'neutral',
  error: 'stopped',
};

function FactList({ facts }: { facts: LifecycleFact[] }) {
  if (facts.length === 0) return null;
  return (
    <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
      {facts.map((fact) => (
        <div key={fact.label} className="flex items-baseline gap-1">
          <dt className="text-xs text-muted-foreground">{fact.label}</dt>
          <dd className="font-mono text-xs font-semibold tabular-nums">{fact.value}</dd>
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
      <summary className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline">
        {lines.length} listed
      </summary>
      <ul className="mt-1 space-y-0.5">
        {lines.map((line) => (
          <li key={line} className="truncate font-mono text-xs text-muted-foreground">
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
    <TimelineEntry data-level={row.level} tone={LEVEL_TONE[row.level]} ts={row.ts}>
      <p className="text-sm leading-snug">
        <span className="font-semibold text-foreground">{read.title}</span>
        {row.level === 'warn' ? (
          <span className={`${typeScale.label} ml-2 font-semibold text-warning`}>warn</span>
        ) : null}
        {row.portfolio_name ? (
          <span className="text-muted-foreground text-xs"> · {row.portfolio_name}</span>
        ) : null}
      </p>
      {read.summary ? (
        <p
          className={cn(
            'mt-0.5 text-xs leading-relaxed',
            row.level === 'error' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {read.summary}
        </p>
      ) : null}
      <FactList facts={read.facts} />
      <DetailList lines={read.detail} />
    </TimelineEntry>
  );
}

export function OptimizerLogs({ brandId, windowDays = 7, controls }: OptimizerLogsProps) {
  const logsQuery = useOptimizerLogs(brandId, windowDays);
  const [portfolio, setPortfolio] = useState<string>(ALL_PORTFOLIOS);
  const [archiveRequested, setArchiveRequested] = useState(false);
  const archiveQuery = useOptimizerLogs(brandId, 30, {
    archive: true,
    enabled: archiveRequested,
  });

  useEffect(() => {
    setArchiveRequested(false);
  }, [windowDays]);

  if (logsQuery.isLoading) {
    return (
      <div className="space-y-3">
        <FeedToolbar controls={controls} />
        <FeedSkeleton />
      </div>
    );
  }

  // Before this branch existed, a failed read fell straight through to "No optimizer
  // activity yet" — the outage and the genuinely-quiet brand rendered identically.
  if (logsQuery.isError) {
    return (
      <div className="space-y-3">
        <FeedToolbar controls={controls} />
        <OptimizerReadError
          error={logsQuery.error}
          onRetry={() => void logsQuery.refetch()}
          subject="the server log"
        />
      </div>
    );
  }

  const logs = logsQuery.data;
  const archiveRows = archiveRequested ? archiveQuery.data : [];
  const nothingLoaded = logs.length === 0 && archiveRows.length === 0;
  const archiveExhaustedEmpty =
    archiveRequested &&
    !archiveQuery.isLoading &&
    !archiveQuery.isError &&
    archiveRows.length === 0;
  if (nothingLoaded && (windowDays !== 30 || archiveExhaustedEmpty)) {
    return (
      <div className="space-y-3">
        <FeedToolbar controls={controls} />
        <EmptyState
          headline="The optimizer has not run yet"
          media={<ScrollTextIcon aria-hidden="true" />}
          description="Cycle results, skips and failures appear here. Anything the optimizer changed on the ad account is in Actions."
        />
      </div>
    );
  }

  const combined = archiveRequested ? [...logs, ...archiveRows] : logs;
  const portfolioNames = distinctPortfolioNames(combined);
  // A previously-chosen portfolio can vanish after a refetch; fall back to "all"
  // so the feed never silently renders empty against a stale selection.
  const effectivePortfolio = portfolioNames.includes(portfolio) ? portfolio : ALL_PORTFOLIOS;
  const visible = filterByPortfolio(combined, effectivePortfolio);
  const showLoadOlder = windowDays === 30 && !logsQuery.hasNextPage && !archiveRequested;

  return (
    <div className="space-y-2">
      <FeedToolbar controls={controls}>
        <PortfolioFilter
          names={portfolioNames}
          value={effectivePortfolio}
          onChange={setPortfolio}
          label="Filter the server log by portfolio"
        />
      </FeedToolbar>
      {visible.length === 0 && combined.length > 0 ? (
        <p className="py-6 text-center text-muted-foreground text-xs">
          No events for this portfolio in what has loaded.
        </p>
      ) : visible.length === 0 ? null : (
        <div data-testid="server-log-timeline">
          {groupByDay(visible, (row) => row.ts).map((day) => (
            <TimelineDay key={day.label} label={day.label}>
              {day.items.map((row) => (
                <LifecycleLogRow key={`${row.id}-${row.ts}`} row={row} />
              ))}
            </TimelineDay>
          ))}
        </div>
      )}
      <FeedFooter
        loaded={combined.length}
        hasMore={logsQuery.hasNextPage || (archiveRequested && Boolean(archiveQuery.hasNextPage))}
        isFetchingMore={
          logsQuery.isFetchingNextPage ||
          (archiveRequested && Boolean(archiveQuery.isFetchingNextPage))
        }
        onLoadMore={() => {
          if (logsQuery.hasNextPage) {
            void logsQuery.fetchNextPage();
            return;
          }
          if (archiveRequested && archiveQuery.hasNextPage) {
            void archiveQuery.fetchNextPage();
          }
        }}
        noun="events"
      />
      {showLoadOlder ? (
        <div className="flex justify-end">
          <QuietTextButton onClick={() => setArchiveRequested(true)}>
            Load older history
          </QuietTextButton>
        </div>
      ) : null}
      {archiveRequested && archiveQuery.isError ? (
        <p className="text-xs text-destructive">
          Older history could not be loaded. The last 30 days are still available.
        </p>
      ) : null}
      {archiveRequested &&
      !archiveQuery.isLoading &&
      !archiveQuery.isError &&
      archiveRows.length === 0 &&
      !archiveQuery.hasNextPage ? (
        <p className="text-xs text-muted-foreground">No events older than 30 days.</p>
      ) : null}
    </div>
  );
}
