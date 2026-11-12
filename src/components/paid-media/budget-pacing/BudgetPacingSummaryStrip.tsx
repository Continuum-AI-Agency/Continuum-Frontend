'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Progress } from '@/components/ui/progress';
import type { BudgetPacingResponse } from '@/lib/schemas/budgetPacing';
import { cn } from '@/lib/utils';
import { BudgetPacingStatusBadge } from './BudgetPacingStatusBadge';
import {
  formatBudgetPacingPercent,
  formatBudgetPacingCurrency as formatCurrency,
} from './budgetPacingPresentation';

type Props = {
  data: BudgetPacingResponse;
  activeKey?: BudgetPacingSummaryCardKey;
};

export type BudgetPacingSummaryCardKey = 'budget' | 'spend' | 'remaining' | 'pace';

type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  subLabel?: React.ReactNode;
  progressValue: number;
  valueClassName?: string;
  active?: boolean;
};

function KpiCard({ label, value, subLabel, progressValue, valueClassName, active }: KpiCardProps) {
  return (
    <div
      className={cn(
        'flex min-h-[4.5rem] flex-col gap-1.5 rounded-lg border border-border/60 bg-background/80 p-2.5',
        active && 'ring-1 ring-primary bg-accent/10',
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold tabular-nums leading-none', valueClassName)}>
        {value}
      </p>
      {subLabel && <p className="text-xs text-muted-foreground">{subLabel}</p>}
      <Progress value={Math.min(100, progressValue)} className="h-1" />
    </div>
  );
}

export function BudgetPacingSummaryStrip({ data, activeKey }: Props) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const { summary } = data;
  const isDaily = summary.accountBudgetPeriod === 'daily';
  const isLifetime = summary.accountBudgetPeriod === 'lifetime';

  // For daily accounts: compare today's spend to daily budget cap
  // For lifetime accounts: compare all-time spend to total budget
  const spendValue = isDaily ? summary.totalTodaySpend : summary.totalSpend;
  const spentPct = summary.totalBudget > 0 ? (spendValue / summary.totalBudget) * 100 : 0;

  const remainingPct =
    summary.totalBudget > 0 ? (summary.totalBudgetRemaining / summary.totalBudget) * 100 : 0;

  const isRemainingCritical =
    isLifetime &&
    summary.totalBudget > 0 &&
    summary.totalBudgetRemaining / summary.totalBudget < 0.1;

  const budgetLabel = uiText(
    isDaily ? 'budgetDailyBudgetCap' : isLifetime ? 'budgetTotalBudget' : 'budget_1c6225e',
  );
  const spendLabel = uiText(isDaily ? 'budgetTodaySpend' : 'budgetSpendToDate');
  const remainingLabel = uiText(isDaily ? 'budgetTodayRemaining' : 'remaining_f3e4352');

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <KpiCard
        label={budgetLabel}
        value={summary.totalBudget > 0 ? formatCurrency(summary.totalBudget, uiLocale) : '—'}
        subLabel={isDaily ? uiText('per_day_489b7ab') : undefined}
        progressValue={100}
        active={activeKey === 'budget'}
      />

      <KpiCard
        label={spendLabel}
        value={formatCurrency(spendValue, uiLocale)}
        subLabel={
          summary.totalBudget > 0
            ? uiText('budgetPercentOfCap', {
                percentage: formatBudgetPacingPercent(Math.min(spentPct, 999), uiLocale),
              })
            : undefined
        }
        progressValue={spentPct}
        active={activeKey === 'spend'}
      />

      <KpiCard
        label={remainingLabel}
        value={
          summary.totalBudget > 0 ? formatCurrency(summary.totalBudgetRemaining, uiLocale) : '—'
        }
        valueClassName={isRemainingCritical ? 'text-red-500' : undefined}
        progressValue={remainingPct}
        active={activeKey === 'remaining'}
      />

      <KpiCard
        label={uiText('pace_9582b50')}
        value={
          <span className="flex items-center gap-2">
            {formatBudgetPacingPercent(summary.overallPacePct, uiLocale)}
            <BudgetPacingStatusBadge status={summary.paceStatus} />
          </span>
        }
        progressValue={Math.min(100, summary.overallPacePct)}
        active={activeKey === 'pace'}
      />
    </div>
  );
}
