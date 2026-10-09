'use client';

// The "All" tab's optional MP3 block: the connected platforms compared as a plain table, one
// row each, with the same four figures in the same columns and a hairline between rows. A
// platform that spent nothing keeps its row, greyed. The cheapest is said in a sentence and
// marked "cheapest" in its row — never by colour. A viewer can hide it; the choice is kept in
// this browser (comparisonPreference.ts) and a hidden row leaves one line to bring it back.

import type { AccountPlatformMetrics } from '@continuum/contracts';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { figureProps, formatCurrency } from '../../format';
import * as typeScale from '../../typeScale';
import {
  capitalise,
  figureWindowOfMetrics,
  formatResults,
  kindWords,
  windowDaysLabel,
} from './accountPlatformMetricsModel';
import { readComparisonHidden, writeComparisonHidden } from './comparisonPreference';
import { platformColor } from './PlatformChip';
import {
  buildPlatformComparison,
  type ComparisonColumn,
  cheapestSentence,
  type PlatformComparison,
} from './platformComparisonModel';
import { PLATFORM_NAMES } from './platformTabsModel';

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

const NUMBER_CELL = 'py-2 pl-3 text-right font-mono tabular-nums';

/** A platform that spent nothing in the window: its row stays, greyed, so the absence reads. */
function idle(column: ComparisonColumn): boolean {
  return column.spend === 0 || (column.spend == null && column.results == null);
}

function Row({
  column,
  row,
  metrics,
}: {
  column: ComparisonColumn;
  row: PlatformComparison;
  metrics: AccountPlatformMetrics;
}) {
  const window = figureWindowOfMetrics(metrics);
  const key = (name: string) => `comparison.${column.platform}.${name}`;
  const muted = idle(column);
  return (
    <tr
      className={cn(
        'border-border/60 border-t',
        muted ? 'text-muted-foreground' : 'text-foreground',
      )}
      data-cheapest={column.cheapest ? 'true' : undefined}
      data-idle={muted ? 'true' : undefined}
      data-platform={column.platform}
      data-testid="comparison-column"
    >
      <th className="py-2 pr-3 text-left font-normal" scope="row">
        <span className="inline-flex flex-wrap items-center gap-x-2">
          <span
            aria-hidden="true"
            className={cn('size-2 shrink-0 rounded-full', platformColor(column.platform).dot)}
          />
          {PLATFORM_NAMES[column.platform]}
          {row.currency == null ? (
            <span className="text-muted-foreground text-xs" data-testid="comparison-currency">
              {column.currency ?? 'several currencies'}
            </span>
          ) : null}
          {column.cheapest ? (
            <span className="font-semibold text-xs" data-testid="comparison-cheapest">
              · cheapest
            </span>
          ) : null}
        </span>
      </th>
      <td
        className={NUMBER_CELL}
        {...figureProps(key('spend'), column.spend, column.currency, window)}
      >
        {column.spend == null ? 'not added up' : formatCurrency(column.spend, column.currency)}
      </td>
      <td
        className={NUMBER_CELL}
        {...figureProps(key('results'), column.results, null, window, 'count')}
      >
        {column.results == null ? '0' : formatResults(column.results)}
      </td>
      <td
        className={NUMBER_CELL}
        {...figureProps(key('cost'), column.costPerResult, column.currency, window)}
      >
        {column.costPerResult == null ? '—' : formatCurrency(column.costPerResult, column.currency)}
      </td>
      <td
        className={NUMBER_CELL}
        {...figureProps(key('share'), column.shareOfResults, null, window, 'percent')}
      >
        {column.shareOfResults == null ? '—' : pct(column.shareOfResults)}
      </td>
    </tr>
  );
}

function TotalsLine({
  row,
  metrics,
}: {
  row: PlatformComparison;
  metrics: AccountPlatformMetrics;
}) {
  const window = figureWindowOfMetrics(metrics);
  if (!row.totals) {
    return (
      <p className="text-muted-foreground text-xs" data-testid="comparison-no-totals">
        No totals: the platforms bill in different currencies.
      </p>
    );
  }
  const { totals } = row;
  const words = row.kind ? kindWords(row.kind) : null;
  return (
    <p className="text-muted-foreground text-xs" data-testid="comparison-totals">
      All platforms:{' '}
      <span
        className="tabular-nums"
        {...figureProps('comparison.total.spend', totals.spend, totals.currency, window)}
      >
        {formatCurrency(totals.spend, totals.currency)}
      </span>
      {words ? (
        <>
          {' · '}
          <span
            className="tabular-nums"
            {...figureProps('comparison.total.results', totals.results, null, window, 'count')}
          >
            {formatResults(totals.results)}
          </span>{' '}
          {words.many}
          {totals.costPerResult != null ? (
            <>
              {' · '}
              <span
                className="tabular-nums"
                {...figureProps(
                  'comparison.total.cost',
                  totals.costPerResult,
                  totals.currency,
                  window,
                )}
              >
                {formatCurrency(totals.costPerResult, totals.currency)}
              </span>{' '}
              per {words.one}
            </>
          ) : null}
        </>
      ) : null}
    </p>
  );
}

export function PlatformComparisonRow({ metrics }: { metrics: AccountPlatformMetrics }) {
  const [hidden, setHidden] = useState(false);
  // Read after mount: the server render has no storage, and the first paint must match it.
  useEffect(() => setHidden(readComparisonHidden()), []);
  const row = buildPlatformComparison(metrics);
  if (!row) return null;

  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    writeComparisonHidden(next);
  };
  const toggleButton = (
    <button
      aria-expanded={!hidden}
      className="text-primary text-xs hover:underline"
      data-testid="comparison-toggle"
      onClick={toggle}
      type="button"
    >
      {hidden ? 'Show platforms side by side' : 'Hide'}
    </button>
  );

  if (hidden) {
    return (
      <div className="px-1" data-testid="platform-comparison-hidden">
        {toggleButton}
      </div>
    );
  }
  const words = row.kind ? kindWords(row.kind) : null;
  return (
    <section
      aria-label="Platforms side by side"
      className="space-y-1.5 px-1"
      data-source="account-platform-metrics"
      data-testid="platform-comparison"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`${typeScale.label} font-semibold text-muted-foreground`}>
          Platforms side by side{words ? ` · ${words.many}` : ''}
        </p>
        {toggleButton}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] border-collapse text-sm">
          <thead>
            <tr className="text-muted-foreground text-xs">
              <th className="py-1.5 pr-3 text-left font-medium" scope="col">
                {words ? `${capitalise(words.many)} by platform` : 'Platform'}
              </th>
              <th className="py-1.5 pl-3 text-right font-medium" scope="col">
                Spend · {windowDaysLabel(metrics)}
              </th>
              <th className="py-1.5 pl-3 text-right font-medium" scope="col">
                {words ? capitalise(words.many) : 'Results'}
              </th>
              <th className="py-1.5 pl-3 text-right font-medium" scope="col">
                {words ? `Cost per ${words.one}` : 'Cost per result'}
              </th>
              <th className="py-1.5 pl-3 text-right font-medium" scope="col">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {row.columns.map((column) => (
              <Row column={column} key={column.platform} metrics={metrics} row={row} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-foreground text-xs" data-testid="comparison-sentence">
        {cheapestSentence(row)}
      </p>
      <TotalsLine metrics={metrics} row={row} />
    </section>
  );
}
