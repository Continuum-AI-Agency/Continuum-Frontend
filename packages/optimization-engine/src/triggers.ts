// ---------------------------------------------------------------------------
// Stage B — pause TRIGGERS. These never pause automatically: they produce
// recommendations (always needs user approval) and mark the ad set 'starved'
// so the solver drives its budget down to the floor in the meantime.
//   P1 — zero upper funnel (fast, 3d)
//   P2 — sustained poor vs a ROBUST reference (P25 of CPP_14d), 14d
//   P3 — low significance / dead weight (spent enough, ~zero results), 14d
// ---------------------------------------------------------------------------

import { formatMoney } from '@continuum/contracts';
import type { EngineConfig } from './config';
import { costPerEvent, kpiEvents, scoreAdSet, upperFunnelEvents } from './scoring';
import {
  action,
  currencyCode,
  entityOf,
  moneyPerResultUnit,
  multiple,
  resultNoun,
  resultNounPlural,
  title,
  titleMoney,
  upperFunnelNoun,
} from './title';
import type { AdSetSnapshot, Recommendation } from './types';
import { perDayOver } from './windows';

const isEvaluable = (s: AdSetSnapshot): boolean => s.status !== 'frozen' && s.status !== 'flagged';

/** Money, in the display units a headline is required to already be in. */
const round2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * What a pause is worth is the spend it STOPS.
 *
 * P1 and P3 are the same finding through two windows — spend with nothing to show for it —
 * and neither holds an efficiency percentage, because zero results has no cost per result.
 * Inventing one would mean inventing a denominator, so both lead with the money avoided,
 * in the same words `dead_tail` already leads with on the account read.
 */
const avoidedHeadline = (perDay: number): NonNullable<Recommendation['evidence']>['headline'] => ({
  kind: 'avoided',
  value: round2(perDay),
  unit: 'currency_per_day',
  label: 'a day buying nothing',
  from: null,
  to: null,
});

