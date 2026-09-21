// Which way is the good way, for a paid metric's period-over-period change.
//
// THE RULE: colour carries JUDGEMENT, the sign and the arrow carry DIRECTION. The paid
// dashboards all hand-rolled the same `delta >= 0 ? green : red` test, which is exactly
// backwards for the cost family — a CPA or CPC that FELL is the good outcome and rendered
// red on every one of them.
//
// The polarity itself is not decided here: `fallsAreGood` in the Jaina reading module is the
// one definition in the app, deliberately narrow (the cost family only). This module just
// gives the paid dashboards a single place to ask, keyed on the metric's own name — the key
// (`cpa`) and the printed label (`CPA`) answer the same, so either may be passed.

import { fallsAreGood, judgeDelta } from '@/components/paid-media/jaina/reading';

/** True when a FALLING value is the good outcome for this metric (CPA, CPC, CPM…). */
export function paidMetricFallsAreGood(metric: string): boolean {
  return fallsAreGood(metric);
}

/**
 * Should this change be painted the good colour?
 *
 * A zero change counts as good, which is precisely what the `delta >= 0` sign test at these
 * call sites already did — the ONLY thing that changes is the polarity of the cost family.
 * Callers that want to render "no change" in a third, quiet colour should test for zero
 * themselves before asking.
 */
export function paidDeltaIsGood(metric: string, deltaPct: number): boolean {
  return judgeDelta({ change: deltaPct, goodWhenDown: paidMetricFallsAreGood(metric) }) !== 'risk';
}
