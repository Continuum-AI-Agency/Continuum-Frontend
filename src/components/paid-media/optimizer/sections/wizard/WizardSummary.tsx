'use client';

// The right-hand summary: the portfolio being built, said in sentences that fill in as the
// steps are reached (a step not reached yet reads "next step"), plus the setup advisor — the one place that knows both the selection and
// the goal, so its warnings sit beside the fields they are about on every step.

import type { SetupAdvice } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { SetupAdvisor } from '../../advisor/SetupAdvisor';
import { formatCpa, formatCurrency, humanize } from '../../format';
import { applyModePill } from '../../reportModel';
import * as typeScale from '../../typeScale';
import { TIER_COPY } from '../fields/TierCards';
import { PLATFORM_NAMES } from '../platforms/platformTabsModel';
import {
  effectiveTargetMetric,
  MODE_COPY,
  planReadout,
  selectionByPlatform,
  type WizardDraft,
  type WizardStep,
} from './wizardModel';

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
  /** The steps completed or open now; a row whose step is not among them waits. */
  reached: ReadonlySet<WizardStep>;
};

function Row({
  label,
  pending = false,
  children,
}: {
  label: string;
  pending?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className={`${typeScale.label} font-medium text-muted-foreground`}>{label}</p>
      {pending ? (
        <p className="text-muted-foreground/70 text-sm">next step</p>
      ) : (
        <p className="text-foreground text-sm tabular-nums">{children}</p>
      )}
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
  reached,
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
  const goalPending = !reached.has('goal');
  const planPending = !reached.has('plan');

  return (
    <aside className="space-y-3.5 rounded-xl bg-muted/50 px-4 py-4">
      <p className="font-semibold text-sm tracking-tight">{draft.name.trim() || 'New portfolio'}</p>
      {draft.proposedMembers.length > 0 ? (
        <div className="space-y-0.5">
          <p className={`${typeScale.label} font-medium text-muted-foreground`}>Manages</p>
          {selectionByPlatform(draft).length === 0 ? (
            <p className="text-foreground text-sm">Nothing selected yet</p>
          ) : (
            <ul className="space-y-0.5">
              {selectionByPlatform(draft).map((entry) => (
                <li
                  className="text-foreground text-sm tabular-nums"
                  data-platform={entry.platform}
                  data-testid="wizard-summary-platform"
                  key={entry.platform}
                >
                  {PLATFORM_NAMES[entry.platform]} · {entry.label}
                  {entry.platform === 'meta' && selectedBudgetSum > 0
                    ? ` · ${formatCurrency(selectedBudgetSum, currency)}/day today`
                    : ''}
                  {entry.platform === 'meta' ? '' : ' · recommend-only'}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <Row label="Manages">
          {draft.adsetIds.length === 0
            ? 'Nothing selected yet'
            : draft.campaignIds.length > 0
              ? `${draft.campaignIds.length} campaign${draft.campaignIds.length === 1 ? '' : 's'} · ${draft.adsetIds.length} ad sets`
              : `${draft.adsetIds.length} ad set${draft.adsetIds.length === 1 ? '' : 's'}`}
          {selectedBudgetSum > 0
            ? ` · ${formatCurrency(selectedBudgetSum, currency)}/day today`
            : ''}
        </Row>
      )}
      <Row label="Goal" pending={goalPending}>
        {humanize(draft.objective)} · {metric.costLabel}
        {Number.isFinite(target) && target > 0
          ? ` under ${formatCpa(target, currency)}`
          : ' · engine default target'}
      </Row>
      <Row label="Mode" pending={goalPending}>
        {mode.title}
        {draft.mode === 'scale' && draft.scaleGrowthPct && draft.scaleCadenceDays
          ? ` · +${draft.scaleGrowthPct}% every ${draft.scaleCadenceDays} days`
          : ''}
      </Row>
      <Row label="Plan" pending={planPending}>
        {daily != null ? `${formatCurrency(daily, currency)}/day` : 'Daily budget to set'}
        {readout.total != null && draft.flightFrom && draft.flightTo
          ? ` · ${formatCurrency(readout.total, currency)} over ${readout.days} days`
          : ' · unpaced'}
      </Row>
      <Row label="Applies moves" pending={planPending}>
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
