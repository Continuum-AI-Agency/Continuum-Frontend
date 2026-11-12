import type { useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
// The ad-set table's "vs target" column (P1, "Lectura continua"): a small inline bar of each
// ad set's cost against the portfolio's target, and the signed distance beside it. Only the
// portfolio detail mounts it, and only when a target exists — a bar against nothing is noise.
//
// The bar fills to the cost's share of the target, capped at a full track, so an ad set at
// half the target reads as half a bar and anything over it as a full one in the over-target
// tone. Colour is the verdict, never the magnitude: under or at target reads green, over red.

import type { OptimizationMetricDefinition } from '@continuum/contracts';
import type { InsightColumn } from '@/components/dashboard/datatable/InsightDataTable';
import { cn } from '@/lib/utils';
import { formatCpa } from '../../format';
import type { OptimizerAdsetRow } from '../../kpiColumns';

/** An ad set's cost against the target: its share of it and whether it sits over. */
export type VsTarget = { ratio: number; fill: number; over: boolean };

/** Null when there is no cost to compare, or no target to compare it with. */
export function vsTarget(cost: number | null, target: number | null): VsTarget | null {
  if (cost == null || !Number.isFinite(cost) || cost < 0) return null;
  if (target == null || !(target > 0)) return null;
  const ratio = cost / target;
  return { ratio, fill: Math.min(ratio, 1), over: ratio > 1 };
}

const percentFormatters = new Map<UiLocale, Intl.NumberFormat>();
const signedPercent = (ratio: number, locale: UiLocale = 'en'): string => {
  const delta = Math.round((ratio - 1) * 100);
  if (locale === 'en') return delta > 0 ? `+${delta}%` : `${delta}%`;
  let formatter = percentFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 0,
      signDisplay: 'exceptZero',
    });
    percentFormatters.set(locale, formatter);
  }
  return formatter.format((Object.is(delta, -0) ? 0 : delta) / 100);
};

export function vsTargetColumn(opts: {
  target: number;
  metric: OptimizationMetricDefinition;
  currency: string | null | undefined;
  locale?: UiLocale;
  translate?: ReturnType<typeof useTranslations<'scale'>>;
}, uiLocale:UiLocale='en'): InsightColumn<OptimizerAdsetRow> {
  const { target, metric, currency, locale = 'en', translate } = opts;
  return {
    id: 'vs-target',
    header: translate ? translate('vs_target_header') : 'vs target',
    align: 'right',
    sortValue: (row) => (row.freezeReason ? -1 : (vsTarget(row.cost, target)?.ratio ?? -1)),
    cell: (row) => {
      const read = row.freezeReason ? null : vsTarget(row.cost, target);
      if (!read) return <span className="text-muted-foreground">—</span>;
      return (
        <span
          className="inline-flex items-center justify-end gap-2"
          data-testid="vs-target"
          data-over={read.over}
          title={
            translate
              ? translate('vs_target_tooltip', {
                  metric: metric.costLabel,
                  cost: formatCpa(row.cost, currency, locale),
                  target: formatCpa(target, currency, locale),
                })
              : `${metric.costLabel} ${formatCpa(row.cost, currency, uiLocale)} against a ${formatCpa(target, currency, uiLocale)} target`
          }
        >
          <span
            className={cn('text-xs tabular-nums', read.over ? 'text-destructive' : 'text-success')}
          >
            {signedPercent(read.ratio, locale)}
          </span>
          <span aria-hidden className="relative h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <span
              className={cn(
                'absolute inset-y-0 left-0 rounded-full',
                read.over ? 'bg-destructive/60' : 'bg-success/60',
              )}
              style={{ width: `${(read.fill * 100).toFixed(1)}%` }}
            />
          </span>
        </span>
      );
    },
  };
}
