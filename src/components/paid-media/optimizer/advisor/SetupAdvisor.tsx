'use client';

// What your selection will actually DO, said before you create the portfolio.
//
// Surfaced as an ALWAYS-VISIBLE hint under the Budget and Target fields, plus an issue list —
// not as a hover tooltip. A tooltip is a container you have to discover, and the payload here
// is an ACTION (fill this field, deselect those ad sets), not an explanation. The reason nobody
// knew the CPA field silently defaults to $50 is precisely that nothing was ever shown.
//
// The numbers are 100% deterministic (adviseSetup, in @continuum/contracts). They are what the
// user is about to type onto a live ad account, so they are never model-generated.
//
// The LLM is garnish and nothing more: hovering the dotted underline on a SETTLED issue asks
// optimizer-insight to rephrase the deterministic sentence. It fires on hover only — never on a
// checkbox click, never on a keystroke — which is what keeps a per-selection read-through cache
// from turning into a Gemini call per click. The deterministic message is always rendered, and
// optimizer-insight already falls back to it when Gemini is unavailable.

import type { AdSetSnapshot, OptimizationModeDto } from '@continuum/contracts';
import {
  adviseSetup,
  type OptimizationObjective,
  type SetupAdvice,
  type SetupAdviceIssue,
} from '@continuum/contracts';
import { useMemo, useState } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '../format';
import { useOptimizerInsight } from '../useOptimizerData';

/** The deterministic sentence is ALWAYS what is rendered; the model only rephrases it on hover.
 *  Mirrors RecommendationInsight's progressive-enhancement contract exactly. */
function IssueText({ brandId, issue }: { brandId: string; issue: SetupAdviceIssue }) {
  const [open, setOpen] = useState(false);
  const insight = useOptimizerInsight(
    {
      brandId,
      adsetId: '',
      kind: 'setup_advice',
      trigger: issue.code,
      severity: issue.severity,
      reason: issue.message,
    },
    open,
  );

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={120} closeDelay={80}>
      <HoverCardTrigger
        render={
          <span className="cursor-help underline decoration-dotted underline-offset-2">
            {issue.message}
          </span>
        }
      />
      <HoverCardContent className="w-72 text-xs">
        {insight.isLoading ? (
          <Skeleton className="h-8 bg-muted/70" />
        ) : (
          (insight.data?.insight ?? issue.message)
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

function Hint({
  label,
  value,
  onUse,
  disabled,
}: {
  label: string;
  value: string;
  onUse: () => void;
  disabled?: boolean;
}) {
  return (
    <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
      <span className="truncate">
        Suggested <span className="font-medium text-foreground tabular-nums">{value}</span> —{' '}
        {label}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={onUse}
        className="h-5 shrink-0 gap-1 px-1.5 text-2xs"
      >
        Use
        <span
          aria-hidden="true"
          className="rounded border border-border/70 bg-background px-1 text-3xs"
        >
          ⇥
        </span>
      </Button>
    </p>
  );
}

export function useSetupAdvice({
  snapshots,
  selectedIds,
  objective,
  mode,
  dailyTotal,
  target,
}: {
  snapshots: AdSetSnapshot[];
  selectedIds: string[];
  objective: OptimizationObjective;
  mode: OptimizationModeDto;
  dailyTotal: string;
  target: string;
}): SetupAdvice {
  return useMemo(() => {
    const ids = new Set(selectedIds);
    const parsed = (value: string) => {
      const n = Number.parseFloat(value);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    return adviseSetup({
      snapshots: snapshots.filter((snapshot) => ids.has(snapshot.id)),
      objective,
      mode,
      typedDailyTotal: parsed(dailyTotal),
      typedTarget: parsed(target),
    });
  }, [snapshots, selectedIds, objective, mode, dailyTotal, target]);
}

/** The one-line hint that lives under the Daily budget input. */
export function BudgetHint({
  advice,
  currency,
  onUse,
  disabled,
}: {
  advice: SetupAdvice;
  currency: string | null;
  onUse: (value: string) => void;
  disabled?: boolean;
}) {
  if (advice.suggestedDailyTotal == null) return null;
  return (
    <Hint
      label={`what these ${advice.selectedCount} ad sets run today`}
      value={`${formatCurrency(advice.suggestedDailyTotal, currency)}/day`}
      disabled={disabled}
      onUse={() => onUse(String(advice.suggestedDailyTotal))}
    />
  );
}

/** The one-line hint that lives under the CPA/CPL/CPM input. */
export function TargetHint({
  advice,
  currency,
  onUse,
  disabled,
}: {
  advice: SetupAdvice;
  currency: string | null;
  onUse: (value: string) => void;
  disabled?: boolean;
}) {
  if (advice.suggestedTarget == null) return null;
  return (
    <Hint
      label="the blended actual across your selection"
      value={formatCurrency(advice.suggestedTarget, currency)}
      disabled={disabled}
      onUse={() => onUse(String(advice.suggestedTarget))}
    />
  );
}

export function SetupAdvisor({
  advice,
  brandId,
  selectedIds,
  disabled,
  onChangeSelection,
  onUseBudget,
  onUseTarget,
}: {
  advice: SetupAdvice;
  brandId: string;
  selectedIds: string[];
  disabled?: boolean;
  onChangeSelection: (ids: string[]) => void;
  onUseBudget: (value: string) => void;
  onUseTarget: (value: string) => void;
}) {
  if (advice.issues.length === 0) return null;

  // The repair is what makes a warning worth reading. Every issue that names ad sets can
  // deselect them; the budget/target issues can fill the field they are about.
  const repair = (issue: SetupAdviceIssue) => {
    if (issue.code === 'kpi_mismatch' || issue.code === 'zero_delivery') {
      const drop = new Set(issue.adsetIds);
      return {
        label: `Deselect ${issue.adsetIds.length}`,
        run: () => onChangeSelection(selectedIds.filter((id) => !drop.has(id))),
      };
    }
    if (issue.code === 'target_defaulted' && advice.suggestedTarget != null) {
      return {
        label: `Use ${advice.suggestedTarget}`,
        run: () => onUseTarget(String(advice.suggestedTarget)),
      };
    }
    if (issue.code === 'budget_below_current' && advice.suggestedDailyTotal != null) {
      return {
        label: `Use ${advice.suggestedDailyTotal}`,
        run: () => onUseBudget(String(advice.suggestedDailyTotal)),
      };
    }
    return null;
  };

  return (
    <ul className="space-y-1.5">
      {advice.issues.map((issue) => {
        const action = repair(issue);
        return (
          <li key={issue.code} className="flex items-start gap-1.5 text-2xs leading-relaxed">
            <Pill
              variant={issue.severity === 'warn' ? 'warning' : 'secondary'}
              className="mt-px shrink-0 text-3xs"
            >
              {issue.severity === 'warn' ? 'Check' : 'FYI'}
            </Pill>
            <span className="min-w-0 text-muted-foreground">
              <IssueText brandId={brandId} issue={issue} />
              {action ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={action.run}
                  className="ml-1 h-5 px-1.5 text-2xs"
                >
                  {action.label}
                </Button>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
