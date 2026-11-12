'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

// Step 4 — the plan and who applies it. A name, the daily budget (matched to the selection
// unless typed), an optional flight with its budget typed per day, per month or as a whole,
// and the autonomy tier. Choosing Autopilot fills its two guardrails with
// sensible defaults, so it is one click away rather than locked behind fields nobody
// explained; both stay editable.

import type { ApplyMode, BudgetGranularity, SetupAdvice } from '@continuum/contracts';
import { DateRangeField } from '@/components/shared/DateRangeField';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BudgetHint } from '../../advisor/SetupAdvisor';
import { currencyFieldSuffix, formatCurrency } from '../../format';
import { acceptSuggestionOnTab, suggestionPlaceholder } from '../../suggestInput';
import { TierCards } from '../fields/TierCards';
import { questionHeading } from './OptionRow';
import {
  parseTypedAmount,
  planReadout,
  suggestedGuardrails,
  type WizardDraft,
} from './wizardModel';

function nextDays(days: number, today = new Date()): { from: string; to: string } {
  const start = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const end = new Date(start.getTime() + (days - 1) * 86_400_000);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
}

type StepPlanProps = {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
  currency: string | null;
  selectedBudgetSum: number;
  advice: SetupAdvice;
  disabled?: boolean;
};

export function StepPlan({
  draft,
  onChange,
  currency,
  selectedBudgetSum,
  advice,
  disabled,
}: StepPlanProps) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const GRANULARITY_LABEL: Record<BudgetGranularity, string> = useMemo(
    () => ({
      daily: uiText('per_day_5b9e193'),
      monthly: 'Per month',
      total: 'Whole flight',
    }),
    [uiText],
  );

  // Empty on an account with no currency code, and a label reading "Daily budget ()" is
  // its own kind of wrong — the hint disappears with the unit.
  const unit = currencyFieldSuffix(currency);
  const readout = planReadout(draft);
  // The model's reading, so this hint never prints 1 for a typed "1,500".
  const typedDaily = parseTypedAmount(draft.dailyTotal) ?? Number.NaN;
  const effectiveDaily =
    Number.isFinite(typedDaily) && typedDaily > 0
      ? typedDaily
      : (readout.perDay ?? selectedBudgetSum);
  const hasFlight = Boolean(draft.flightFrom && draft.flightTo);

  function selectTier(next: ApplyMode) {
    if (next === 'autopilot' && (draft.maxDailyApply === '' || draft.maxChangePct === '')) {
      const suggested = suggestedGuardrails(effectiveDaily);
      onChange({
        applyMode: next,
        maxDailyApply: draft.maxDailyApply || suggested.maxDailyApply,
        maxChangePct: draft.maxChangePct || suggested.maxChangePct,
      });
      return;
    }
    onChange({ applyMode: next });
  }

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <h3 className={questionHeading}>{uiText('what_should_it_spend_2063469')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wizard-name">{uiText('name_dcd1d52')}</Label>
            <Input
              disabled={disabled}
              id="wizard-name"
              onChange={(event) => onChange({ name: event.target.value })}
              placeholder={uiText('e_g_prospecting_purchases_b297654')}
              value={draft.name}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wizard-daily">
              {uiText.rich('sentence_fab46a0c1ac3', { v0: unit })}
            </Label>
            <Input
              disabled={disabled}
              id="wizard-daily"
              inputMode="decimal"
              onChange={(event) => onChange({ dailyTotal: event.target.value })}
              onKeyDown={acceptSuggestionOnTab(advice.suggestedDailyTotal, (value) =>
                onChange({ dailyTotal: value }),
              )}
              placeholder={suggestionPlaceholder(
                advice.suggestedDailyTotal ??
                  (selectedBudgetSum > 0 ? Math.round(selectedBudgetSum) : null),
                '4200',
              )}
              value={draft.dailyTotal}
            />
            <BudgetHint
              advice={advice}
              currency={currency}
              disabled={disabled}
              onUse={(value) => onChange({ dailyTotal: value })}
            />
            {draft.dailyTotal.trim() === '' && selectedBudgetSum > 0 ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                {uiText.rich('sentence_6a2cbcd278bb', {
                  v0: formatCurrency(selectedBudgetSum, currency, uiLocale),
                })}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-3 border-border/60 border-t pt-5">
        <div>
          <h3 className="font-semibold text-sm tracking-tight">
            {uiText('flight_optional_7b5d2a0')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {uiText('a_start_date_an_end_date_and_a_budget_the_opt_79db824')}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wizard-flight">{uiText('dates_7896390')}</Label>
            <DateRangeField
              disabled={disabled}
              id="wizard-flight"
              onChange={(range) => onChange({ flightFrom: range.from, flightTo: range.to })}
              placeholder={uiText('no_flight_06a3f38')}
              value={{ from: draft.flightFrom, to: draft.flightTo }}
            />
            {!hasFlight ? (
              <button
                className="text-xs text-primary-ink hover:underline"
                disabled={disabled}
                onClick={() => {
                  const range = nextDays(30);
                  onChange({ flightFrom: range.from, flightTo: range.to });
                }}
                type="button"
              >
                {uiText('next_30_days_c9c44b4')}
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">
                {uiText.rich('sentence_f322f4af81da', {
                  v0: readout.days ?? '',
                })}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="wizard-budget">
                {uiText.rich('sentence_e51bd8ec1746', { v0: unit })}
              </Label>
              <ToggleGroup
                aria-label={uiText('budget_granularity_d1f47f1')}
                onValueChange={(next) => {
                  if (next) onChange({ budgetGranularity: next as BudgetGranularity });
                }}
                size="sm"
                type="single"
                value={draft.budgetGranularity}
                variant="outline"
              >
                {(Object.keys(GRANULARITY_LABEL) as BudgetGranularity[]).map((value) => (
                  <ToggleGroupItem className="h-6 px-2 text-xs" key={value} value={value}>
                    {GRANULARITY_LABEL[value]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <Input
              disabled={disabled}
              id="wizard-budget"
              inputMode="decimal"
              onChange={(event) => onChange({ budgetAmount: event.target.value })}
              placeholder={GRANULARITY_LABEL[draft.budgetGranularity]}
              value={draft.budgetAmount}
            />
            <p className="text-xs text-muted-foreground tabular-nums">
              {readout.total != null && readout.perDay != null
                ? uiText('template_9c98c5150e32', {
                    v0: formatCurrency(readout.total, currency, uiLocale),
                    v1: formatCurrency(readout.perDay, currency, uiLocale),
                  })
                : draft.budgetAmount && !hasFlight
                  ? uiText('set_the_dates_to_pace_this_over_the_flight_51a9510')
                  : uiText('leave_blank_to_run_unpaced_on_the_daily_budge_2643a8f')}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className={questionHeading}>{uiText('who_applies_the_moves_b220069')}</h3>
        <TierCards disabled={disabled} onSelect={selectTier} value={draft.applyMode} />
        {draft.applyMode === 'autopilot' ? (
          <div className="grid gap-3 pt-1 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wizard-max-daily">
                {uiText.rich('sentence_69fd1a3b6a3a', { v0: unit })}
              </Label>
              <Input
                disabled={disabled}
                id="wizard-max-daily"
                inputMode="decimal"
                onChange={(event) => onChange({ maxDailyApply: event.target.value })}
                value={draft.maxDailyApply}
              />
              <p className="text-xs text-muted-foreground">
                {uiText('above_this_daily_pool_autopilot_writes_nothin_85a08b2')}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wizard-max-pct">{uiText('max_change_per_cycle_f6b020b')}</Label>
              <Input
                disabled={disabled}
                id="wizard-max-pct"
                inputMode="decimal"
                onChange={(event) => onChange({ maxChangePct: event.target.value })}
                value={draft.maxChangePct}
              />
              <p className="text-xs text-muted-foreground">
                {uiText('a_single_move_bigger_than_this_is_held_for_yo_8591fb1')}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
