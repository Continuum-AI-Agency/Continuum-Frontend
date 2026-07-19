'use client';

// Why a cycle produced no recommendations, said plainly. A zero-rec cycle is a
// legitimate outcome (frozen kpi_mismatch ad sets, a too-young account, no tracked
// events) — this card names the cause off the same snapshots the engine scores,
// so the operator gets a diagnosis instead of an unexplained empty state.

import type { AdSetSnapshot, OptimizationObjective } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  HISTORY_CONFIDENT_DAYS,
  type SignalReadiness,
  type SignalVerdict,
  signalReadiness,
} from '../preview/signalReadiness';
import { OptimizerPanel } from './OptimizerPanel';

type Tone = 'success' | 'warning';

const VERDICT_TONE: Record<SignalVerdict, Tone> = {
  ready: 'success',
  thin_history: 'warning',
  currency_mismatch: 'warning',
  no_signal: 'warning',
  no_optimizable_budget: 'warning',
};

const VERDICT_LABEL: Record<SignalVerdict, string> = {
  ready: 'ready',
  thin_history: 'thin history',
  currency_mismatch: 'currency mismatch',
  no_signal: 'no signal',
  no_optimizable_budget: 'nothing movable',
};

function verdictMessage(readiness: SignalReadiness, kpiLabel: string): string {
  const { declaredMatching, declaredMismatched, daysOfHistory, unmovable } = readiness;
  const total = declaredMatching + declaredMismatched + readiness.undeclared;

  switch (readiness.verdict) {
    case 'no_optimizable_budget':
      return `${unmovable} of ${total} ad sets have no daily budget of their own — their spend is set at the campaign level (Advantage Campaign Budget) or across a whole flight. The optimizer can score them but cannot move their budget. Convert a campaign to ad-set budgets to make them optimizable.`;
    case 'currency_mismatch':
      return `${declaredMismatched} of ${total} ad sets optimize for a different result than ${kpiLabel} — those are frozen (currency mismatch) and can't be scored on this objective. Match the objective to what they buy, or optimize them separately.`;
    case 'no_signal':
      return `No tracked ${kpiLabel} in the last ${HISTORY_CONFIDENT_DAYS} days, so there's nothing to score yet. Check conversion tracking, or give recent launches time to convert.`;
    case 'thin_history':
      return `Scoring on ${kpiLabel} · ${declaredMatching}/${total} ad sets declare it · ${daysOfHistory} ${daysOfHistory === 1 ? 'day' : 'days'} of history (${HISTORY_CONFIDENT_DAYS} needed for confident calls).`;
    default:
      return `Scoring on ${kpiLabel} · ${declaredMatching}/${total} ad sets declare it · ${daysOfHistory} days of history. Signal is healthy — a quiet cycle means the budget is already balanced.`;
  }
}

export function SignalReadinessCard({
  snapshots,
  objective,
  className,
}: {
  snapshots: AdSetSnapshot[];
  objective: OptimizationObjective;
  className?: string;
}) {
  if (snapshots.length === 0) return null;

  const readiness = signalReadiness(snapshots, objective);
  const kpiLabel = getOptimizationMetricDefinition(objective).resultLabel.toLowerCase();
  const tone = VERDICT_TONE[readiness.verdict];
  const trackedPct = Math.round(readiness.trackedShare * 100);

  return (
    <OptimizerPanel
      className={className}
      meta={
        <Badge className="text-3xs" variant={tone}>
          {VERDICT_LABEL[readiness.verdict]}
        </Badge>
      }
      title="Signal readiness"
    >
      <p className={cn('text-xs', tone === 'success' ? 'text-foreground' : 'text-warning')}>
        {verdictMessage(readiness, kpiLabel)}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-muted-foreground tabular-nums">
        <span>
          {readiness.declaredMatching + readiness.undeclared}/
          {readiness.declaredMatching + readiness.declaredMismatched + readiness.undeclared} on
          objective
        </span>
        <span aria-hidden="true" className="text-border">
          ·
        </span>
        <span>{readiness.daysOfHistory}d history</span>
        <span aria-hidden="true" className="text-border">
          ·
        </span>
        <span>{trackedPct}% tracked</span>
        {readiness.unmovable > 0 ? (
          <>
            <span aria-hidden="true" className="text-border">
              ·
            </span>
            <span>{readiness.unmovable} not movable</span>
          </>
        ) : null}
      </div>
    </OptimizerPanel>
  );
}
