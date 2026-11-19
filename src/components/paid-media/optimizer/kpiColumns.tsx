'use client';
import type { useTranslations as TranslationHook } from 'next-intl';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { createOptimizerDisplayTranslate } from '@/lib/paid-media/optimizerTranslator';

// KPI-adaptive columns for the optimizer's ad-set data tables. The whole point is
// that a portfolio optimizing for LEADS reads "Leads / CPL", one optimizing for
// AWARENESS reads "Impressions / CPM" (×1000, never cost-per-one-impression), and
// one optimizing for CONVERSATIONS reads "Cost per conversation" — all from the
// SAME row shape, driven purely by getOptimizationMetricDefinition(objective). A
// "cost per conversation" rendered as "CPA" is how a $39 messaging thread reads as
// a $256 failed lead, so the label is load-bearing, not decoration.
//
// The cost column ABSORBS the old CpaConfidenceBar: the Poisson 95% CI rides
// inline under the number as a bar on a shared scale (wider = fewer events =
// noisier), with a plain-language tooltip ("CPL $28 (likely $22–$40) from 12
// leads"). Held ad sets render a labeled HeldPill instead of a $0.00 cost, because
// a held ad set was abstained from — a zero would lie about the signal.
//
// OptimizerAdsetRow is the one view-model every optimizer table renders; the three
// adapters (itemToRow / snapshotToRow / flowToRow) narrow the different wire shapes
// (cycle_items, account snapshots, reallocation items) into it once.

import type {
  AdSetSnapshot,
  CycleItemRow,
  OptimizationMetricDefinition,
} from '@continuum/contracts';
import { createChartFormatters } from '@/components/charts/chart-formatters';
import type { InsightColumn } from '@/components/dashboard/datatable/InsightDataTable';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { UiLocale } from '@/i18n/config';
import { formatDecimal } from '@/lib/format/decimal';
import { resolveAdsetName } from './adsetName';
import { AdSetIdLabel } from './charts/AdSetIdLabel';
import { pct } from './charts/chartScale';
import { DeliveryPill } from './DeliveryPill';
import { type EntityNounSource, entityOf } from './entityNoun';
import {
  currencyColumnSuffix,
  deriveEfficiency,
  formatCpa,
  formatCurrencyInColumn,
} from './format';
import { HeldPill } from './HeldPill';
import { freezeLabel, measuredCpa, upperBoundNote } from './reportModel';

const DASH = '—';

/** The unified ad-set row every optimizer table renders. Every field past
 *  adsetId/name is optional so a thin wire shape (cycle_items has no spend) reads
 *  "—" honestly rather than inventing a number. */
export type OptimizerAdsetRow = {
  adsetId: string;
  name: string | null;
  /** Spend behind `results`, in major units (from the joined snapshot window). */
  spend: number | null;
  /** Objective-result count (the KPI events for this objective). */
  results: number | null;
  /** Objective cost in DISPLAY units (deriveEfficiency already applied). */
  cost: number | null;
  /** Raw Poisson CI from cycle_items diagnostics — the cost cell scales it. */
  ci: {
    cpa?: number | null;
    lo?: number | null;
    hi?: number | null;
    events?: number | null;
  } | null;
  /** Freeze reason → a labeled Held state instead of a cost. */
  freezeReason?: string | null;
  /** Platform and level of a cycle item; null on Meta-era rows. Names the held entity. */
  entity?: EntityNounSource | null;
  /** Was it being SERVED (serving | throttled | dark)? Null ⇒ not read this cycle, which
   *  renders no chip — the row must not claim delivery it never measured. */
  deliveryState?: string | null;
  currentBudget?: number | null;
  proposedBudget?: number | null;
  changeAbs?: number | null;
  changePct?: number | null;
  /** Ad-level ROAS — display-only, present only where per-ad purchase data joins. */
  roas?: number | null;
  applyStatus?: string | null;
};

