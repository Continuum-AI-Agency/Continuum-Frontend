'use client';

// The full-screen Portfolio detail — the optimizer's command center for ONE
// portfolio. It composes the whole viz language against real reads: the hero CPA
// timeline with its projection + action pins, the confidence radar, the pacing
// gauge, the objective-aware conversion funnel, the reallocation flow, the
// audience × angle heatmap, per-ad-set CPA confidence intervals, and an ad-set
// drill-in that charts each creative (with hover cards) plus its ROAS
// profitability. Every panel degrades to its own empty state, so a portfolio with
// thin data still reads as one coherent instrument rather than blank space.

import {
  type CycleItemRow,
  getOptimizationMetricDefinition,
  type PortfolioLevel,
  type PortfolioListItem,
} from '@continuum/contracts';
import { ArrowLeftIcon, RefreshCwIcon } from 'lucide-react';
import { MetricStrip } from '@/components/shared/MetricStrip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ApplyModePill } from '../ApplyModePill';
import { AdSetTimeline } from '../charts/AdSetTimeline';
import { AdsetActionMenu } from '../charts/AdsetActionMenu';
import { AngleMatrix } from '../charts/AngleMatrix';
import { CpaHeroTimeline } from '../charts/CpaHeroTimeline';
import { splitReallocation } from '../charts/chartData';
import { FunnelConversion } from '../charts/FunnelConversion';
import { PacingGauge } from '../charts/PacingGauge';
import { ReallocationFlow } from '../charts/ReallocationFlow';
import { RoasProfitLine } from '../charts/RoasProfitLine';
import { ScoreRadar } from '../charts/ScoreRadar';
import { adSetRoasSeries, buildCycleActionMap, sumFunnelWindow } from '../charts/vizData';
import { formatCurrency, humanize, portfolioLevelLabel } from '../format';
import { applyModeExplainer, confidenceBand, parseReport } from '../reportModel';
import {
  useOptimizerAccountSnapshots,
  useOptimizerAdAngles,
  useOptimizerAdDailyTrends,
  useOptimizerAdsetAds,
  useOptimizerAngleMatrix,
  useOptimizerCpaSeries,
  useOptimizerEnrolledAdsets,
  useOptimizerFirstRunPoll,
  useOptimizerMutations,
  useOptimizerPerformance,
} from '../useOptimizerData';
import type { OptimizerAdMetric } from '../useOptimizerUrlState';
import { ApplyReallocationDialog } from './ApplyReallocationDialog';
import { CpaConfidenceBar } from './CpaConfidenceBar';
import { HeldChangesPanel } from './HeldChangesPanel';
import { OptimizerPanel } from './OptimizerPanel';
import { RunOutcomeNotice } from './RunOutcomeNotice';

type PortfolioDetailWorkspaceProps = {
  portfolio: PortfolioListItem;
  brandId: string;
  adAccountId: string;
  currency?: string | null;
  onClose: () => void;
  selectedAdsetId: string | null;
  onSelectAdset: (adsetId: string | null) => void;
  chartMetric: OptimizerAdMetric;
  onMetricChange: (metric: OptimizerAdMetric) => void;
};

function ciCpa(item: CycleItemRow): number | null {
  return item.diagnostics?.ci?.cpa ?? null;
}