/** Lower-percentile ("robust best") of a sorted-ascending numeric array. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const v = [...values].sort((a, b) => a - b);
  const idx = Math.min(v.length - 1, Math.max(0, Math.round((p / 100) * (v.length - 1))));
  return v[idx];
}

export type TriggerOutput = {
  recommendations: Recommendation[];
  starveIds: Set<string>;
};

export function evaluateTriggers(snapshots: AdSetSnapshot[], cfg: EngineConfig): TriggerOutput {
  const recs: Recommendation[] = [];
  const starve = new Set<string>();
  const money = (v: number): string => formatMoney(v, cfg.currency);

  // Robust reference cost-per-event: P25 of cost/KPI over the 14d window for
  // evaluable items with data. KPI defaults to purchases (objective-aware).
  const cpp14s = snapshots
    .filter((s) => isEvaluable(s) && kpiEvents(s.windows.d14, cfg) > 0)
    .map((s) => costPerEvent(s.windows.d14, cfg));
  const robustBestCpp = percentile(cpp14s, 25);

  // Portfolio average upper-funnel cost (for P1's relative comparison): add-to-carts on a
  // purchase portfolio, link clicks on a conversations one, landing-page views on leads.
  const upperLabel = cfg.upperFunnelLabel ?? 'add-to-cart';
  const upperCosts = snapshots
    .filter((s) => isEvaluable(s) && (upperFunnelEvents(s.windows.d3, cfg) ?? 0) > 0)
    .map((s) => s.windows.d3.spend / (upperFunnelEvents(s.windows.d3, cfg) as number));
  const avgAtcCost = upperCosts.length
    ? upperCosts.reduce((a, b) => a + b, 0) / upperCosts.length
    : 0;

  const floor = Math.max((cfg.cpaTarget * cfg.floorMinSignals) / cfg.floorWindowDays, 0);

  for (const s of snapshots) {
    if (!isEvaluable(s)) continue;
    if (s.ageDays <= cfg.newItemProtectDays) continue; // grace blocks P1/P3
    const d3 = s.windows.d3;
    const d14 = s.windows.d14;
    const traj = scoreAdSet(s, cfg).trajectoryState;

    // P1 — zero upper funnel (fast). Skipped entirely on an objective whose KPI is the
    // top of the funnel (awareness): there is no step above impressions to go dark.
    const upper3d = upperFunnelEvents(d3, cfg);
    const atcCost3d = upper3d != null && upper3d > 0 ? d3.spend / upper3d : Infinity;
    const p1 =
      upper3d != null &&
      d3.spend > floor &&
      kpiEvents(d3, cfg) === 0 &&
      (upper3d === 0 || (avgAtcCost > 0 && atcCost3d > cfg.upperFunnelOverrideMult * avgAtcCost));
    if (p1) {
      // P1 fires on two disjoint conditions; say which one actually happened. The reason is
      // the sole grounding source for the AI insight tooltip, so every figure in it must be
      // real — a placeholder like "null" reads as a number that was never measured.
      // Purchases keep the established word; every other objective names its own KPI.
      const kpiLabel = !cfg.kpiField || cfg.kpiField === 'purchases' ? 'conversions' : cfg.kpiField;
      // No article before the substituted label: "an landing-page view cost" shipped once,
      // because the article was fixed while the label was not. "paying X per <label>" needs
      // none, whatever the objective names its upper-funnel event.
      const reason =
        upper3d === 0
          ? `Spent ${money(d3.spend)} over 3d with 0 ${kpiLabel} and 0 ${upperLabel}s.`
          : `Spent ${money(d3.spend)} over 3d with 0 ${kpiLabel}, paying ${money(atcCost3d)} per ${upperLabel} — over ${cfg.upperFunnelOverrideMult}× the portfolio average of ${money(avgAtcCost)}.`;
      recs.push({
        adSetId: s.id,
        kind: 'pause',
        trigger: 'P1_zero_upper_funnel',
        severity: 'high',
        reason,
        evidence: {
          metric: 'spend',
          value: d3.spend,
          comparator:
            upper3d === 0
              ? `with 0 ${kpiLabel} and 0 ${upperLabel}s`
              : `with 0 ${kpiLabel}, ${upperLabel} cost ${money(atcCost3d)} vs ${money(avgAtcCost)} avg`,
          threshold: floor,
          window: 'd3',
          estImpactPerDay: perDayOver(d3.spend, 'd3'),
          headline: avoidedHeadline(perDayOver(d3.spend, 'd3')),
          // The spend is the figure; the comparison is what it bought — nothing — and, on
          // the second branch, the upper-funnel price against the portfolio's own average.
          title: title({
            entity: entityOf(s),
            figure: d3.spend,
            unit: currencyCode(cfg),
            comparator:
              upper3d === 0
                ? `en 3 días con 0 ${resultNounPlural(cfg, s)} y 0 ${upperFunnelNoun(upperLabel, 0)}`
                : `en 3 días con 0 ${resultNounPlural(cfg, s)}, ${titleMoney(atcCost3d, cfg)} por ${upperFunnelNoun(upperLabel, 1)} frente a ${titleMoney(avgAtcCost, cfg)} de promedio (${multiple(atcCost3d, avgAtcCost)})`,
            window: 'd3',
          }),
          action: action('pause', cfg, { perDay: perDayOver(d3.spend, 'd3') }),
          source: 'engine',
        },
        needsApproval: true,
      });
      starve.add(s.id);
      continue;
    }

    // P2 — sustained poor vs robust reference (skip if recovering)
    if (kpiEvents(d14, cfg) > 0 && robustBestCpp > 0 && traj !== 'positive') {
      const cpp14 = costPerEvent(d14, cfg);
      if (cpp14 > cfg.sustainedPoorMultiplier * robustBestCpp) {
        recs.push({
          adSetId: s.id,
          kind: 'pause',
          trigger: 'P2_sustained_poor',
          severity: 'medium',
          reason: `CPP 14d ${money(cpp14)} > ${cfg.sustainedPoorMultiplier}× the robust reference (${money(robustBestCpp)}), with no recent improvement.`,
          evidence: {
            metric: 'cpp',
            value: cpp14,
            comparator: `vs ${cfg.sustainedPoorMultiplier}× the robust reference (${money(robustBestCpp)})`,
            threshold: cfg.sustainedPoorMultiplier * robustBestCpp,
            window: 'd14',
            estImpactPerDay: perDayOver(d14.spend, 'd14'),
            // The price gap IS the finding; the money is what acting on it is worth. Both
            // sides are priced and held, so the headline reaches for nothing it was not
            // given. Direction lives in the label, never in a minus sign, and `from → to`
            // reads where this ad set is against where the account's own best already sits.
            headline: {
              kind: 'efficiency',
              value: Math.round((cpp14 / robustBestCpp - 1) * 100),
              unit: 'percent',
              label: 'more per result than best',
              from: round2(cpp14),
              to: round2(robustBestCpp),
            },
            // "101 MXN por lead, 2.9× la referencia de 35 MXN": the cost per result is the
            // figure, and the reference it crossed is the comparison. No verb — the pause
            // and what it saves are the button's.
            title: title({
              entity: entityOf(s),
              figure: cpp14,
              unit: moneyPerResultUnit(cfg, s),
              comparator: `${multiple(cpp14, robustBestCpp)} la referencia de ${titleMoney(robustBestCpp, cfg)}`,
              window: 'd14',
            }),
            action: action('pause', cfg, { perDay: perDayOver(d14.spend, 'd14') }),
            source: 'engine',
          },
          needsApproval: true,
        });
        starve.add(s.id);
        continue;
      }
    }

    // P3 — low significance / dead weight (spent enough, ~zero results)
    if (
      kpiEvents(d14, cfg) === 0 &&
      kpiEvents(s.windows.d7, cfg) === 0 &&
      d14.spend > cfg.cpaTarget
    ) {
      recs.push({
        adSetId: s.id,
        kind: 'pause',
        trigger: 'P3_low_significance',
        severity: 'low',
        reason: `Spent ${money(d14.spend)} over 14d (> 1 target CPA) with 0 conversions: dead weight.`,
        evidence: {
          metric: 'spend',
          value: d14.spend,
          comparator: 'with 0 conversions in 7d and 14d',
          threshold: cfg.cpaTarget,
          window: 'd14',
          estImpactPerDay: perDayOver(d14.spend, 'd14'),
          headline: avoidedHeadline(perDayOver(d14.spend, 'd14')),
          // "298 MXN en 14 días y 0 leads": the spend, the window, and the nothing it bought,
          // with the target it exceeded so the reader knows why 14 days was enough.
          title: title({
            entity: entityOf(s),
            figure: d14.spend,
            unit: currencyCode(cfg),
            comparator: `en 14 días y 0 ${resultNounPlural(cfg, s)}, más que el objetivo de ${titleMoney(cfg.cpaTarget, cfg)} por ${resultNoun(cfg, s)}`,
            window: 'd14',
          }),
          action: action('pause', cfg, { perDay: perDayOver(d14.spend, 'd14') }),
          source: 'engine',
        },
        needsApproval: true,
      });
      starve.add(s.id);
    }
  }

  return { recommendations: recs, starveIds: starve };
}
