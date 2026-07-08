'use client';

// One portfolio's latest cycle detail — CPA trend, run confidence + reallocation
// flow, per-ad-set CPA with Poisson confidence intervals + HELD states, the
// audience x angle matrix, and pending recommendations. Extracted from
// OptimizerPortfolios so it can render inline inside a portfolio card's
// "Performance" disclosure. Panels ride the shared OptimizerPanel (calm-dense
// SectionHeader + rounded-lg); offline notices use the warning token.

import type { CycleItemRow } from '@continuum/contracts';
import { RefreshCwIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AngleMatrix } from '../charts/AngleMatrix';
import { ConfidenceGauge } from '../charts/ConfidenceGauge';
import { CpaTrendChart } from '../charts/CpaTrendChart';
import { ReallocationFlow } from '../charts/ReallocationFlow';
import { formatCurrency } from '../format';
import { confidenceBand, parseReport, recommendationLabel } from '../reportModel';
import {
  useOptimizerAngleMatrix,
  useOptimizerCpaSeries,
  useOptimizerMutations,
  useOptimizerPerformance,
} from '../useOptimizerData';
import { CpaConfidenceBar } from './CpaConfidenceBar';
import { OptimizerPanel } from './OptimizerPanel';

type PortfolioPerformancePanelProps = {
  portfolioId: string;
  brandId: string;
  adAccountId: string;
  currency?: string | null;
};

function ciCpa(item: CycleItemRow): number | null {
  return item.diagnostics?.ci?.cpa ?? null;
}

export function PortfolioPerformancePanel({
  portfolioId,
  brandId,
  adAccountId,
  currency,
}: PortfolioPerformancePanelProps) {
  const performanceQuery = useOptimizerPerformance(portfolioId);
  const cpaSeriesQuery = useOptimizerCpaSeries(portfolioId);
  const angleMatrixQuery = useOptimizerAngleMatrix(portfolioId);
  // Run is scoped to the brand + account in context so optimizer-run can verify
  // access (mirrors optimizer-suggest / paid-media-metrics).
  const { run } = useOptimizerMutations(brandId, adAccountId);

  const report = parseReport(performanceQuery.data);
  const items = report?.latest_items ?? [];
  const recommendations = report?.recommendations ?? [];
  const latestRun = report?.latest_run ?? null;
  const confidence = confidenceBand(latestRun?.confidence?.band);
  const confidenceScore = latestRun?.confidence?.score;

  const maxCiCpa = items.reduce((max, item) => Math.max(max, ciCpa(item) ?? 0), 0) || 1;
  const runUnreachable = run.isError || (run.isSuccess && run.data == null && !run.isPending);

  if (performanceQuery.isLoading) {
    return (
      <div role="status" aria-busy="true" className="space-y-3">
        <span className="sr-only">Loading cycle report</span>
        <Skeleton className="h-20 rounded-lg bg-muted/70" />
        <Skeleton className="h-40 rounded-lg bg-muted/70" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {performanceQuery.isError ? (
        <p
          role="status"
          className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning"
        >
          Live cycle report is unavailable — the optimizer service is offline. Charts below show
          cached values only.
        </p>
      ) : null}

      <OptimizerPanel
        title="Latest cycle"
        meta={
          <Badge variant={confidence.variant} className="text-3xs">
            confidence{' '}
            {typeof confidenceScore === 'number' ? `${Math.round(confidenceScore * 100)}%` : ''} (
            {confidence.label.toLowerCase()})
          </Badge>
        }
        action={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={run.isPending}
            onClick={() => run.mutate(portfolioId)}
          >
            <RefreshCwIcon
              className={cn('size-3.5', run.isPending && 'animate-spin')}
              aria-hidden="true"
            />
            Run now
          </Button>
        }
      >
        <div className="space-y-1 text-xs text-muted-foreground">
          {latestRun ? (
            <span>
              mode {latestRun.mode} · conservation {latestRun.conserved ? '✓ exact' : '—'} ·
              allocated {formatCurrency(latestRun.allocated_total ?? null, currency)}
            </span>
          ) : (
            <span>No cycle has run yet — use Run now to score this portfolio.</span>
          )}
          {runUnreachable ? (
            <p className="text-warning">
              Optimizer service not live yet — scheduled cycles will populate this shortly.
            </p>
          ) : null}
        </div>
      </OptimizerPanel>

      <OptimizerPanel title="CPA trend">
        <CpaTrendChart series={cpaSeriesQuery.data} currency={currency} />
      </OptimizerPanel>

      <OptimizerPanel title="Reallocation" bodyClassName="space-y-4">
        <ConfidenceGauge confidence={latestRun?.confidence ?? null} />
        <ReallocationFlow items={items} currency={currency} />
      </OptimizerPanel>

      <OptimizerPanel
        title="CPA per ad set"
        meta={
          <span className="text-3xs text-muted-foreground">95% CI · narrower = more events</span>
        }
        bodyClassName="space-y-2.5"
      >
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No scored ad sets in the latest cycle.</p>
        ) : (
          items.map((item) => (
            <CpaConfidenceBar
              key={item.adset_id}
              item={item}
              maxCpa={maxCiCpa}
              currency={currency}
            />
          ))
        )}
      </OptimizerPanel>

      <OptimizerPanel
        title="Audience × angle"
        meta={<span className="text-3xs text-muted-foreground">CPA per audience &amp; angle</span>}
      >
        <AngleMatrix cells={angleMatrixQuery.data} currency={currency} />
      </OptimizerPanel>

      {recommendations.length > 0 ? (
        <section className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recommendations ({recommendations.length})
          </p>
          <div className="space-y-2">
            {recommendations.map((rec) => {
              const { label, glyph } = recommendationLabel(rec.kind);
              return (
                <div key={rec.id} className="rounded-lg border border-border/70 bg-card px-4 py-3">
                  <p className="text-sm font-semibold tracking-tight">
                    {glyph} {label} ·{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">{rec.adset_id}</code>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-3xs">
                      {rec.trigger}
                    </Badge>
                    {rec.reason}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
