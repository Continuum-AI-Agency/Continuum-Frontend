'use client';

// One portfolio's pending-recommendation group in the Actions queue. Reads the
// portfolio's performance report (which carries its pending recommendations) and
// renders an approve/reject row per recommendation.

import type { PortfolioListItem } from '@continuum/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { parseReport, recommendationLabel } from '../reportModel';
import { useOptimizerMutations, useOptimizerPerformance } from '../useOptimizerData';

type OptimizerActionsPortfolioGroupProps = {
  brandId: string;
  adAccountId: string;
  portfolio: PortfolioListItem;
};

export function OptimizerActionsPortfolioGroup({
  brandId,
  adAccountId,
  portfolio,
}: OptimizerActionsPortfolioGroupProps) {
  const performanceQuery = useOptimizerPerformance(portfolio.id);
  const { setStatus } = useOptimizerMutations(brandId, adAccountId);

  const report = parseReport(performanceQuery.data);
  const pending = (report?.recommendations ?? []).filter((rec) => rec.status === 'pending');

  if (performanceQuery.isLoading) {
    return <Skeleton className="h-24 rounded-xl" />;
  }

  if (pending.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold tracking-tight">
        {portfolio.name}
        <Badge variant="secondary" className="text-[10px]">
          {pending.length}
        </Badge>
      </h3>
      <div className="space-y-2">
        {pending.map((rec) => {
          const { label, glyph } = recommendationLabel(rec.kind);
          const isBusy = setStatus.isPending && setStatus.variables?.recommendation_id === rec.id;
          return (
            <div
              key={rec.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-tight">
                  {glyph} {label} ·{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{rec.adset_id}</code>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    {rec.trigger}
                  </Badge>
                  {rec.reason}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 px-3 text-xs"
                  disabled={isBusy}
                  onClick={() =>
                    setStatus.mutate({ recommendation_id: rec.id, status: 'approved' })
                  }
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-3 text-xs"
                  disabled={isBusy}
                  onClick={() =>
                    setStatus.mutate({ recommendation_id: rec.id, status: 'rejected' })
                  }
                >
                  Reject
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