function numericField(
  window: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  if (!window) return null;
  const raw = window[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function rowFromItem(
  item: CycleItemRow,
  metric: OptimizationMetricDefinition | null,
  snapshot: AdSetSnapshot | null | undefined,
  nameById: Map<string, string> | null | undefined,
): OptimizerAdsetRow {
  const ci = item.diagnostics?.ci ?? null;
  const window = snapshot?.windows?.d7 as Record<string, unknown> | undefined;
  const spend = window ? numericField(window, 'spend') : null;
  const results = metric && window ? numericField(window, metric.kpiField) : null;
  const measured = measuredCpa(ci);
  const costFromCi = metric && measured != null ? measured * metric.denominatorMultiplier : null;
  const costFromWindow =
    metric && spend != null && results != null
      ? deriveEfficiency(spend, results, metric.denominatorMultiplier)
      : null;
  return {
    adsetId: item.adset_id,
    name: resolveAdsetName(item, nameById),
    spend,
    results,
    cost: costFromCi ?? costFromWindow,
    ci,
    freezeReason: item.diagnostics?.freezeReason ?? null,
    entity: entityOf(item),
    deliveryState: item.diagnostics?.delivery?.state ?? null,
    currentBudget: item.current_budget,
    proposedBudget: item.final_budget,
    changeAbs: item.change_abs,
    changePct: item.change_pct,
    applyStatus: item.apply_status ?? null,
  };
}

/** cycle_items row (+ optional snapshot join) → the KPI table view-model. */
export function itemToRow(
  item: CycleItemRow,
  opts: {
    metric: OptimizationMetricDefinition;
    snapshot?: AdSetSnapshot | null;
    nameById?: Map<string, string> | null;
  },
): OptimizerAdsetRow {
  return rowFromItem(item, opts.metric, opts.snapshot, opts.nameById);
}

/** An account AdSetSnapshot → the view-model (pre-creation preview). Uses the
 *  14-day window by default (what the preview has always shown). */
export function snapshotToRow(
  snapshot: AdSetSnapshot,
  opts: {
    metric: OptimizationMetricDefinition;
    nameById?: Map<string, string> | null;
    window?: 'd7' | 'd14';
  },
): OptimizerAdsetRow {
  const { metric, nameById, window = 'd14' } = opts;
  const w = snapshot.windows?.[window] as Record<string, unknown> | undefined;
  const spend = w ? numericField(w, 'spend') : null;
  const results = w ? numericField(w, metric.kpiField) : null;
  return {
    adsetId: snapshot.id,
    name: resolveAdsetName({ adset_id: snapshot.id, adset_name: snapshot.name ?? null }, nameById),
    spend,
    results,
    cost:
      spend != null && results != null
        ? deriveEfficiency(spend, results, metric.denominatorMultiplier)
        : null,
    ci: null,
    freezeReason: snapshot.freezeReason ?? null,
    currentBudget: snapshot.currentBudget,
  };
}

/** Reallocation item → the view-model. metric/snapshot are optional — without them
 *  the cost/results read "—" rather than inventing a number. */
export function flowToRow(
  item: CycleItemRow,
  opts: {
    metric?: OptimizationMetricDefinition | null;
    snapshot?: AdSetSnapshot | null;
    nameById?: Map<string, string> | null;
  } = {},
): OptimizerAdsetRow {
  return rowFromItem(item, opts.metric ?? null, opts.snapshot, opts.nameById);
}

/** The name column — the single AdSetIdLabel chokepoint. */
export function nameColumn(
  translate?: ReturnType<typeof TranslationHook<'scale'>>,
): InsightColumn<OptimizerAdsetRow> {
  return {
    id: 'name',
    header: translate ? translate('optimizer_entityAdSet') : 'Ad set',
    align: 'left',
    sortValue: (row) => (row.name ?? row.adsetId).toLowerCase(),
    cell: (row) => (
      <span className="flex w-full min-w-0 items-center gap-1.5">
        <AdSetIdLabel
          className="min-w-0 max-w-[16rem]"
          id={row.adsetId}
          name={row.name ?? undefined}
        />
        <DeliveryPill state={row.deliveryState} />
      </span>
    ),
  };
}

function resultsColumn(
  metric: OptimizationMetricDefinition,
  locale: UiLocale = 'en',
): InsightColumn<OptimizerAdsetRow> {
  const { intFmt } = createChartFormatters(locale);
  return {
    id: 'results',
    header: metric.resultLabel,
    align: 'right',
    sortValue: (row) => row.results ?? -1,
    cell: (row) => (row.results != null ? intFmt(row.results) : DASH),
  };
}

function costColumn(
  metric: OptimizationMetricDefinition,
  currency: string | null | undefined,
  maxCiCost: number,
): InsightColumn<OptimizerAdsetRow> {
  return {
    id: 'cost',
    // M1: the code once in the header ("CPL · MXN"), the cells "$99.57".
    header: `${metric.costLabel}${currencyColumnSuffix(currency)}`,
    align: 'right',
    // Held rows carry no cost — sink them below every scored one on a desc sort.
    sortValue: (row) => (row.freezeReason ? -1 : (row.cost ?? -1)),
    cell: (row) => <CostCell currency={currency} maxCiCost={maxCiCost} metric={metric} row={row} />,
  };
}

function roasColumn(locale: UiLocale = 'en'): InsightColumn<OptimizerAdsetRow> {
  return {
    id: 'roas',
    header: 'ROAS',
    align: 'right',
    sortValue: (row) => row.roas ?? -1,
    cell: (row) => (row.roas != null ? `${formatDecimal(row.roas, 2, locale)}×` : DASH),
  };
}

/** KPI-adaptive columns for the cost-per-ad-set table. `include.roas` adds the
 *  display-only ROAS column (populated only where per-ad purchase data joins). */
export function kpiColumns(opts: {
  metric: OptimizationMetricDefinition;
  currency?: string | null;
  include?: { roas?: boolean };
  locale?: UiLocale;
  translate?: ReturnType<typeof TranslationHook<'scale'>>;
  /** The widest CI upper bound across the row set (display units) — the shared
   *  scale every cost bar is drawn against so the noisiest row is not amputated. */
  maxCiCost?: number;
}): InsightColumn<OptimizerAdsetRow>[] {
  const { metric, currency, include, maxCiCost = 1, locale = 'en' } = opts;
  const columns: InsightColumn<OptimizerAdsetRow>[] = [
    nameColumn(opts.translate),
    resultsColumn(metric, locale),
    costColumn(metric, currency, maxCiCost),
  ];
  if (include?.roas) columns.push(roasColumn(locale));
  return columns;
}

/** The one-line legend that labels the cost column's CI scale for a table. */
export function costCiLegend(
  metric: OptimizationMetricDefinition,
  translate?: ReturnType<typeof TranslationHook<'scale'>>,
): string {
  if (translate) return translate('cost_ci_legend', { metric: metric.costLabel });
  return `${metric.costLabel} · 95% CI — wider bar = fewer events`;
}

function CostCell({
  row,
  metric,
  currency,
  maxCiCost,
}: {
  row: OptimizerAdsetRow;
  metric: OptimizationMetricDefinition;
  currency?: string | null;
  maxCiCost: number;
}) {
  const uiText = useTranslations('scale');

  const uiLocale = useLocale();
  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  if (row.freezeReason) {
    const held = freezeLabel(row.freezeReason, row.entity, optimizerText);
    return (
      <span className="inline-flex items-center justify-end">
        {held ? (
          <HeldPill reason={row.freezeReason} entity={row.entity} />
        ) : (
          <span className="text-muted-foreground">{DASH}</span>
        )}
      </span>
    );
  }

  const mult = metric.denominatorMultiplier;
  const cost = row.cost;
  const ci = row.ci;
  const lo = ci?.lo != null ? ci.lo * mult : null;
  const hi = ci?.hi != null ? ci.hi * mult : null;
  const events = ci?.events ?? null;
  const hasInterval = lo != null && hi != null && hi >= lo;

  const unboundedNote = upperBoundNote(ci, optimizerText);
  if (cost == null && !hasInterval) {
    return unboundedNote ? (
      <span className="text-xs text-muted-foreground">{unboundedNote}</span>
    ) : (
      <span className="text-muted-foreground">{DASH}</span>
    );
  }

  const left = hasInterval ? pct(lo as number, maxCiCost) : 0;
  const width = hasInterval
    ? Math.max(1, pct(hi as number, maxCiCost) - pct(lo as number, maxCiCost))
    : 0;
  const markerLeft = cost != null ? pct(cost, maxCiCost) : 0;

  const plain = hasInterval
    ? uiText('cost_interval_detail', {
        metric: metric.costLabel,
        cost: formatCpa(cost, currency, uiLocale),
        low: formatCpa(lo, currency, uiLocale),
        high: formatCpa(hi, currency, uiLocale),
        hasEvents: events != null ? 'yes' : 'no',
        events: events ?? 0,
        results: metric.resultLabel.toLowerCase(),
      })
    : uiText('cost_no_interval_detail', {
        metric: metric.costLabel,
        cost: formatCpa(cost, currency, uiLocale),
        hasNote: unboundedNote ? 'yes' : 'no',
        note: unboundedNote ?? '',
      });

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex flex-col items-end gap-0.5">
            <span className="tabular-nums">{formatCurrencyInColumn(cost, currency, uiLocale)}</span>
            {hasInterval ? (
              <span
                aria-hidden="true"
                className="relative block h-1 w-20 overflow-visible rounded-full bg-muted/50"
              >
                <span
                  className="absolute top-0 h-1 rounded-full bg-border"
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
                <span
                  className="absolute -top-0.5 h-2 w-0.5 rounded-full bg-primary"
                  style={{ left: `${markerLeft}%` }}
                />
              </span>
            ) : null}
          </span>
        }
      />
      <TooltipContent className="max-w-xs">
        <p className="text-xs">{plain}</p>
      </TooltipContent>
    </Tooltip>
  );
}
