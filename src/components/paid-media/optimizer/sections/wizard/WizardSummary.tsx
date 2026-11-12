'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { localizeOptimizationMetricDefinition } from '@/lib/paid-media/optimizationMetricPresentation';
import { createOptimizerDisplayTranslate } from '@/lib/paid-media/optimizerTranslator';

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
  channelTypeSummary,
  effectiveTargetMetric,
  MODE_COPY,
  parseTypedAmount,
  planReadout,
  selectedMembers,
  selectionByPlatform,
  type WizardDraft,
  type WizardStep,
  wizardModeCopy,
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

/** " (Search 1 · Performance Max 1)" for a platform's ticked campaigns, or nothing. */
function channelTypesOf(draft: WizardDraft, platform: string): string {
  const summary = channelTypeSummary(
    selectedMembers(draft).filter((member) => member.platform === platform),
  );
  return summary ? ` (${summary})` : '';
}

function Row({
  label,
  pending = false,
  children,
}: {
  label: string;
  pending?: boolean;
  children: React.ReactNode;
}) {
  const uiText = useTranslations('scale');
  return (
    <div className="space-y-0.5">
      <p className={`${typeScale.label} font-medium text-muted-foreground`}>{label}</p>
      {pending ? (
        <p className="text-muted-foreground/70 text-sm">{uiText('next_step_e1644f0')}</p>
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
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  const metric = localizeOptimizationMetricDefinition(
    getOptimizationMetricDefinition(effectiveTargetMetric(draft)),
    optimizerText,
  );
  // The model's reading of each amount: the summary shows what Create will send.
  const target = parseTypedAmount(draft.target) ?? Number.NaN;
  const typedDaily = parseTypedAmount(draft.dailyTotal) ?? Number.NaN;
  const readout = planReadout(draft);
  const daily =
    Number.isFinite(typedDaily) && typedDaily > 0
      ? typedDaily
      : (readout.perDay ?? (selectedBudgetSum > 0 ? selectedBudgetSum : null));
  const mode = wizardModeCopy(draft.mode, uiText);
  const goalPending = !reached.has('goal');
  const planPending = !reached.has('plan');
  const assetsPending = !reached.has('assets');

  return (
    <aside className="space-y-3.5 rounded-xl bg-muted/50 px-4 py-4">
      <p className="font-semibold text-sm tracking-tight">
        {draft.name.trim() || uiText('new_portfolio_2ea4a33')}
      </p>
      {assetsPending ? (
        <Row label={uiText('manages_930f87c')} pending>
          {null}
        </Row>
      ) : draft.proposedMembers.length > 0 ? (
        <div className="space-y-0.5">
          <p className={`${typeScale.label} font-medium text-muted-foreground`}>
            {uiText('manages_930f87c')}
          </p>
          {selectionByPlatform(draft).length === 0 ? (
            <p className="text-foreground text-sm">{uiText('nothing_selected_yet_09245a7')}</p>
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
                  {entry.platform === 'meta' ? '' : channelTypesOf(draft, entry.platform)}
                  {entry.platform === 'meta' && selectedBudgetSum > 0
                    ? uiText('template_1642ab5261f5', {
                        v0: formatCurrency(selectedBudgetSum, currency, uiLocale),
                      })
                    : ''}
                  {/* Off Meta the optimizer recommends, and what it recommends is the budget. */}
                  {entry.platform === 'meta' ? '' : uiText('budget_recommendations_cdc464c')}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <Row label={uiText('manages_930f87c')}>
          {draft.adsetIds.length === 0
            ? uiText('nothing_selected_yet_09245a7')
            : draft.campaignIds.length > 0
              ? uiText('template_9ac09ef75352', {
                  campaigns: draft.campaignIds.length,
                  adsets: draft.adsetIds.length,
                })
              : uiText('template_18e413a54a56', {
                  count: draft.adsetIds.length,
                })}
          {selectedBudgetSum > 0
            ? uiText('template_1642ab5261f5', {
                v0: formatCurrency(selectedBudgetSum, currency, uiLocale),
              })
            : ''}
        </Row>
      )}
      <Row label={uiText('goal_cdbf697')} pending={goalPending}>
        {humanize(draft.objective, uiText)} · {metric.costLabel}
        {Number.isFinite(target) && target > 0
          ? uiText('template_ac9d015f224f', {
              v0: formatCpa(target, currency, uiLocale),
            })
          : uiText('engine_default_target_f1c7c01')}
      </Row>
      <Row label={uiText('mode_5e23ec6')} pending={goalPending}>
        {mode.title}
        {draft.mode === 'scale' && draft.scaleGrowthPct && draft.scaleCadenceDays
          ? uiText('template_015444222c26', {
              v0: draft.scaleGrowthPct,
              v1: draft.scaleCadenceDays,
            })
          : ''}
      </Row>
      <Row label={uiText('plan_fa8ed0b')} pending={planPending}>
        {daily != null
          ? uiText('template_34dd8b60efe4', {
              v0: formatCurrency(daily, currency, uiLocale),
            })
          : uiText('daily_budget_to_set_e7a265e')}
        {readout.total != null && draft.flightFrom && draft.flightTo
          ? uiText('template_f99854c517ea', {
              v0: formatCurrency(readout.total, currency, uiLocale),
              v1: readout.days ?? '',
            })
          : uiText('unpaced_246d20a')}
      </Row>
      <Row label={uiText('applies_moves_31a3b21')} pending={planPending}>
        {applyModePill(draft.applyMode, optimizerText)?.label ?? TIER_COPY[draft.applyMode].title}
        {draft.applyMode === 'autopilot' && draft.maxChangePct
          ? uiText('template_553611db9e7c', { v0: draft.maxChangePct })
          : ''}
      </Row>
      {assetsPending ? null : (
        <SetupAdvisor
          advice={advice}
          brandId={brandId}
          currency={currency}
          disabled={disabled}
          onChangeSelection={onChangeSelection}
          onUseBudget={onUseBudget}
          onUseTarget={onUseTarget}
          selectedIds={draft.adsetIds}
        />
      )}
    </aside>
  );
}
