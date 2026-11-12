'use client';
import type { useTranslations as ScaleTranslationHook } from 'next-intl';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { localizeOptimizationMetricDefinition } from '@/lib/paid-media/optimizationMetricPresentation';
import { createOptimizerDisplayTranslate } from '@/lib/paid-media/optimizerTranslator';

// Why a cycle produced no recommendations, said plainly. A zero-rec cycle is a
// legitimate outcome (frozen kpi_mismatch ad sets, a too-young account, no tracked
// events) — this card names the cause off the same snapshots the engine scores,
// so the operator gets a diagnosis instead of an unexplained empty state.

import type { AdSetSnapshot, OptimizationObjective } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import type { ReactNode } from 'react';

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

function verdictMessage(
  readiness: SignalReadiness,
  kpiLabel: string,
  uiTranslate?: ScaleCopy,
): string {
  const { declaredMatching, declaredMismatched, daysOfHistory, unmovable } = readiness;
  const total = declaredMatching + declaredMismatched + readiness.undeclared;

  switch (readiness.verdict) {
    case 'no_optimizable_budget':
      return uiTranslate
        ? uiTranslate('helper_64d7d7594514', { v0: unmovable, v1: total })
        : `${unmovable} of ${total} ad sets have no daily budget of their own — their spend is set at the campaign level (Advantage Campaign Budget) or across a whole flight. The optimizer can score them but cannot move their budget. Convert a campaign to ad-set budgets to make them optimizable.`;
    case 'currency_mismatch':
      return uiTranslate
        ? uiTranslate('helper_5f7a2d0c9596', {
            v0: declaredMismatched,
            v1: total,
            v2: kpiLabel,
          })
        : `${declaredMismatched} of ${total} ad sets optimize for a different result than ${kpiLabel} — those are frozen (currency mismatch) and can't be scored on this objective. Match the objective to what they buy, or optimize them separately.`;
    case 'no_signal':
      return uiTranslate
        ? uiTranslate('helper_531a06d48507', {
            v0: kpiLabel,
            v1: HISTORY_CONFIDENT_DAYS,
          })
        : `No tracked ${kpiLabel} in the last ${HISTORY_CONFIDENT_DAYS} days, so there's nothing to score yet. Check conversion tracking, or give recent launches time to convert.`;
    case 'thin_history':
      return uiTranslate
        ? uiTranslate('helper_061bdc003542', {
            v0: kpiLabel,
            v1: declaredMatching,
            v2: total,
            v3: daysOfHistory,
            v4: daysOfHistory === 1 ? 'day' : 'days',
            v5: HISTORY_CONFIDENT_DAYS,
          })
        : `Scoring on ${kpiLabel} · ${declaredMatching}/${total} ad sets declare it · ${daysOfHistory} ${daysOfHistory === 1 ? 'day' : 'days'} of history (${HISTORY_CONFIDENT_DAYS} needed for confident calls).`;
    default:
      return uiTranslate
        ? uiTranslate('helper_c40ec7ef9cdf', {
            v0: kpiLabel,
            v1: declaredMatching,
            v2: total,
            v3: daysOfHistory,
          })
        : `Scoring on ${kpiLabel} · ${declaredMatching}/${total} ad sets declare it · ${daysOfHistory} days of history. Signal is healthy — a quiet cycle means the budget is already balanced.`;
  }
}

export function SignalReadinessCard({
  snapshots,
  objective,
  className,
  action,
}: {
  snapshots: AdSetSnapshot[];
  objective: OptimizationObjective;
  className?: string;
  /** Affordance for the remedy the verdict names. A diagnosis that prescribes a
   *  fix and gives the reader no way to reach it is half a diagnosis — the
   *  "nothing movable" verdict in particular points at the CBO section, which
   *  can sit several screens below. */
  action?: ReactNode;
}) {
  const uiLocale = useLocale();

  const uiText = useTranslations('scale');
  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  if (snapshots.length === 0) return null;

  const readiness = signalReadiness(snapshots, objective);
  const kpiLabel = localizeOptimizationMetricDefinition(
    getOptimizationMetricDefinition(objective),
    optimizerText,
  ).resultLabel.toLowerCase();
  const tone = VERDICT_TONE[readiness.verdict];
  const trackedPct = Math.round(readiness.trackedShare * 100);

  return (
    <OptimizerPanel
      action={action}
      className={className}
      meta={
        <Badge className="text-xs" variant={tone}>
          {uiText('signalReadinessLabel', { verdict: readiness.verdict })}
        </Badge>
      }
      title={uiText('signal_readiness_7f1f355')}
    >
      <p className={cn('text-xs', tone === 'success' ? 'text-foreground' : 'text-warning')}>
        {verdictMessage(readiness, kpiLabel, uiText)}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground tabular-nums">
        <span>
          {uiText.rich('sentence_437708641863', {
            v0: readiness.declaredMatching + readiness.undeclared,
            v1: readiness.declaredMatching + readiness.declaredMismatched + readiness.undeclared,
          })}
        </span>
        <span aria-hidden="true" className="text-border">
          ·
        </span>
        <span>
          {uiText.rich('sentence_d64e43700653', {
            v0: readiness.daysOfHistory,
          })}
        </span>
        <span aria-hidden="true" className="text-border">
          ·
        </span>
        <span>{uiText.rich('sentence_79a0450b1412', { v0: trackedPct })}</span>
        {readiness.unmovable > 0 ? (
          <>
            <span aria-hidden="true" className="text-border">
              ·
            </span>
            <span>
              {uiText.rich('sentence_67b081d287f8', {
                v0: readiness.unmovable,
              })}
            </span>
          </>
        ) : null}
      </div>
    </OptimizerPanel>
  );
}
