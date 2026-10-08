'use client';

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

export function costLabelFor(objective: HomeObjective, fallback: string): string {
  const meta = HOME_OBJECTIVE_METRICS[objective.metric];
  if (objective.label === meta.label || meta.unit === 'currency') return fallback;
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
            aria-label={`Edit goal ${objective.label}`}
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
            Name
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
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">Measures</span>
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
                {HOME_OBJECTIVE_METRICS[metric].label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
          {objective.role === 'primary' ? (
            <span className="text-xs text-muted-foreground">Main goal</span>
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
              <Star className="size-3" /> Make main goal
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
              Remove
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ObjectiveTile({
  figure,
  objectives,
  currency,
  onChange,
}: {
  figure: ObjectiveFigure;
  objectives: HomeObjective[];
  currency: string | null;
  onChange: (next: HomeObjective[]) => void;
}) {
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
          {objective.label}
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
              {formatFigure(figure.value, figure.unit, currency)}
            </span>
            {figure.deltaPct !== null ? <DeltaBadge value={figure.deltaPct} /> : null}
          </div>
          <div className="flex min-h-4 items-center gap-1.5 text-xs text-muted-foreground">
            {cost ? (
              <>
                <span>{costLabelFor(objective, cost.label)}</span>
                <span className="font-mono tabular-nums text-foreground">
                  {cost.kind === 'ratio'
                    ? formatRatio(cost.value)
                    : formatMoney(cost.value, currency)}
                </span>
                {costChange !== null ? (
                  <DeltaBadge value={costChange} goodWhenDown={cost.kind === 'money'} />
                ) : null}
              </>
            ) : (
              <span>Last 7 days</span>
            )}
          </div>
          {figure.series.length > 1 ? (
            <Sparkline
              values={figure.series}
              width={160}
              height={24}
              className="mt-1 w-full"
              label={`${objective.label}, daily`}
            />
          ) : null}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Not counted for this account yet. It appears after the next data update.
        </p>
      )}
    </div>
  );
}

export function ObjectiveStrip({
  figures,
  objectives,
  currency,
  onChange,
}: {
  figures: ObjectiveFigure[];
  objectives: HomeObjective[];
  currency: string | null;
  onChange: (next: HomeObjective[]) => void;
}) {
  const used = new Set(objectives.map((objective) => objective.metric));
  const nextMetric: HomeObjectiveMetric | undefined = METRICS.find((metric) => !used.has(metric));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {figures.map((figure) => (
        <ObjectiveTile
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
          <Plus className="size-3.5" /> Add goal
        </button>
      ) : null}
    </div>
  );
}
