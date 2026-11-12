'use client';

import { useLocale, useTranslations } from 'next-intl';
import { localizeDashboardCopy } from '@/i18n/dashboardCopy';

// The Home's goal tiles. Each tile shows one objective's figure for the week; a small pencil
// opens a popover to rename it, measure something else, make it the main goal or remove it.
// Every change is saved for the scope on screen, so the Home becomes the one the client wants.

import {
  HOME_OBJECTIVE_METRICS,
  type HomeObjective,
  type HomeObjectiveMetric,
  homeObjectiveMetricSchema,
  makeHomeObjectivePrimary,
} from '@continuum/contracts';
import { Pencil, Plus, Star } from 'lucide-react';
import { useState } from 'react';
import { Sparkline } from '@/components/paid-media/optimizer/components/Sparkline';
import { DeltaBadge } from '@/components/shared/DeltaBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatFigure, formatMoney, formatRatio } from './format';
import type { ObjectiveFigure } from './homeOverviewModel';

const METRICS = homeObjectiveMetricSchema.options;

export function costLabelFor(
  objective: HomeObjective,
  fallback: string,
  t?: ReturnType<typeof useTranslations<'dashboard'>>,
): string {
  const meta = HOME_OBJECTIVE_METRICS[objective.metric];
  if (objective.label === meta.label || meta.unit === 'currency')
    return t ? localizeDashboardCopy(fallback, t) : fallback;
  if (t) return t('m_5e14c2536f', { label: objective.label });
  const [first = '', ...rest] = objective.label.toLowerCase().split(' ');
  const singular = first.endsWith('s') && first.length > 3 ? first.slice(0, -1) : first;
  return `Cost per ${[singular, ...rest].join(' ')}`;
}

