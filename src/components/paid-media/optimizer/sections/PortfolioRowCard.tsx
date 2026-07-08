'use client';

// One portfolio row card — objective + mode/apply-mode chips + daily budget +
// pending/clean status. Shared by the Overview "at a glance" list and the
// Portfolios master list.

import type { PortfolioListItem } from '@continuum/contracts';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatCurrency, humanize, portfolioLevelLabel } from '../format';

type PortfolioRowCardProps = {
  portfolio: PortfolioListItem;
  currency?: string | null;
  selected?: boolean;
  onSelect?: () => void;
};

export function PortfolioRowCard({
  portfolio,
  currency,
  selected,
  onSelect,
}: PortfolioRowCardProps) {
  const pending = portfolio.pending_recommendations;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-4 py-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        onSelect && 'hover:border-primary/50 hover:bg-accent/40',
        selected && 'border-primary ring-1 ring-primary',
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight">{portfolio.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{humanize(portfolio.objective)}</span>
          <Badge variant="muted" className="text-3xs font-medium">
            {portfolioLevelLabel(portfolio.level)}
          </Badge>
          <Badge variant="teal" className="text-3xs font-medium">
            {humanize(portfolio.mode)}
          </Badge>
          <Badge variant="outline" className="text-3xs font-medium">
            {humanize(portfolio.apply_mode)}
          </Badge>
          <span>· {portfolio.adset_count} ad sets</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums">
            {formatCurrency(portfolio.daily_total, currency)}
          </p>
          <p className="text-2xs text-muted-foreground">/day</p>
        </div>
        {pending > 0 ? (
          <Badge variant="secondary" className="text-3xs">
            {pending} pending
          </Badge>
        ) : (
          <Badge variant="success" className="text-3xs">
            ✓ clean
          </Badge>
        )}
      </div>
    </button>
  );
}
