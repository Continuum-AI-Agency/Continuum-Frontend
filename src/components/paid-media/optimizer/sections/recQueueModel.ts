// The recommendation queue's pure reads: the one-line evidence behind a row, the money a row
// puts on the table, the "as of" line that says whether the queue is current, and the
// grouped summary that turns ten identical "Pause ad set · HIGH" rows into "5 ad sets ·
// sustained poor CPA · $1,240/day". No React, no fetch — all of it testable on fixtures.

import type { RecommendationEvidence, RecommendationRow } from '@continuum/contracts';
import { formatCurrency } from '../format';
import { recommendationLabel } from '../reportModel';

const WINDOW_LABEL: Record<string, string> = { d3: '3d', d7: '7d', d14: '14d' };

const METRIC_LABEL: Record<string, string> = {
  spend: 'Spend',
  cpp: 'Cost per result',
  cpa: 'Cost per result',
  ctr: 'CTR',
  frequency: 'Frequency',
  reach_expansion: 'Reach growth',
};

function formatMetricValue(metric: string, value: number, currency: string | null): string {
  switch (metric) {
    case 'spend':
    case 'cpp':
    case 'cpa':
      return formatCurrency(value, currency);
    case 'ctr':
      return `${(value * 100).toFixed(2)}%`;
    case 'reach_expansion':
      return `${value.toFixed(2)}×`;
    default:
      return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
}

/** "Cost per result $140 vs 2.5× the robust reference ($10) · 14d". Null when the row
 *  predates structured evidence — the prose reason still stands on its own then. */
export function evidenceLine(
  evidence: RecommendationEvidence | null | undefined,
  currency: string | null,
): string | null {
  if (!evidence) return null;
  const metric = METRIC_LABEL[evidence.metric] ?? evidence.metric;
  const value = formatMetricValue(evidence.metric, evidence.value, currency);
  const window = WINDOW_LABEL[evidence.window] ?? evidence.window;
  return `${metric} ${value} ${evidence.comparator} · ${window}`;
}

/** Daily money the recommendation puts on the table; 0 when unknown so sorts stay stable. */
export function impactPerDay(rec: Pick<RecommendationRow, 'evidence'>): number {
  const value = rec.evidence?.estImpactPerDay;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** "$120/day at stake" — null when the engine gave no sizing. */
export function impactLabel(
  rec: Pick<RecommendationRow, 'evidence'>,
  currency: string | null,
): string | null {
  const value = impactPerDay(rec);
  return value > 0 ? `${formatCurrency(value, currency)}/day at stake` : null;
}

export type QueueSummaryGroup = {
  kind: string;
  trigger: string;
  label: string;
  count: number;
  impactPerDay: number;
};

/** One line per (kind, trigger) across the pending rows, biggest money first. */
export function queueSummary(
  recs: ReadonlyArray<Pick<RecommendationRow, 'kind' | 'trigger' | 'evidence' | 'status'>>,
): QueueSummaryGroup[] {
  const groups = new Map<string, QueueSummaryGroup>();
  for (const rec of recs) {
    if (rec.status !== 'pending') continue;
    const key = `${rec.kind}|${rec.trigger}`;
    const group = groups.get(key) ?? {
      kind: rec.kind,
      trigger: rec.trigger,
      label: recommendationLabel(rec.kind).label,
      count: 0,
      impactPerDay: 0,
    };
    group.count += 1;
    group.impactPerDay += impactPerDay(rec);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.impactPerDay - a.impactPerDay || b.count - a.count);
}

/** The trigger id in words: 'P2_sustained_poor' → 'sustained poor'. The prefix is engine
 *  vocabulary the reader does not need; the words after it are the reason in two words. */
export function triggerWords(trigger: string): string {
  const stripped = trigger.replace(/^[A-Z]\d+_/, '').replace(/^rule:/, 'rule ');
  return stripped.replace(/_/g, ' ');
}

const AS_OF_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "As of Sep 17, 6:10 AM · next cycle Sep 20, 6:00 AM". Null with no scored cycle yet. */
export function asOfLine(latestCycleTs: string | null, nextCycleTs: string | null): string | null {
  const at = latestCycleTs ? Date.parse(latestCycleTs) : Number.NaN;
  if (Number.isNaN(at)) return null;
  const parts = [`As of ${AS_OF_FMT.format(new Date(at))}`];
  const next = nextCycleTs ? Date.parse(nextCycleTs) : Number.NaN;
  if (!Number.isNaN(next)) parts.push(`next cycle ${AS_OF_FMT.format(new Date(next))}`);
  return parts.join(' · ');
}
