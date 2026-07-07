'use client';

// Portfolios sub-view — a master list of portfolios and, for the selected one,
// its latest cycle detail: CPA trend, run confidence + reallocation flow, per-
// ad-set CPA with Poisson confidence intervals (the P1 CI feature) + HELD states,
// the audience × angle matrix, and pending recommendations. Mirrors the
// Portfolios tab of the reference-ui-preview spec.

import type { CycleItemRow, PortfolioListItem } from '@continuum/contracts';
import { RefreshCwIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { PortfolioRowCard } from './PortfolioRowCard';

type OptimizerPortfoliosProps = {
  portfolios: PortfolioListItem[];
  selectedPortfolioId: string | null;
  currency?: string | null;
  onSelectPortfolio: (portfolioId: string) => void;
};

function ciCpa(item: CycleItemRow): number | null {
  return item.diagnostics?.ci?.cpa ?? null;
}

export function OptimizerPortfolios({
  portfolios,
  selectedPortfolioId,
  currency,
  onSelectPortfolio,
}: OptimizerPortfoliosProps) {
  const performanceQuery = useOptimizerPerformance(selectedPortfolioId);
  const cpaSeriesQuery = useOptimizerCpaSeries(selectedPortfolioId);
  const angleMatrixQuery = useOptimizerAngleMatrix(selectedPortfolioId);
  const { run } = useOptimizerMutations('', null);

  const report = parseReport(performanceQuery.data);
  const items = report?.latest_items ?? [];
  const recommendations = report?.recommendations ?? [];
  const latestRun = report?.latest_run ?? null;
  const confidence = confidenceBand(latestRun?.confidence?.band);
  const confidenceScore = latestRun?.confidence?.score;

  const maxCiCpa = items.reduce((max, item) => Math.max(max, ciCpa(item) ?? 0), 0) || 1;
  const runUnreachable = run.isError || (run.isSuccess && run.data == null && !run.isPending);

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="space-y-2">
        {portfolios.map((portfolio) => (
          <PortfolioRowCard
            key={portfolio.id}
            portfolio={portfolio}
            currency={currency}
            selected={portfolio.id === selectedPortfolioId}
            onSelect={() => onSelectPortfolio(portfolio.id)}
          />
        ))}
      </div>

      <div className="space-y-3">
        {performanceQuery.isLoading ? (
          <>
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </>
        ) : (
          <>
            {performanceQuery.isError ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
                Live cycle report is unavailable — the optimizer service is offline. Charts below
                show only what&rsquo;s cached.
              </div>
            ) : null}
            <Card className="gap-0 rounded-xl py-0 shadow-none">
              <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-border/70 p-4">
                <CardTitle className="text-sm">Latest cycle</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={confidence.variant} className="text-[10px]">
                    confidence{' '}
                    {typeof confidenceScore === 'number'
                      ? `${Math.round(confidenceScore * 100)}%`
                      : ''}{' '}
                    ({confidence.label.toLowerCase()})
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 gap-1.5 px-2 text-xs"
                    disabled={!selectedPortfolioId || run.isPending}
                    onClick={() => selectedPortfolioId && run.mutate(selectedPortfolioId)}
                  >
                    <RefreshCwIcon className={cn('size-3.5', run.isPending && 'animate-spin')} />
                    Run now
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-1 p-4 text-xs text-muted-foreground">
                {latestRun ? (
                  <span>
                    mode {latestRun.mode} · conservation {latestRun.conserved ? '✓ exact' : '—'} ·
                    allocated {formatCurrency(latestRun.allocated_total ?? null, currency)}
                  </span>
                ) : (
                  <span>No cycle has run yet. Use “Run now” to score this portfolio.</span>
                )}
                {runUnreachable ? (
                  <p className="text-amber-600 dark:text-amber-400">
                    Optimizer service not live yet — scheduled cycles will populate this shortly.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="gap-0 rounded-xl py-0 shadow-none">
              <CardHeader className="border-b border-border/70 p-4">
                <CardTitle className="text-sm">CPA trend</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <CpaTrendChart series={cpaSeriesQuery.data} currency={currency} />
              </CardContent>
            </Card>

            <Card className="gap-0 rounded-xl py-0 shadow-none">
              <CardHeader className="border-b border-border/70 p-4">
                <CardTitle className="text-sm">Reallocation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <ConfidenceGauge confidence={latestRun?.confidence ?? null} />
                <ReallocationFlow items={items} currency={currency} />
              </CardContent>
            </Card>

            <Card className="gap-0 rounded-xl py-0 shadow-none">
              <CardHeader className="border-b border-border/70 p-4">
                <CardTitle className="text-sm">CPA per ad set · with uncertainty</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Bar = 95% confidence interval (Poisson). Narrower = more events = more reliable.
                </p>
              </CardHeader>
              <CardContent className="space-y-2.5 p-4">
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No scored ad sets in the latest cycle.
                  </p>
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
              </CardContent>
            </Card>

            <Card className="gap-0 rounded-xl py-0 shadow-none">
              <CardHeader className="border-b border-border/70 p-4">
                <CardTitle className="text-sm">Audience × angle</CardTitle>
                <p className="text-xs text-muted-foreground">
                  CPA per audience and creative angle.
                </p>
              </CardHeader>
              <CardContent className="p-4">
                <AngleMatrix cells={angleMatrixQuery.data} currency={currency} />
              </CardContent>
            </Card>

            {recommendations.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold tracking-tight">
                  Recommendations ({recommendations.length})
                </h3>
                <div className="space-y-2">
                  {recommendations.map((rec) => {
                    const { label, glyph } = recommendationLabel(rec.kind);
                    return (
                      <div
                        key={rec.id}
                        className="rounded-xl border border-border/70 bg-card px-4 py-3"
                      >
                        <p className="text-sm font-semibold tracking-tight">
                          {glyph} {label} ·{' '}
                          <code className="rounded bg-muted px-1 py-0.5 text-xs">
                            {rec.adset_id}
                          </code>
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px]">
                            {rec.trigger}
                          </Badge>
                          {rec.reason}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
