'use client';

import { useLocale, useTranslations } from 'next-intl';

// The "All" tab's optional MP3 block: the connected platforms compared as a plain table, one
// row each, with the same four figures in the same columns and a hairline between rows. A
// platform that spent nothing keeps its row, greyed. The cheapest is said in a sentence and
// marked "cheapest" in its row — never by colour. A viewer can hide it; the choice is kept in
// this browser (comparisonPreference.ts) and a hidden row leaves one line to bring it back.

import type { AccountPlatformMetrics } from '@continuum/contracts';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  currencyColumnSuffix,
  figureProps,
  formatCurrency,
  formatCurrencyInColumn,
} from '../../format';
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

/** The model carries a share as a fraction (0.33); a figure node carries percent points
 *  (raw 33 reads "33%"), the convention every percent node on the surface follows. */
function sharePoints(share: number | null): number | null {
  return share == null ? null : share * 100;
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
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const window = figureWindowOfMetrics(metrics);
  const key = (name: string) => `comparison.${column.platform}.${name}`;
  const muted = idle(column);
  // One currency across the row: its code sits in the column headers and the cells print "$"
  // alone (M1). Several: each cell carries its own code.
  const codeIn = row.currency == null ? 'text' : 'header';
  const money = (value: number) =>
    codeIn === 'header'
      ? formatCurrencyInColumn(value, column.currency, uiLocale)
      : formatCurrency(value, column.currency, uiLocale);
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
              {column.currency ?? uiText('several_currencies_084d637')}
            </span>
          ) : null}
          {column.cheapest ? (
            <span className="font-semibold text-xs" data-testid="comparison-cheapest">
              {uiText('cheapest_637e3b2')}
            </span>
          ) : null}
        </span>
      </th>
      <td
        className={NUMBER_CELL}
        {...figureProps(key('spend'), column.spend, column.currency, window, 'currency', codeIn)}
      >
        {column.spend == null ? uiText('not_added_up_dc18bbe') : money(column.spend)}
      </td>
      <td
        className={NUMBER_CELL}
        {...figureProps(key('results'), column.results ?? 0, null, window, 'count')}
      >
        {column.results == null ? '0' : formatResults(column.results, uiLocale)}
      </td>
      <td
        className={NUMBER_CELL}
        {...figureProps(
          key('cost'),
          column.costPerResult,
          column.currency,
          window,
          'currency',
          codeIn,
        )}
      >
        {column.costPerResult == null ? '—' : money(column.costPerResult)}
      </td>
      <td
        className={NUMBER_CELL}
        data-share-of={row.shareOf ?? undefined}
        {...figureProps(key('share'), sharePoints(column.shareOfResults), null, window, 'percent')}
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
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const window = figureWindowOfMetrics(metrics);
  if (!row.totals) {
    return (
      <p className="text-muted-foreground text-xs" data-testid="comparison-no-totals">
        {uiText('no_totals_the_platforms_bill_in_different_cur_d2a8836')}
      </p>
    );
  }
  const { totals } = row;
  const words = row.kind ? kindWords(row.kind, uiText) : null;
  return (
    <p className="text-muted-foreground text-xs" data-testid="comparison-totals">
      {uiText.rich('sentence_55fefe237b4d', {
        v0: () => (
          <span
            className="tabular-nums"
            {...figureProps('comparison.total.spend', totals.spend, totals.currency, window)}
          >
            {formatCurrency(totals.spend, totals.currency, uiLocale)}
          </span>
        ),
        v1: () =>
          words ? (
            <>
              {' · '}
              <span
                className="tabular-nums"
                {...figureProps('comparison.total.results', totals.results, null, window, 'count')}
              >
                {formatResults(totals.results, uiLocale)}
              </span>{' '}
              {words.many}
              {totals.costPerResult != null ? (
                <>
                  {' '}
                  {uiText.rich('sentence_d1edcacfd9e4', {
                    v0: () => (
                      <span
                        className="tabular-nums"
                        {...figureProps(
                          'comparison.total.cost',
                          totals.costPerResult,
                          totals.currency,
                          window,
                        )}
                      >
                        {formatCurrency(totals.costPerResult, totals.currency, uiLocale)}
                      </span>
                    ),
                    v1: words.one,
                  })}
                </>
              ) : null}
            </>
          ) : null,
      })}
    </p>
  );
}

export function PlatformComparisonRow({ metrics }: { metrics: AccountPlatformMetrics }) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
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
      className="hit-area text-primary-ink text-xs hover:underline"
      data-testid="comparison-toggle"
      onClick={toggle}
      type="button"
    >
      {hidden ? uiText('show_platforms_side_by_side_86c3386') : uiText('hide_ac20a57')}
    </button>
  );

  if (hidden) {
    return (
      <div className="px-1" data-testid="platform-comparison-hidden">
        {toggleButton}
      </div>
    );
  }
  const words = row.kind ? kindWords(row.kind, uiText) : null;
  return (
    <section
      aria-label={uiText('platforms_side_by_side_4586d70')}
      className="space-y-1.5 px-1"
      data-source="account-platform-metrics"
      data-testid="platform-comparison"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`${typeScale.label} font-semibold text-muted-foreground`}>
          {uiText.rich('sentence_1ade3c5adece', { v0: words ? ` · ${words.many}` : '' })}
        </p>
        {toggleButton}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] border-collapse text-sm">
          <thead>
            <tr className="text-muted-foreground text-xs">
              <th className="py-1.5 pr-3 text-left font-medium" scope="col">
                {words
                  ? uiText('template_5915a7741a9d', { v0: capitalise(words.many) })
                  : uiText('platform_c78ffe1')}
              </th>
              <th className="py-1.5 pl-3 text-right font-medium" scope="col">
                {uiText.rich('sentence_2f5a7d94f66f', {
                  v0: windowDaysLabel(metrics, uiText),
                  v1: currencyColumnSuffix(row.currency),
                })}
              </th>
              <th className="py-1.5 pl-3 text-right font-medium" scope="col">
                {words ? capitalise(words.many) : uiText('results_219c4a6')}
              </th>
              <th className="py-1.5 pl-3 text-right font-medium" scope="col">
                {words
                  ? uiText('template_ced2e5c5acfe', { v0: words.one })
                  : uiText('cost_per_result_a664c01')}
                {currencyColumnSuffix(row.currency)}
              </th>
              <th className="py-1.5 pl-3 text-right font-medium" scope="col">
                {row.shareOf
                  ? uiText('template_dfebbaa0ddf9', { v0: kindWords(row.shareOf, uiText).many })
                  : uiText('share_29887a5')}
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
        {cheapestSentence(row, uiText, uiLocale)}
      </p>
      <TotalsLine metrics={metrics} row={row} />
    </section>
  );
}