function ObjectiveEditor({
  objective,
  objectives,
  onChange,
}: {
  objective: HomeObjective;
  objectives: HomeObjective[];
  onChange: (next: HomeObjective[]) => void;
}) {
  const uiText = useTranslations('dashboard');
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(objective.label);

  const replace = (patch: Partial<HomeObjective>) =>
    onChange(objectives.map((item) => (item.id === objective.id ? { ...item, ...patch } : item)));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={uiText('m_9f0a95cb65', { v0: String(objective.label) })}
            className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          />
        }
      >
        <Pencil className="size-3" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3 p-3">
        <form
          className="space-y-1"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = label.trim();
            if (trimmed) replace({ label: trimmed });
            setOpen(false);
          }}
        >
          <label
            htmlFor={`goal-name-${objective.id}`}
            className="text-2xs uppercase tracking-wide text-muted-foreground"
          >
            {uiText('name_dcd1d52')}
          </label>
          <Input
            id={`goal-name-${objective.id}`}
            value={label}
            maxLength={48}
            onChange={(event) => setLabel(event.target.value)}
            className="h-8 text-sm"
          />
        </form>
        <div className="space-y-1">
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">
            {uiText('measures_aabaa8f')}
          </span>
          <div className="flex flex-wrap gap-1">
            {METRICS.map((metric) => (
              <button
                key={metric}
                type="button"
                onClick={() =>
                  replace({
                    metric,
                    label:
                      objective.label === HOME_OBJECTIVE_METRICS[objective.metric].label
                        ? HOME_OBJECTIVE_METRICS[metric].label
                        : objective.label,
                  })
                }
                className={cn(
                  'rounded-full border px-2 py-0.5 text-xs transition-colors',
                  metric === objective.metric
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {localizeDashboardCopy(HOME_OBJECTIVE_METRICS[metric].label, uiText)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
          {objective.role === 'primary' ? (
            <span className="text-xs text-muted-foreground">{uiText('main_goal_d846c4d')}</span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => {
                onChange(makeHomeObjectivePrimary(objectives, objective.id));
                setOpen(false);
              }}
            >
              <Star className="size-3" />
              {uiText('m_2705ef1bc2')}
            </Button>
          )}
          {objectives.length > 1 ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => {
                const rest = objectives.filter((item) => item.id !== objective.id);
                onChange(
                  objective.role === 'primary' && rest[0]
                    ? makeHomeObjectivePrimary(rest, rest[0].id)
                    : rest,
                );
                setOpen(false);
              }}
            >
              {uiText('remove_c3812fc')}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ObjectiveTile({
  inferredLabels,
  figure,
  objectives,
  currency,
  onChange,
}: {
  inferredLabels?: boolean;
  figure: ObjectiveFigure;
  objectives: HomeObjective[];
  currency: string | null;
  onChange: (next: HomeObjective[]) => void;
}) {
  const uiLocale = useLocale();

  const uiText = useTranslations('dashboard');
  const { objective } = figure;
  const isPrimary = objective.role === 'primary';
  const cost = figure.cost;
  const costChange =
    cost && cost.previous !== null && cost.previous !== 0
      ? ((cost.value - cost.previous) / Math.abs(cost.previous)) * 100
      : null;

  return (
    <div
      data-home-objective={objective.metric}
      className={cn(
        'group flex min-w-0 flex-col gap-1 rounded-lg border bg-card p-3',
        isPrimary ? 'border-primary/40' : 'border-border',
      )}
    >
      <div className="flex items-center gap-1.5">
        {isPrimary ? (
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
        ) : null}
        <span className="truncate text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {inferredLabels ? localizeDashboardCopy(objective.label, uiText) : objective.label}
        </span>
        <ObjectiveEditor objective={objective} objectives={objectives} onChange={onChange} />
      </div>
      {figure.available && figure.value !== null ? (
        <>
          <div className="flex items-baseline gap-2">
            <span
              data-home-value
              className={cn(
                'font-semibold tabular-nums tracking-tight',
                isPrimary ? 'text-3xl' : 'text-2xl',
              )}
            >
              {formatFigure(figure.value, figure.unit, currency, uiLocale)}
            </span>
            {figure.deltaPct !== null ? <DeltaBadge value={figure.deltaPct} /> : null}
          </div>
          <div className="flex min-h-4 items-center gap-1.5 text-xs text-muted-foreground">
            {cost ? (
              <>
                <span>{costLabelFor(objective, cost.label, uiText)}</span>
                <span className="font-mono tabular-nums text-foreground">
                  {cost.kind === 'ratio'
                    ? formatRatio(cost.value, uiLocale)
                    : formatMoney(cost.value, currency, uiLocale)}
                </span>
                {costChange !== null ? (
                  <DeltaBadge value={costChange} goodWhenDown={cost.kind === 'money'} />
                ) : null}
              </>
            ) : (
              <span>{uiText('last_7_days_0603dec')}</span>
            )}
          </div>
          {figure.series.length > 1 ? (
            <Sparkline
              values={figure.series}
              width={160}
              height={24}
              className="mt-1 w-full"
              label={uiText('m_bbbcc85fb5', { v0: String(objective.label) })}
            />
          ) : null}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {uiText('not_counted_for_this_account_yet_it_appears_a_e3c8e05')}
        </p>
      )}
    </div>
  );
}

export function ObjectiveStrip({
  inferredLabels,
  figures,
  objectives,
  currency,
  onChange,
}: {
  inferredLabels?: boolean;
  figures: ObjectiveFigure[];
  objectives: HomeObjective[];
  currency: string | null;
  onChange: (next: HomeObjective[]) => void;
}) {
  const tUi = useTranslations('dashboard');

  const used = new Set(objectives.map((objective) => objective.metric));
  const nextMetric: HomeObjectiveMetric | undefined = METRICS.find((metric) => !used.has(metric));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {figures.map((figure) => (
        <ObjectiveTile
          inferredLabels={inferredLabels}
          key={figure.objective.id}
          figure={figure}
          objectives={objectives}
          currency={currency}
          onChange={onChange}
        />
      ))}
      {objectives.length < 3 && nextMetric ? (
        <button
          type="button"
          onClick={() =>
            onChange([
              ...objectives,
              {
                id: `${nextMetric}-${objectives.length}`,
                label: HOME_OBJECTIVE_METRICS[nextMetric].label,
                metric: nextMetric,
                role: objectives.length === 0 ? 'primary' : 'secondary',
              },
            ])
          }
          className="flex min-h-24 items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="size-3.5" />
          {tUi('m_4e4eccba09')}
        </button>
      ) : null}
    </div>
  );
}
