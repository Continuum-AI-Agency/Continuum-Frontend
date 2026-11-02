'use client';

// The checkbox under a portfolio's CPA goal: "Use this goal as the cost cap on the ad
// platforms". GoalCostCapControl draws it (label, help, reason, error) and is reused by the
// creation wizard, where it only edits the draft. GoalCostCapField is the settings editor's
// version: it saves on its own the moment it is ticked (optimistic, rolled back on error), apart
// from the settings form's Save. It can only be ticked while the goal is a cost per conversion
// with a value; once ticked, it can always be switched off.

import { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  GOAL_COST_CAP_LABEL,
  goalCostCapAvailability,
  goalCostCapErrorMessage,
  goalCostCapHelp,
} from './goalCostCapModel';
import { useSetGoalAsCostCap } from './useGoalAsCostCap';

type GoalInputs = {
  /** The metric the goal is priced in, as currently selected. */
  targetMetric: string | null | undefined;
  /** The goal as currently entered; null when blank. */
  goal: number | null | undefined;
  /** The portfolio's max_change_pct_per_cycle, a fraction. */
  maxChangePctPerCycle: number | null | undefined;
};

export function GoalCostCapControl({
  id,
  checked,
  onCheckedChange,
  busy = false,
  error = null,
  targetMetric,
  goal,
  maxChangePctPerCycle,
}: GoalInputs & {
  id: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const availability = goalCostCapAvailability({ targetMetric, goal });
  return (
    <div className="flex items-start gap-2.5 pt-1" data-testid="goal-cost-cap">
      <Checkbox
        checked={checked}
        className="mt-0.5"
        disabled={busy || (!checked && !availability.available)}
        id={id}
        onCheckedChange={(on) => onCheckedChange(on === true)}
      />
      <div className="min-w-0 space-y-0.5">
        <label className="block text-foreground text-sm" htmlFor={id}>
          {GOAL_COST_CAP_LABEL}
        </label>
        <p className="text-xs text-muted-foreground">
          {goalCostCapHelp({ enabled: checked, maxChangePctPerCycle })}
        </p>
        {!availability.available ? (
          <p className="text-xs text-muted-foreground">{availability.reason}</p>
        ) : null}
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function GoalCostCapField({
  portfolioId,
  enabled,
  ...inputs
}: GoalInputs & {
  portfolioId: string;
  /** The stored flag (PortfolioListItem.goal_as_platform_cost_cap). */
  enabled: boolean;
}) {
  const setFlag = useSetGoalAsCostCap(portfolioId);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Once the refetched list agrees with the optimistic value, the stored value takes over.
  useEffect(() => {
    if (optimistic !== null && optimistic === enabled) setOptimistic(null);
  }, [enabled, optimistic]);

  function handleChange(next: boolean) {
    setError(null);
    setOptimistic(next);
    setFlag.mutate(next, {
      onSuccess: (result) => setOptimistic(result.goal_as_platform_cost_cap),
      onError: (cause) => {
        setOptimistic(null);
        setError(cause instanceof Error ? cause.message : goalCostCapErrorMessage(cause));
      },
    });
  }

  return (
    <GoalCostCapControl
      {...inputs}
      busy={setFlag.isPending}
      checked={optimistic ?? enabled}
      error={error}
      id={`manage-goal-cost-cap-${portfolioId}`}
      onCheckedChange={handleChange}
    />
  );
}
