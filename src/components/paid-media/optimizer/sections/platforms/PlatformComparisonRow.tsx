'use client';

// The "All" tab's optional MP3 block: the connected platforms side by side, one column each,
// with the same four figures in the same order. The cheapest is said in a sentence and marked
// "cheapest" in its column — never by colour. A viewer can hide it; the choice is kept in this
// browser (comparisonPreference.ts) and a hidden row leaves one line to bring it back.

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
import { PlatformChip } from './PlatformChip';
import {
  buildPlatformComparison,
  type ComparisonColumn,
  cheapestSentence,
  type PlatformComparison,
} from './platformComparisonModel';

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function Figure({
  label,
  text,
  figure,
}: {
  label: string;
  text: string;
  figure: ReturnType<typeof figureProps>;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-mono font-semibold text-sm tabular-nums" {...figure}>
        {text}
      </dd>
    </div>
  );
}

function Column({
  column,
  row,
  metrics,
}: {
  column: ComparisonColumn;
  row: PlatformComparison;
  metrics: AccountPlatformMetrics;
}) {
  const window = figureWindowOfMetrics(metrics);
  const words = row.kind ? kindWords(row.kind) : null;
  const key = (name: string) => `comparison.${column.platform}.${name}`;
  return (
    <div
      className="min-w-0 space-y-2 rounded-lg border border-border/70 bg-card px-3 py-2.5"
      data-cheapest={column.cheapest ? 'true' : undefined}
      data-platform={column.platform}
      data-testid="comparison-column"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <PlatformChip platform={column.platform} />
        <span className="text-muted-foreground text-xs" data-testid="comparison-currency">
          {column.currency ?? 'several currencies'}
        </span>
        {column.cheapest ? (
          <span className="font-semibold text-foreground text-xs" data-testid="comparison-cheapest">
            · cheapest
          </span>
        ) : null}
      </div>
      <dl className="space-y-1">
        <Figure
          figure={figureProps(key('spend'), column.spend, column.currency, window)}
          label={`Spend · ${windowDaysLabel(metrics)}`}
          text={
            column.spend == null ? 'not added up' : formatCurrency(column.spend, column.currency)
          }
        />
        <Figure
          figure={figureProps(key('results'), column.results, null, window, 'count')}
          label={words ? capitalise(words.many) : 'Results'}
          text={column.results == null ? 'none bought' : formatResults(column.results)}
        />
        <Figure
          figure={figureProps(key('cost'), column.costPerResult, column.currency, window)}
          label={words ? `Cost per ${words.one}` : 'Cost per result'}
          text={
            column.costPerResult == null
              ? '—'
              : formatCurrency(column.costPerResult, column.currency)
          }
        />
        <Figure
          figure={figureProps(key('share'), column.shareOfResults, null, window, 'percent')}
          label={words ? `Share of ${words.many}` : 'Share of results'}
          text={column.shareOfResults == null ? '—' : pct(column.shareOfResults)}
        />
      </dl>
    </div>
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
  return (
    <section
      aria-label="Platforms side by side"
      className="space-y-2"
      data-source="account-platform-metrics"
      data-testid="platform-comparison"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className={`${typeScale.label} font-semibold text-muted-foreground`}>
          Platforms side by side{row.kind ? ` · ${kindWords(row.kind).many}` : ''}
        </p>
        {toggleButton}
      </div>
      <p
        className={cn(typeScale.body, 'px-1 font-semibold text-foreground')}
        data-testid="comparison-sentence"
      >
        {cheapestSentence(row)}
      </p>
      <div
        className={cn(
          'grid grid-cols-1 gap-2',
          row.columns.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3',
        )}
      >
        {row.columns.map((column) => (
          <Column column={column} key={column.platform} metrics={metrics} row={row} />
        ))}
      </div>
      <div className="px-1">
        <TotalsLine metrics={metrics} row={row} />
      </div>
    </section>
  );
}
