'use client';

// Where the team sets how much of the primary goal it aims for, and by when. A failed write keeps
// everything typed and says what the Backend said: the form only says "saved" when it was.

import {
  HOME_OBJECTIVE_METRICS,
  HOME_PROFILE_BRAND_SCOPE,
  type HomeGoalPeriod,
  type HomeGoalTarget,
  type HomeObjective,
  homeGoalPeriodSchema,
} from '@continuum/contracts';
import { type FormEvent, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GOAL_PERIOD_LABELS, goalTargetRequest } from './goalTargetModel';
import type { GoalTargetsApi } from './useGoalTargets';

type Outcome = { kind: 'saved' | 'removed' } | { kind: 'failed'; message: string } | null;

const SELECT_CLASS =
  'h-8 w-full rounded-md border border-border bg-background px-2 text-foreground text-sm';
const LABEL_CLASS = 'text-2xs text-muted-foreground uppercase tracking-wide';

export function GoalTargetForm({
  brandId,
  objective,
  existing,
  defaultCurrency,
  currencies,
  targets,
}: {
  brandId: string;
  objective: HomeObjective;
  existing: HomeGoalTarget | null;
  /** The currency a money target starts in: the headline's. */
  defaultCurrency: string | null;
  currencies: string[];
  targets: Pick<GoalTargetsApi, 'save' | 'remove'>;
}) {
  const id = useId();
  const isMoney = HOME_OBJECTIVE_METRICS[objective.metric].unit === 'currency';
  const [target, setTarget] = useState(existing ? String(existing.target) : '');
  const [period, setPeriod] = useState<HomeGoalPeriod>(existing?.period ?? 'month');
  const [periodStart, setPeriodStart] = useState(existing?.periodStart ?? '');
  const [periodEnd, setPeriodEnd] = useState(existing?.periodEnd ?? '');
  const [currency, setCurrency] = useState(existing?.currency ?? defaultCurrency ?? '');
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const built = goalTargetRequest({
      brandId,
      objective,
      target,
      period,
      periodStart,
      periodEnd,
      currency,
    });
    if (!built.ok) {
      setOutcome({ kind: 'failed', message: built.message });
      return;
    }
    setBusy(true);
    const result = await targets.save(built.request);
    setBusy(false);
    setOutcome(result.ok ? { kind: 'saved' } : { kind: 'failed', message: result.message });
  };

  const remove = async () => {
    setBusy(true);
    const result = await targets.remove({
      scope: HOME_PROFILE_BRAND_SCOPE,
      objectiveId: objective.id,
    });
    setBusy(false);
    if (!result.ok) {
      setOutcome({ kind: 'failed', message: result.message });
      return;
    }
    setTarget('');
    setOutcome({ kind: 'removed' });
  };

  return (
    <form
      className="flex min-w-0 flex-col gap-3 rounded-lg border p-3"
      data-testid="home-goals-target-form"
      onChange={() => setOutcome(null)}
      onSubmit={submit}
    >
      <p className="font-medium text-xs">Target for {objective.label.toLowerCase()}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label className={LABEL_CLASS} htmlFor={`${id}-target`}>
            Target
          </label>
          <Input
            className="h-8 text-sm"
            id={`${id}-target`}
            inputMode="decimal"
            min="0"
            onChange={(event) => setTarget(event.target.value)}
            step="any"
            type="number"
            value={target}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label className={LABEL_CLASS} htmlFor={`${id}-period`}>
            Period
          </label>
          <select
            className={SELECT_CLASS}
            id={`${id}-period`}
            onChange={(event) => setPeriod(homeGoalPeriodSchema.parse(event.target.value))}
            value={period}
          >
            {homeGoalPeriodSchema.options.map((option) => (
              <option key={option} value={option}>
                {GOAL_PERIOD_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        {isMoney ? (
          <div className="flex min-w-0 flex-col gap-1">
            <label className={LABEL_CLASS} htmlFor={`${id}-currency`}>
              Currency
            </label>
            <Input
              className="h-8 text-sm uppercase"
              id={`${id}-currency`}
              list={`${id}-currencies`}
              maxLength={3}
              onChange={(event) => setCurrency(event.target.value)}
              value={currency}
            />
            <datalist id={`${id}-currencies`}>
              {currencies.map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
          </div>
        ) : null}
        {period === 'custom' ? (
          <>
            <div className="flex min-w-0 flex-col gap-1">
              <label className={LABEL_CLASS} htmlFor={`${id}-start`}>
                Starts
              </label>
              <Input
                className="h-8 text-sm"
                id={`${id}-start`}
                onChange={(event) => setPeriodStart(event.target.value)}
                type="date"
                value={periodStart}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className={LABEL_CLASS} htmlFor={`${id}-end`}>
                Ends
              </label>
              <Input
                className="h-8 text-sm"
                id={`${id}-end`}
                onChange={(event) => setPeriodEnd(event.target.value)}
                type="date"
                value={periodEnd}
              />
            </div>
          </>
        ) : null}
      </div>
      {outcome?.kind === 'failed' ? (
        <p className="text-destructive-ink text-xs" role="alert">
          {outcome.message}
        </p>
      ) : outcome ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid="home-goals-target-status"
          role="status"
        >
          {outcome.kind === 'saved' ? 'Target saved.' : 'Target removed.'}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-7 text-xs" disabled={busy} size="sm" type="submit">
          Save target
        </Button>
        {existing ? (
          <Button
            className="h-7 text-xs"
            disabled={busy}
            onClick={remove}
            size="sm"
            type="button"
            variant="ghost"
          >
            Remove target
          </Button>
        ) : null}
      </div>
    </form>
  );
}
