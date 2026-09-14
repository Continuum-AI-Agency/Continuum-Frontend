'use client';

// Step 4 — the plan and who applies it. A name, the daily budget (matched to the selection
// unless typed), an optional flight with its budget typed per day, per month or as a whole,
// and the autonomy tier as three cards. Choosing Autopilot fills its two guardrails with
// sensible defaults, so it is one click away rather than locked behind fields nobody
// explained; both stay editable.

import type { ApplyMode, BudgetGranularity, SetupAdvice } from '@continuum/contracts';
import { DateRangeField } from '@/components/shared/DateRangeField';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BudgetHint } from '../../advisor/SetupAdvisor';
import { currencySymbol, formatCurrency } from '../../format';
import { acceptSuggestionOnTab, suggestionPlaceholder } from '../../suggestInput';
import { TierCards } from '../fields/TierCards';
import { planReadout, suggestedGuardrails, type WizardDraft } from './wizardModel';

const GRANULARITY_LABEL: Record<BudgetGranularity, string> = {
  daily: 'Per day',
  monthly: 'Per month',
  total: 'Whole flight',
};

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
  const symbol = currencySymbol(currency);
  const readout = planReadout(draft);
  const typedDaily = Number.parseFloat(draft.dailyTotal);
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
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wizard-name">Name</Label>
          <Input
            disabled={disabled}
            id="wizard-name"
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="e.g. Prospecting · Purchases"
            value={draft.name}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wizard-daily">Daily budget ({symbol})</Label>
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
            <p className="text-2xs text-muted-foreground tabular-nums">
              Blank matches the selection: {formatCurrency(selectedBudgetSum, currency)}/day today.
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
        <div>
          <h3 className="font-semibold text-sm tracking-tight">Flight (optional)</h3>
          <p className="text-2xs text-muted-foreground">
            A start date, an end date and a budget. The optimizer paces spend to land on it.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wizard-flight">Dates</Label>
            <DateRangeField
              disabled={disabled}
              id="wizard-flight"
              onChange={(range) => onChange({ flightFrom: range.from, flightTo: range.to })}
              placeholder="No flight"
              value={{ from: draft.flightFrom, to: draft.flightTo }}
            />
            {!hasFlight ? (
              <button
                className="text-2xs text-primary hover:underline"
                disabled={disabled}
                onClick={() => {
                  const range = nextDays(30);
                  onChange({ flightFrom: range.from, flightTo: range.to });
                }}
                type="button"
              >
                Next 30 days
              </button>
            ) : (
              <p className="text-2xs text-muted-foreground">{readout.days} days</p>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="wizard-budget">Budget ({symbol})</Label>
              <ToggleGroup
                aria-label="Budget granularity"
                onValueChange={(next) => {
                  if (next) onChange({ budgetGranularity: next as BudgetGranularity });
                }}
                size="sm"
                type="single"
                value={draft.budgetGranularity}
                variant="outline"
              >
                {(Object.keys(GRANULARITY_LABEL) as BudgetGranularity[]).map((value) => (
                  <ToggleGroupItem className="h-6 px-2 text-2xs" key={value} value={value}>
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
            <p className="text-2xs text-muted-foreground tabular-nums">
              {readout.total != null && readout.perDay != null
                ? `= ${formatCurrency(readout.total, currency)} for the flight · ≈ ${formatCurrency(readout.perDay, currency)}/day`
                : draft.budgetAmount && !hasFlight
                  ? 'Set the dates to pace this over the flight.'
                  : 'Leave blank to run unpaced on the daily budget.'}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-sm tracking-tight">Who applies the moves?</h3>
        <TierCards disabled={disabled} onSelect={selectTier} value={draft.applyMode} />
        {draft.applyMode === 'autopilot' ? (
          <div className="grid gap-3 rounded-md border border-border/60 bg-muted/10 p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wizard-max-daily">Max autopilot spend/day ({symbol})</Label>
              <Input
                disabled={disabled}
                id="wizard-max-daily"
                inputMode="decimal"
                onChange={(event) => onChange({ maxDailyApply: event.target.value })}
                value={draft.maxDailyApply}
              />
              <p className="text-2xs text-muted-foreground">
                Above this daily pool, autopilot writes nothing and asks you instead.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wizard-max-pct">Max change per cycle (%)</Label>
              <Input
                disabled={disabled}
                id="wizard-max-pct"
                inputMode="decimal"
                onChange={(event) => onChange({ maxChangePct: event.target.value })}
                value={draft.maxChangePct}
              />
              <p className="text-2xs text-muted-foreground">
                A single move bigger than this is held for your approval.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
