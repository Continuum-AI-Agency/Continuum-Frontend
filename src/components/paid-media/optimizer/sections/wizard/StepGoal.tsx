'use client';

// Step 3 — the goal. The objective as radio rows, the metric the target is priced
// in (with the alternative where one exists), the target itself with the account's own
// number as a hint, and the mode said in a sentence. Scale mode opens its plan right here:
// grow by X% every N days, up to a ceiling.

import type {
  AnalogObjective,
  OptimizationModeDto,
  OptimizationObjective,
  SetupAdvice,
  TargetMetric,
} from '@continuum/contracts';
import {
  allowedTargetMetrics,
  analogNote,
  analogObjectiveSchema,
  getOptimizationMetricDefinition,
} from '@continuum/contracts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TargetHint } from '../../advisor/SetupAdvisor';
import { currencyFieldSuffix, currencySymbol, formatCurrency, humanize } from '../../format';
import { acceptSuggestionOnTab, suggestionPlaceholder } from '../../suggestInput';
import { MODES, OBJECTIVES } from '../suggestionModel';
import { ANALOG_LABEL, buildConversionDescriptor } from './conversionDescriptor';
import { OptionRow, questionHeading } from './OptionRow';
import {
  DEFAULT_SCALE_CADENCE_DAYS,
  DEFAULT_SCALE_GROWTH_PCT,
  effectiveTargetMetric,
  MODE_COPY,
  type WizardDraft,
} from './wizardModel';

type StepGoalProps = {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
  currency: string | null;
  advice: SetupAdvice;
  disabled?: boolean;
};