export function PortfolioDetailWorkspace({
  portfolio,
  brandId,
  adAccountId,
  currency,
  onClose,
  selectedAdsetId,
  onSelectAdset,
  chartMetric,
  onMetricChange,
}: PortfolioDetailWorkspaceProps) {
  // Campaign portfolios enroll campaigns: read the matching snapshot scope so the
  // conversion-funnel sum (keyed by the enrolled entity id) resolves. The cycle
  // charts are entity-agnostic (keyed by entity id) and need no level.
  const level = (portfolio.level as PortfolioLevel) ?? 'adset';
  const performanceQuery = useOptimizerPerformance(portfolio.id);
  const cpaSeriesQuery = useOptimizerCpaSeries(portfolio.id);
  const angleMatrixQuery = useOptimizerAngleMatrix(portfolio.id);
  const enrolledQuery = useOptimizerEnrolledAdsets(portfolio.id);
  const snapshotsQuery = useOptimizerAccountSnapshots(brandId, adAccountId, level);
  const { run, archive } = useOptimizerMutations(brandId, adAccountId);

  const report = parseReport(performanceQuery.data);
  const items = report?.latest_items ?? [];
  const latestRun = report?.latest_run ?? null;
  // A freshly-enrolled portfolio has no cycle yet. The create path kicked off a run
  // and the scheduler backstops it (next_realloc_at=now), so poll the performance
  // read until the first result lands rather than leaving the user on empty panels.
  //
  // A SKIPPED run ends the wait. "Scoring your first cycle…" used to spin forever on a
  // portfolio with nothing enrolled, because no cycle would ever arrive to stop it — the
  // spinner promised a result that could not exist.
  const awaitingFirstCycle = !latestRun && run.data?.status !== 'skipped';
  useOptimizerFirstRunPoll(awaitingFirstCycle, performanceQuery.refetch);
  const confidence = confidenceBand(latestRun?.confidence?.band);
  // Offer the manual apply only when there are actual moves and the portfolio is in
  // recommend mode (observe hard-halts Meta writes; autopilot applies automatically).
  // runId pins the apply to this run.
  const reallocation = splitReallocation(items);
  const movedCount = reallocation.gaining.length + reallocation.losing.length;
  const canApplyReallocation = portfolio.apply_mode === 'recommend' && movedCount > 0;
  const latestRunId = (latestRun as { id?: string } | null)?.id;
  const confidenceScore = latestRun?.confidence?.score;
  const actionsByTs = buildCycleActionMap(report);
  const pacing = (latestRun as { pacing?: unknown } | null)?.pacing ?? null;
  const metric = getOptimizationMetricDefinition(portfolio.objective);

  const funnelWindow = sumFunnelWindow(
    snapshotsQuery.data,
    enrolledQuery.data.map((adset) => adset.adset_id),
  );
  const maxCiCpa =
    items.reduce(
      (max, item) => Math.max(max, (ciCpa(item) ?? 0) * metric.denominatorMultiplier),
      0,
    ) || 1;

  const dailyTrendsQuery = useOptimizerAdDailyTrends(brandId, adAccountId, selectedAdsetId);
  const adsetAdsQuery = useOptimizerAdsetAds(brandId, adAccountId, selectedAdsetId);
  const adAnglesQuery = useOptimizerAdAngles(brandId, adAccountId, selectedAdsetId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-border/70 border-b bg-muted/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            aria-label="Back to portfolios"
            className="size-8 shrink-0"
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowLeftIcon className="size-4" />
          </Button>
          <AdsetActionMenu
            label={portfolio.name}
            onArchive={() => {
              archive.mutate(portfolio.id);
              onClose();
            }}
            onRun={() => run.mutate(portfolio.id)}
          >
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2 truncate font-semibold text-sm tracking-tight">
                <span className="truncate">{portfolio.name}</span>
                <Badge className="text-3xs" variant="teal">
                  {humanize(portfolio.mode)}
                </Badge>
                <ApplyModePill
                  applyMode={portfolio.apply_mode}
                  autopilotPaused={portfolio.autopilot_paused}
                />
              </h2>
              <p className="text-3xs text-muted-foreground">
                {humanize(portfolio.objective)} · right-click for actions
              </p>
            </div>
          </AdsetActionMenu>
        </div>
        <Button
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={run.isPending}
          onClick={() => run.mutate(portfolio.id)}
          size="sm"
          type="button"
          variant="secondary"
        >
          <RefreshCwIcon className={cn('size-3.5', run.isPending && 'animate-spin')} />
          Run now
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {/* Both "Run now" triggers in this workspace used to fire into a void — no success,
            no skip reason, no error. */}
        <RunOutcomeNotice outcome={run.data} isPending={run.isPending} />

        {awaitingFirstCycle ? (
          <div
            role="status"
            aria-busy="true"
            className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-xs text-foreground"
          >
            <RefreshCwIcon className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
            <span>
              Scoring your first cycle — this can take up to a couple of minutes. Results appear
              here automatically; you can keep working.
            </span>
          </div>
        ) : null}

        <MetricStrip
          items={[
            { label: 'Daily budget', value: formatCurrency(portfolio.daily_total, currency) },
            { label: portfolioLevelLabel(level), value: String(portfolio.adset_count) },
            { label: 'Pending', value: String(portfolio.pending_recommendations) },
            {
              label: 'Confidence',
              value:
                typeof confidenceScore === 'number' ? `${Math.round(confidenceScore * 100)}%` : '—',
            },
          ]}
        />

        <OptimizerPanel
          meta={
            <span className="text-3xs text-muted-foreground">
              hover a cycle for its metrics + actions
            </span>
          }
          title={`${metric.costLabel} timeline`}
        >
          <CpaHeroTimeline
            actionsByTs={actionsByTs}
            confidenceBand={latestRun?.confidence?.band}
            currency={currency}
            objective={portfolio.objective}
            series={cpaSeriesQuery.data}
            targetCpa={
              ((portfolio as { cpa_target?: number | null }).cpa_target ?? 0) *
                metric.denominatorMultiplier || null
            }
          />
        </OptimizerPanel>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <OptimizerPanel
            meta={
              <Badge className="text-3xs" variant={confidence.variant}>
                {confidence.label.toLowerCase()}
              </Badge>
            }
            title="Confidence"
          >
            <ScoreRadar
              band={latestRun?.confidence?.band}
              confidence={latestRun?.confidence ?? null}
            />
          </OptimizerPanel>

          <OptimizerPanel title="Pacing">
            <PacingGauge currency={currency} pacing={pacing as never} />
          </OptimizerPanel>

          <OptimizerPanel
            meta={<span className="text-3xs text-muted-foreground">step conversion · 7d</span>}
            title="Conversion funnel"
          >
            <FunnelConversion objective={portfolio.objective} window={funnelWindow} />
          </OptimizerPanel>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <OptimizerPanel
            action={
              canApplyReallocation ? (
                <ApplyReallocationDialog
                  accountId={adAccountId}
                  brandId={brandId}
                  currency={currency ?? null}
                  portfolioId={portfolio.id}
                  runId={latestRunId}
                />
              ) : null
            }
            bodyClassName="space-y-2"
            title="Reallocation"
          >
            <p className="text-3xs text-muted-foreground">
              {applyModeExplainer(portfolio.apply_mode)}
            </p>
            <ReallocationFlow currency={currency} items={items} />
            <HeldChangesPanel
              adAccountId={adAccountId}
              brandId={brandId}
              currency={currency}
              items={items}
              portfolioId={portfolio.id}
              runId={latestRunId ?? null}
            />
          </OptimizerPanel>
          <OptimizerPanel
            meta={
              <span className="text-3xs text-muted-foreground">
                {metric.costLabel} per audience &amp; angle
              </span>
            }
            title="Audience × angle"
          >
            <AngleMatrix
              cells={angleMatrixQuery.data}
              currency={currency}
              objective={portfolio.objective}
            />
          </OptimizerPanel>
        </div>

        <OptimizerPanel
          bodyClassName="space-y-2.5"
          meta={
            <span className="text-3xs text-muted-foreground">
              click an ad set to drill in · 95% CI
            </span>
          }
          title={`${metric.costLabel} per ad set`}
        >
          {items.length === 0 ? (
            <p className="text-muted-foreground text-xs">No scored ad sets in the latest cycle.</p>
          ) : (
            items.map((item) => (
              <AdsetActionMenu
                key={item.adset_id}
                label={item.adset_id.split('::').pop() ?? item.adset_id}
                onHold={() => undefined}
              >
                <button
                  className={cn(
                    'w-full rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/40',
                    selectedAdsetId === item.adset_id && 'bg-muted/60 ring-1 ring-ring',
                  )}
                  onClick={() =>
                    onSelectAdset(selectedAdsetId === item.adset_id ? null : item.adset_id)
                  }
                  type="button"
                >
                  <CpaConfidenceBar
                    currency={currency}
                    denominatorMultiplier={metric.denominatorMultiplier}
                    item={item}
                    maxCpa={maxCiCpa}
                  />
                </button>
              </AdsetActionMenu>
            ))
          )}
        </OptimizerPanel>

        {selectedAdsetId ? (
          <>
            <OptimizerPanel
              meta={
                <span className="text-3xs text-muted-foreground">
                  {selectedAdsetId.split('::').pop()}
                </span>
              }
              title="Creatives"
            >
              <AdSetTimeline
                ads={adsetAdsQuery.data}
                angles={adAnglesQuery.data}
                currency={currency}
                metric={chartMetric}
                onMetricChange={onMetricChange}
                trends={dailyTrendsQuery.data}
              />
            </OptimizerPanel>
            <OptimizerPanel
              meta={<span className="text-3xs text-muted-foreground">ROAS vs break-even</span>}
              title="Ad-set profitability"
            >
              <RoasProfitLine points={adSetRoasSeries(dailyTrendsQuery.data)} />
            </OptimizerPanel>
          </>
        ) : null}
      </div>
    </div>
  );
}
