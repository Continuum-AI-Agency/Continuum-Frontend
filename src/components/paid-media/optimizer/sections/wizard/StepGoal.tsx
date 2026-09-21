'use client';

// Step 3 — the goal. The objective as a grid of cards, the metric the target is priced
// in (with the alternative where one exists), the target itself with the account's own
// number as a hint, and the mode said in a sentence. Scale mode opens its plan right here:
// grow by X% every N days, up to a ceiling.

import type {
  OptimizationModeDto,
  OptimizationObjective,
  SetupAdvice,
  TargetMetric,
} from '@continuum/contracts';
import { allowedTargetMetrics, getOptimizationMetricDefinition } from '@continuum/contracts';
import {
  DownloadIcon,
  EyeIcon,
  GoalIcon,
  HeartIcon,
  LinkIcon,
  type LucideIcon,
  MessageCircleIcon,
  MousePointerClickIcon,
  PlayIcon,
  ShoppingCartIcon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { TargetHint } from '../../advisor/SetupAdvisor';
import { currencySymbol, formatCurrency, humanize } from '../../format';
import { acceptSuggestionOnTab, suggestionPlaceholder } from '../../suggestInput';
import { MODES, OBJECTIVES } from '../suggestionModel';
import {
  DEFAULT_SCALE_CADENCE_DAYS,
  DEFAULT_SCALE_GROWTH_PCT,
  effectiveTargetMetric,
  MODE_COPY,
  type WizardDraft,
} from './wizardModel';

const OBJECTIVE_ICON: Record<OptimizationObjective, LucideIcon> = {
  purchase: ShoppingCartIcon,
  app_install: DownloadIcon,
  signup: UserPlusIcon,
  lead: UsersIcon,
  conversations: MessageCircleIcon,
  traffic: MousePointerClickIcon,
  link_clicks: LinkIcon,
  thruplays: PlayIcon,
  post_engagement: HeartIcon,
  awareness: EyeIcon,
  clicks: MousePointerClickIcon,
  // A conversion only the advertiser can name, so the icon says "a target you defined"
  // rather than borrowing the glyph of whichever objective it happens to behave like.
  custom: GoalIcon,
};

type StepGoalProps = {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
  currency: string | null;
  advice: SetupAdvice;
  disabled?: boolean;
};

export function StepGoal({ draft, onChange, currency, advice, disabled }: StepGoalProps) {
  const symbol = currencySymbol(currency);
  const allowed = allowedTargetMetrics(draft.objective);
  const targetMetric = effectiveTargetMetric(draft);
  const metric = getOptimizationMetricDefinition(targetMetric);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h3 className="font-semibold text-sm tracking-tight">What is this portfolio buying?</h3>
        <fieldset className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <legend className="sr-only">Objective</legend>
          {OBJECTIVES.map((objective) => {
            const Icon = OBJECTIVE_ICON[objective];
            const active = draft.objective === objective;
            return (
              <button
                aria-pressed={active}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                  active
                    ? 'border-primary/60 bg-accent/40 ring-1 ring-primary/40'
                    : 'border-border/70 bg-card hover:bg-muted/30',
                )}
                disabled={disabled}
                key={objective}
                onClick={() => onChange({ objective, targetMetric: null })}
                type="button"
              >
                <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="font-medium">{humanize(objective)}</span>
              </button>
            );
          })}
        </fieldset>
      </div>

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
            <p
              className="flex h-9 items-center rounded-md border border-border/60 bg-muted/30 px-3 text-sm"
              id="wizard-target-metric"
            >
              {metric.costLabel}
            </p>
          )}
          <p className="text-2xs text-muted-foreground">
            Every ad set is scored on {metric.costLabel.toLowerCase()} and the target below is set
            in it.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wizard-target">
            {metric.targetLabel} ({symbol})
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
        <h3 className="font-semibold text-sm tracking-tight">How should it optimize?</h3>
        <fieldset className="grid min-w-0 gap-2 sm:grid-cols-3">
          <legend className="sr-only">Mode</legend>
          {MODES.map((mode) => {
            const active = draft.mode === mode;
            const copy = MODE_COPY[mode];
            return (
              <button
                aria-pressed={active}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left transition-colors',
                  active
                    ? 'border-primary/60 bg-accent/40 ring-1 ring-primary/40'
                    : 'border-border/70 bg-card hover:bg-muted/30',
                )}
                disabled={disabled}
                key={mode}
                onClick={() =>
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
                type="button"
              >
                <span className="block font-semibold text-xs">{copy.title}</span>
                <span className="mt-0.5 block text-2xs text-muted-foreground">{copy.body}</span>
              </button>
            );
          })}
        </fieldset>

        {draft.mode === 'scale' ? (
          <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-3">
            <p className="text-2xs">
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
                <Label htmlFor="wizard-scale-ceiling">Up to ({symbol}/day, optional)</Label>
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
