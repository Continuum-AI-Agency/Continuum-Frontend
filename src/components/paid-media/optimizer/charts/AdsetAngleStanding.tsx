'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { UiLocale } from '@/i18n/config';

// One executable row per ad set: what angle its next creative should run, and why. Rendered
// in a portfolio's detail and, across the whole ad account, in Creative Insights.
//
// Replaces the Audience × angle heat map. That panel pivoted on `audience_type`, which no
// production code path writes, so it always collapsed to a single "unknown" row crossed with
// a spend-weighted mode of each ad set's angles. It looked like an analysis and could not be
// one. The audience is not a free variable anyway — it is fixed by the ad set's targeting.
//
// The rows are sorted so the work comes first (double down / rebuild / introduce) and the
// un-analyzable ad sets sit at the bottom, visible rather than dropped: "we have not measured
// this yet" and "nothing here works" are different states, and hiding the first would make
// the panel read as a shorter list of healthy ad sets.
//
// Each row reads left to right: the ad set, the angle it runs now, an arrow, the angle to run
// next (coloured by the call), and the one-sentence action. Hairlines between rows, no boxes.

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatCpa } from '../format';
import { type AdsetAngleRow, type AngleVerdict, angleName, sortAngleRows } from './angleStanding';
import { ChartEmpty } from './ChartStates';

type AdsetAngleStandingProps = {
  rows: AdsetAngleRow[];
  currency?: string | null;
  /** Shown when there are no rows; defaults to the portfolio wording. */
  emptyMessage?: string;
};

function pct(value: number, locale: UiLocale): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    Math.round(value * 100) / 100,
  );
}

function AngleRow({ row, currency }: { row: AdsetAngleRow; currency?: string | null }) {
  const uiText = useTranslations('scale');
  const VERDICT_META: Record<AngleVerdict, { label: string; tone: string }> = useMemo(
    () => ({
      double_down: {
        label: uiText('double_down_5c8d3be'),
        tone: 'text-emerald-600 dark:text-emerald-400',
      },
      rebuild_craft: {
        label: uiText('rebuild_the_craft_bdb1ce4'),
        tone: 'text-amber-600 dark:text-amber-400',
      },
      introduce: { label: uiText('introduce_317dca7'), tone: 'text-primary-ink' },
      insufficient: { label: uiText('needs_a_variant_959b82a'), tone: 'text-muted-foreground' },
    }),
    [uiText],
  );

  const uiLocale = useLocale();
  const meta = VERDICT_META[row.verdict];
  const recommended = row.recommendedAngle;
  const current = row.currentAngle;

  return (
    <div
      className="grid grid-cols-1 gap-x-3 gap-y-1 border-border/60 border-t py-2.5 @2xl/angles:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_1rem_minmax(0,1fr)_minmax(0,1.6fr)] @2xl/angles:items-baseline"
      data-testid="adset-angle-row"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="min-w-0 truncate font-semibold text-foreground text-xs">
              {row.adsetName}
            </span>
          }
        />
        <TooltipContent className="max-w-xs">
          <span className="font-mono text-xs">{row.adsetId}</span>
        </TooltipContent>
      </Tooltip>
      <span className="min-w-0 truncate text-muted-foreground text-xs">
        {uiText.rich('sentence_3e8033217eea', {
          v0: current ? angleName(current.value, uiText) : uiText('no_labelled_ads_b88e2be'),
        })}
      </span>
      <span
        aria-hidden="true"
        className="hidden text-center text-muted-foreground/60 @2xl/angles:block"
      >
        →
      </span>
      <span className={cn('min-w-0 truncate font-semibold text-xs', meta.tone)}>
        {recommended ? (
          <>
            <span className="sr-only">{meta.label}: </span>
            {angleName(recommended.value, uiText)}
          </>
        ) : (
          meta.label
        )}
        {row.confidence === 'thin' ? (
          <span className="ml-1.5 font-normal text-xs text-muted-foreground">
            {uiText('thin_1a0dc22')}
          </span>
        ) : null}
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-foreground/80 text-xs">{row.action}</p>
        {recommended ? (
          <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
            <span>
              {uiText.rich('sentence_785aeeb6eeb6', {
                v0: pct(recommended.winRate, uiLocale),
                v1: recommended.eligibleAds,
              })}
            </span>
            {recommended.spendShare != null ? (
              <span>
                {uiText.rich('sentence_6eb570fe6c34', {
                  v0: pct(recommended.spendShare, uiLocale),
                })}
              </span>
            ) : null}
            {row.adsetMedianCpa != null ? (
              <span>
                {uiText.rich('sentence_137f8f12324c', {
                  v0: formatCpa(row.adsetMedianCpa, currency, uiLocale),
                  v1: row.kpi,
                })}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function AdsetAngleStanding({ rows, currency, emptyMessage }: AdsetAngleStandingProps) {
  const uiText = useTranslations('scale');
  if (rows.length === 0) {
    return <ChartEmpty message={emptyMessage ?? uiText('angleStandingEmpty')} />;
  }

  const sorted = sortAngleRows(rows);
  const actionable = sorted.filter((row) => row.verdict !== 'insufficient');
  // Ad sets without enough compared ads all say the same sentence; listing each one buried the
  // few rows with a call under dozens of identical ones, so they fold into one line.
  const thin = sorted.filter((row) => row.verdict === 'insufficient');

  return (
    <div className="@container/angles space-y-2">
      <p className="text-muted-foreground text-xs">
        {actionable.length > 0
          ? uiText('template_83581d7dccff', { count: actionable.length, total: sorted.length })
          : uiText('no_ad_set_has_enough_compared_ads_yet_ship_a__31fe2ae')}
      </p>
      {actionable.length > 0 ? (
        <div className="flex flex-col">
          {actionable.map((row) => (
            <AngleRow currency={currency} key={row.adsetId} row={row} />
          ))}
        </div>
      ) : null}
      {thin.length > 0 ? (
        <details className="group text-xs" data-testid="angle-standing-thin">
          <summary className="hit-area cursor-pointer list-none text-muted-foreground hover:text-foreground">
            {uiText.rich('sentence_cf200269e62e', {
              count: thin.length,
              show: () => <span className="group-open:hidden">{uiText('show_80c1e60')}</span>,
              hide: () => (
                <span className="hidden group-open:inline">{uiText('hide_bda1fdc')}</span>
              ),
            })}
          </summary>
          <div className="mt-1 flex flex-col">
            {thin.map((row) => (
              <AngleRow currency={currency} key={row.adsetId} row={row} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
