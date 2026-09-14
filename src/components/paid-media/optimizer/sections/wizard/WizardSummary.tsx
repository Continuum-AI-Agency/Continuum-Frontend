'use client';

// The right-hand summary: the portfolio being built, said in sentences that update as the
// answers change, plus the setup advisor — the one place that knows both the selection and
// the goal, so its warnings sit beside the fields they are about on every step.

import type { SetupAdvice } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { SetupAdvisor } from '../../advisor/SetupAdvisor';
import { formatCpa, formatCurrency, humanize } from '../../format';
import { applyModePill } from '../../reportModel';
import { TIER_COPY } from '../fields/TierCards';
import { effectiveTargetMetric, MODE_COPY, planReadout, type WizardDraft } from './wizardModel';

type WizardSummaryProps = {
  draft: WizardDraft;
  currency: string | null;
  selectedBudgetSum: number;
  advice: SetupAdvice;
  brandId: string;
  onChangeSelection: (ids: string[]) => void;
  onUseBudget: (value: string) => void;
  onUseTarget: (value: string) => void;
  disabled?: boolean;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-3xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-xs text-foreground">{children}</p>
    </div>
  );
}

export function WizardSummary({
  draft,
  currency,
  selectedBudgetSum,
  advice,
  brandId,
  onChangeSelection,
  onUseBudget,
  onUseTarget,
  disabled,
}: WizardSummaryProps) {
  const metric = getOptimizationMetricDefinition(effectiveTargetMetric(draft));
  const target = Number.parseFloat(draft.target);
  const typedDaily = Number.parseFloat(draft.dailyTotal);
  const readout = planReadout(draft);
  const daily =
    Number.isFinite(typedDaily) && typedDaily > 0
      ? typedDaily
      : (readout.perDay ?? (selectedBudgetSum > 0 ? selectedBudgetSum : null));
  const mode = MODE_COPY[draft.mode];

  return (
    <aside className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3">
      <p className="font-semibold text-sm tracking-tight">{draft.name.trim() || 'New portfolio'}</p>
      <Row label="Manages">
        {draft.adsetIds.length === 0
          ? 'Nothing selected yet'
          : draft.campaignIds.length > 0
            ? `${draft.campaignIds.length} campaign${draft.campaignIds.length === 1 ? '' : 's'} · ${draft.adsetIds.length} ad sets`
            : `${draft.adsetIds.length} ad set${draft.adsetIds.length === 1 ? '' : 's'}`}
        {selectedBudgetSum > 0 ? ` · ${formatCurrency(selectedBudgetSum, currency)}/day today` : ''}
      </Row>
      <Row label="Goal">
        {humanize(draft.objective)} · {metric.costLabel}
        {Number.isFinite(target) && target > 0
          ? ` under ${formatCpa(target, currency)}`
          : ' · engine default target'}
      </Row>
      <Row label="Mode">
        {mode.title}
        {draft.mode === 'scale' && draft.scaleGrowthPct && draft.scaleCadenceDays
          ? ` · +${draft.scaleGrowthPct}% every ${draft.scaleCadenceDays} days`
          : ''}
      </Row>
      <Row label="Plan">
        {daily != null ? `${formatCurrency(daily, currency)}/day` : 'Daily budget to set'}
        {readout.total != null && draft.flightFrom && draft.flightTo
          ? ` · ${formatCurrency(readout.total, currency)} over ${readout.days} days`
          : ' · unpaced'}
      </Row>
      <Row label="Applies moves">
        {applyModePill(draft.applyMode)?.label ?? TIER_COPY[draft.applyMode].title}
        {draft.applyMode === 'autopilot' && draft.maxChangePct
          ? ` · holds moves over ${draft.maxChangePct}%`
          : ''}
      </Row>
      <SetupAdvisor
        advice={advice}
        brandId={brandId}
        disabled={disabled}
        onChangeSelection={onChangeSelection}
        onUseBudget={onUseBudget}
        onUseTarget={onUseTarget}
        selectedIds={draft.adsetIds}
      />
    </aside>
  );
}