export function StepGoal({ draft, onChange, currency, advice, disabled }: StepGoalProps) {
  const symbol = currencySymbol(currency);
  const unit = currencyFieldSuffix(currency);
  const allowed = allowedTargetMetrics(draft.objective);
  const targetMetric = effectiveTargetMetric(draft);
  const metric = getOptimizationMetricDefinition(targetMetric);
  // Only meaningful for 'custom'; built every render so the note tracks what is typed.
  const built = buildConversionDescriptor(draft.conversion);
  const descriptor = 'descriptor' in built ? built.descriptor : null;
  const patchConversion = (patch: Partial<WizardDraft['conversion']>) =>
    onChange({ conversion: { ...draft.conversion, ...patch } });

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h3 className={questionHeading}>What is this portfolio buying?</h3>
        <fieldset className="grid min-w-0 gap-x-6 @md:grid-cols-2 @2xl:grid-cols-3">
          <legend className="sr-only">Objective</legend>
          {OBJECTIVES.map((objective) => (
            <OptionRow
              active={draft.objective === objective}
              disabled={disabled}
              key={objective}
              onSelect={() => onChange({ objective, targetMetric: null })}
              title={humanize(objective)}
            />
          ))}
        </fieldset>
      </div>

      {draft.objective === 'custom' ? (
        <div className="space-y-2.5">
          <div>
            <h4 className="font-semibold text-sm tracking-tight">
              Which conversion, and how does it behave?
            </h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nobody outside your business knows what this event is. Name it, and it is measured
              against whichever calibrated objective behaves the same way.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wizard-conv-event">Event id</Label>
              <Input
                disabled={disabled}
                id="wizard-conv-event"
                onChange={(event) => patchConversion({ event_id: event.target.value })}
                placeholder="offsite_conversion.fb_pixel_custom"
                value={draft.conversion.event_id}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wizard-conv-result">What you call one</Label>
              <Input
                disabled={disabled}
                id="wizard-conv-result"
                onChange={(event) => patchConversion({ result_label: event.target.value })}
                placeholder="Demos booked"
                value={draft.conversion.result_label}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wizard-conv-cost">What one costs</Label>
              <Input
                disabled={disabled}
                id="wizard-conv-cost"
                onChange={(event) => patchConversion({ cost_label: event.target.value })}
                placeholder="Cost per demo booked"
                value={draft.conversion.cost_label}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="wizard-conv-lag">Days to arrive</Label>
                <Input
                  disabled={disabled}
                  id="wizard-conv-lag"
                  inputMode="decimal"
                  onChange={(event) => patchConversion({ typical_lag_days: event.target.value })}
                  placeholder="4"
                  value={draft.conversion.typical_lag_days}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wizard-conv-volume">A week</Label>
                <Input
                  disabled={disabled}
                  id="wizard-conv-volume"
                  inputMode="decimal"
                  onChange={(event) => patchConversion({ events_per_week: event.target.value })}
                  placeholder="18"
                  value={draft.conversion.events_per_week}
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="wizard-conv-analog">Measured like</Label>
              <Select
                disabled={disabled}
                onValueChange={(value) =>
                  patchConversion({
                    analog:
                      value === 'inferred'
                        ? null
                        : (analogObjectiveSchema.parse(value) as AnalogObjective),
                  })
                }
                value={draft.conversion.analog ?? 'inferred'}
              >
                <SelectTrigger id="wizard-conv-analog">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inferred">Work it out from the answers above</SelectItem>
                  {analogObjectiveSchema.options.map((value) => (
                    <SelectItem key={value} value={value}>
                      {`Like ${ANALOG_LABEL[value]}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {descriptor ? (
                <p className="text-xs text-muted-foreground">{analogNote(descriptor)}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {'error' in built ? built.error : null}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wizard-target-metric">Priced in</Label>
          {allowed.length > 1 ? (
            <Select
              onValueChange={(value) =>
                onChange({
                  targetMetric: value === draft.objective ? null : (value as TargetMetric),
                })
              }
              value={targetMetric}
            >
              <SelectTrigger id="wizard-target-metric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowed.map((value) => (
                  <SelectItem key={value} value={value}>
                    {getOptimizationMetricDefinition(value).costLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="flex h-9 items-center font-medium text-sm" id="wizard-target-metric">
              {metric.costLabel}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Every ad set is scored on {metric.costLabel.toLowerCase()} and the target below is set
            in it.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wizard-target">
            {metric.targetLabel}
            {unit}
          </Label>
          <Input
            disabled={disabled}
            id="wizard-target"
            inputMode="decimal"
            onChange={(event) => onChange({ target: event.target.value })}
            onKeyDown={acceptSuggestionOnTab(advice.suggestedTarget, (value) =>
              onChange({ target: value }),
            )}
            placeholder={suggestionPlaceholder(
              advice.suggestedTarget,
              metric.costLabel === 'CPM' ? '12' : '40',
            )}
            value={draft.target}
          />
          <TargetHint
            advice={advice}
            currency={currency}
            disabled={disabled}
            onUse={(value) => onChange({ target: value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className={questionHeading}>How should it optimize?</h3>
        <fieldset className="min-w-0">
          <legend className="sr-only">Mode</legend>
          {MODES.map((mode) => {
            const copy = MODE_COPY[mode];
            return (
              <OptionRow
                active={draft.mode === mode}
                body={copy.body}
                disabled={disabled}
                key={mode}
                onSelect={() =>
                  onChange({
                    mode: mode as OptimizationModeDto,
                    ...(mode === 'scale' &&
                    draft.scaleGrowthPct === '' &&
                    draft.scaleCadenceDays === ''
                      ? {
                          scaleGrowthPct: DEFAULT_SCALE_GROWTH_PCT,
                          scaleCadenceDays: DEFAULT_SCALE_CADENCE_DAYS,
                        }
                      : {}),
                  })
                }
                title={copy.title}
              />
            );
          })}
        </fieldset>

        {draft.mode === 'scale' ? (
          <div className="space-y-2 pt-2">
            <p className="text-xs">
              Grow the budget{' '}
              <span className="font-medium text-foreground">{draft.scaleGrowthPct || '…'}%</span>{' '}
              every{' '}
              <span className="font-medium text-foreground">
                {draft.scaleCadenceDays || '…'} days
              </span>{' '}
              while the portfolio beats {metric.targetLabel.toLowerCase()}
              {draft.scaleMaxDaily
                ? `, up to ${formatCurrency(Number(draft.scaleMaxDaily), currency)}/day`
                : ''}
              .
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="wizard-scale-growth">Grow by (%)</Label>
                <Input
                  disabled={disabled}
                  id="wizard-scale-growth"
                  inputMode="decimal"
                  onChange={(event) => onChange({ scaleGrowthPct: event.target.value })}
                  value={draft.scaleGrowthPct}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wizard-scale-cadence">Every (days)</Label>
                <Input
                  disabled={disabled}
                  id="wizard-scale-cadence"
                  inputMode="numeric"
                  onChange={(event) => onChange({ scaleCadenceDays: event.target.value })}
                  value={draft.scaleCadenceDays}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wizard-scale-ceiling">
                  Up to ({symbol ? `${symbol}/day` : 'per day'}, optional)
                </Label>
                <Input
                  disabled={disabled}
                  id="wizard-scale-ceiling"
                  inputMode="decimal"
                  onChange={(event) => onChange({ scaleMaxDaily: event.target.value })}
                  value={draft.scaleMaxDaily}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
