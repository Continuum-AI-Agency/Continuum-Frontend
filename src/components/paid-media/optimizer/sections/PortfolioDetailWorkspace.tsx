'use client';

// The full-screen Portfolio detail — the optimizer's command center for ONE
// portfolio. It composes the whole viz language against real reads: the hero CPA
// timeline with its projection + action pins, the confidence radar, the pacing
// gauge, the objective-aware conversion funnel, the reallocation flow, the
// audience × angle heatmap, per-ad-set CPA confidence intervals, and an ad-set
// drill-in that charts each creative (with hover cards) plus its ROAS
// profitability. Every panel degrades to its own empty state, so a portfolio with
// thin data still reads as one coherent instrument rather than blank space.
//
// Each ad-set row also expands in place to its own ads and their kill/scale/
// iterate verdicts, so the creative call sits next to the budget move being made
// on that ad set. The expansion is one ad set at a time — the ad-level read is
// lazy and a portfolio can hold dozens of ad sets.

import {
  getOptimizationMetricDefinition,
  type OptimizationObjective,
  type PortfolioLevel,
  type PortfolioListItem,
} from '@continuum/contracts';
import { ArrowLeftIcon, LineChartIcon, RefreshCwIcon } from 'lucide-react';
import { InsightDataTable } from '@/components/dashboard/datatable/InsightDataTable';
import { MetricStrip } from '@/components/shared/MetricStrip';
import { DataState } from '@/components/shared/state/DataState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ApplyModePill } from '../ApplyModePill';
import { AdSetTimeline } from '../charts/AdSetTimeline';
import { AdsetActionMenu } from '../charts/AdsetActionMenu';
import { AngleMatrix } from '../charts/AngleMatrix';
import { ChartError, ChartSkeleton } from '../charts/ChartStates';
import { ConfidenceBadge } from '../charts/ConfidenceBadge';
import { CpaHeroTimeline } from '../charts/CpaHeroTimeline';
import { splitReallocation } from '../charts/chartData';
import { maxCiUpperBound } from '../charts/chartScale';
import { chartStatus, combinedChartStatus } from '../charts/chartStatus';
import { FunnelConversion } from '../charts/FunnelConversion';
import { PacingGauge } from '../charts/PacingGauge';
import { ReallocationFlow } from '../charts/ReallocationFlow';
import { RoasProfitLine } from '../charts/RoasProfitLine';
import { ScoreRadar } from '../charts/ScoreRadar';
import {
  adSetRoasSeries,
  buildCycleActionMap,
  DEFAULT_PACING_PERIOD_DAYS,
  sumFunnelWindow,
} from '../charts/vizData';
import { formatCurrency, humanize, portfolioLevelLabel } from '../format';
import { costCiLegend, itemToRow, kpiColumns } from '../kpiColumns';
import { applyModeExplainer, parseReport } from '../reportModel';
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
import type { OptimizerAdMetric, WorkspaceSection } from '../useOptimizerUrlState';
import { AdsetCreativeVerdicts } from './AdsetCreativeVerdicts';
import { ApplyReallocationDialog } from './ApplyReallocationDialog';
import { OptimizerActionsPortfolioGroup } from './OptimizerActionsPortfolioGroup';
import { OptimizerPanel } from './OptimizerPanel';
import { PortfolioManagePanel } from './PortfolioManagePanel';
import { RunOutcomeNotice } from './RunOutcomeNotice';
import { SignalReadinessCard } from './SignalReadinessCard';

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
  section: WorkspaceSection;
  onSectionChange: (section: WorkspaceSection) => void;
};

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
  section,
  onSectionChange,
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
  const { run, archive, update } = useOptimizerMutations(brandId, adAccountId);

  const report = parseReport(performanceQuery.data);
  const items = report?.latest_items ?? [];
  const latestRun = report?.latest_run ?? null;
  // A scored cycle that raised nothing is a legitimate outcome, not a blank page.
  // When a run landed but produced zero recommendations, explain why off the same
  // account snapshots the engine scores (frozen kpi_mismatch, too-young account,
  // no tracked events) rather than leaving the surface unexplained.
  const noRecommendations = Boolean(latestRun) && (report?.recommendations.length ?? 0) === 0;
  // A freshly-enrolled portfolio has no cycle yet. The create path kicked off a run
  // and the scheduler backstops it (next_realloc_at=now), so poll the performance
  // read until the first result lands rather than leaving the user on empty panels.
  //
  // A SKIPPED run ends the wait. "Scoring your first cycle…" used to spin forever on a
  // portfolio with nothing enrolled, because no cycle would ever arrive to stop it — the
  // spinner promised a result that could not exist.
  const awaitingFirstCycle = !latestRun && run.data?.status !== 'skipped';
  useOptimizerFirstRunPoll(awaitingFirstCycle, performanceQuery.refetch);
  // Offer the manual apply only when there are actual moves and the portfolio is in
  // recommend mode (observe hard-halts Meta writes; autopilot applies automatically).
  // runId pins the apply to this run.
  const reallocation = splitReallocation(items);
  const movedCount = reallocation.gaining.length + reallocation.losing.length;
  const canApplyReallocation = portfolio.apply_mode === 'recommend' && movedCount > 0;
  // Observe is only worth interrupting for once the engine has actually produced
  // moves it is being prevented from making. Before that it is just the mode.
  const isObserveWithMoves = portfolio.apply_mode === 'observe' && movedCount > 0;
  const latestRunId = (latestRun as { id?: string } | null)?.id;
  const confidenceScore = latestRun?.confidence?.score;
  const actionsByTs = buildCycleActionMap(report);
  const pacing = (latestRun as { pacing?: unknown } | null)?.pacing ?? null;
  const metric = getOptimizationMetricDefinition(portfolio.objective);
  // Human ad-set names for the action surface. The enrolled roster stores each name
  // at enroll time, so raw Meta ids never have to leak into the labels; falls back
  // to the id wherever a name is unknown.
  const adsetNameById = new Map(
    enrolledQuery.data.map((adset) => [adset.adset_id, adset.adset_name ?? '']),
  );

  const funnelWindow = sumFunnelWindow(
    snapshotsQuery.data,
    enrolledQuery.data.map((adset) => adset.adset_id),
  );
  const maxCiCpa = maxCiUpperBound(items, metric.denominatorMultiplier);

  // The KPI-adaptive cost-per-ad-set table: each cycle item joined to its account
  // snapshot for the objective's spend/results, resolved to a human name, and given
  // the shared CI scale so the cost cell's confidence bars line up across rows.
  const snapshotById = new Map(snapshotsQuery.data.map((snapshot) => [snapshot.id, snapshot]));
  const adsetRows = items.map((item) =>
    itemToRow(item, {
      metric,
      snapshot: snapshotById.get(item.adset_id) ?? null,
      nameById: adsetNameById,
    }),
  );
  const adsetColumns = kpiColumns({ currency, maxCiCost: maxCiCpa, metric });

  // Period budget: real when set, else estimated from the daily budget so the KPI
  // strip always shows a figure (never "not set").
  const periodBudgetEstimated = !(
    typeof portfolio.period_budget === 'number' && portfolio.period_budget > 0
  );
  const periodBudgetValue = periodBudgetEstimated
    ? portfolio.daily_total != null
      ? portfolio.daily_total * DEFAULT_PACING_PERIOD_DAYS
      : null
    : portfolio.period_budget;

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

      {/* Internal sections — a shallow, instant swap (no server round-trip). Performance
          is the whole cycle instrument; Manage edits config; Activity is the approvals
          slot a later agent fills with the executing Action Log. */}
      <Tabs
        value={section}
        onValueChange={(value) => onSectionChange(value as WorkspaceSection)}
        className="min-h-0 flex-1"
      >
        <TabsList className="mx-3 mt-2 h-8 w-fit shrink-0">
          <TabsTrigger value="performance" className="px-3 text-xs">
            Performance
          </TabsTrigger>
          <TabsTrigger value="manage" className="px-3 text-xs">
            Manage
          </TabsTrigger>
          <TabsTrigger value="activity" className="px-3 text-xs">
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="min-h-0 space-y-3 overflow-y-auto p-3">
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

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <MetricStrip
              items={[
                {
                  label: 'Allocated',
                  value: formatCurrency(latestRun?.allocated_total ?? null, currency),
                },
                { label: 'Daily budget', value: formatCurrency(portfolio.daily_total, currency) },
                {
                  label: 'Period budget',
                  value:
                    periodBudgetValue != null
                      ? `${formatCurrency(periodBudgetValue, currency)}${periodBudgetEstimated ? ' est.' : ''}`
                      : '—',
                },
                {
                  label: 'Optimizing for',
                  value: `${humanize(portfolio.objective)} · ${metric.resultLabel}`,
                },
                { label: portfolioLevelLabel(level), value: String(portfolio.adset_count) },
                { label: 'Pending', value: String(portfolio.pending_recommendations) },
              ]}
            />
            <span className="inline-flex items-center gap-1.5">
              <span className="text-2xs text-muted-foreground uppercase tracking-wide">
                Confidence
              </span>
              <ConfidenceBadge band={latestRun?.confidence?.band} score={confidenceScore} />
            </span>
          </div>

          {noRecommendations ? (
            <SignalReadinessCard
              objective={portfolio.objective as OptimizationObjective}
              snapshots={snapshotsQuery.data}
            />
          ) : null}

          <OptimizerPanel
            meta={
              <span className="text-3xs text-muted-foreground">
                hover a cycle for its metrics + actions
              </span>
            }
            title={`${metric.costLabel} timeline`}
          >
            <DataState
              error={
                <ChartError
                  message={`The ${metric.costLabel} timeline could not load.`}
                  onRetry={cpaSeriesQuery.refetch}
                />
              }
              loading={<ChartSkeleton className="h-44" />}
              status={chartStatus(cpaSeriesQuery)}
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
            </DataState>
          </OptimizerPanel>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <OptimizerPanel
              meta={<ConfidenceBadge band={latestRun?.confidence?.band} score={confidenceScore} />}
              title="Confidence"
            >
              <ScoreRadar
                band={latestRun?.confidence?.band}
                confidence={latestRun?.confidence ?? null}
              />
            </OptimizerPanel>

            <OptimizerPanel title="Pacing">
              <PacingGauge
                currency={currency}
                dailyTotal={portfolio.daily_total}
                pacing={pacing as never}
              />
            </OptimizerPanel>

            <OptimizerPanel
              meta={<span className="text-3xs text-muted-foreground">step conversion · 7d</span>}
              title="Conversion funnel"
            >
              <DataState
                error={
                  <ChartError
                    message="The conversion funnel could not load."
                    onRetry={snapshotsQuery.refetch}
                  />
                }
                loading={<ChartSkeleton className="h-32" />}
                status={combinedChartStatus(snapshotsQuery, enrolledQuery)}
              >
                <FunnelConversion objective={portfolio.objective} window={funnelWindow} />
              </DataState>
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
              {/* Observe is where a suggestion-created portfolio silently lands. When
                the engine has actually scored moves and observe is the only reason
                none of them happened, that fact deserves the promotion control next
                to it — not a buried explainer and a trip to Manage. */}
              {isObserveWithMoves ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2">
                  <p className="min-w-0 text-warning text-xs">
                    Observe mode — the optimizer wants to move budget across{' '}
                    {movedCount === 1 ? '1 ad set' : `${movedCount} ad sets`}, but it never writes
                    in this mode.
                  </p>
                  <Button
                    className="h-6 shrink-0 px-2 text-xs"
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({
                        portfolio_id: portfolio.id,
                        patch: { apply_mode: 'recommend' },
                      })
                    }
                    size="xs"
                    type="button"
                    variant="secondary"
                  >
                    {update.isPending ? 'Switching…' : 'Switch to Recommend'}
                  </Button>
                </div>
              ) : (
                <p className="text-3xs text-muted-foreground">
                  {applyModeExplainer(portfolio.apply_mode)}
                </p>
              )}
              {update.isError ? (
                <p className="text-2xs text-destructive" role="status">
                  Could not change the mode. Nothing on Meta was touched — try again, or set it from
                  Manage.
                </p>
              ) : null}
              <ReallocationFlow
                currency={currency}
                items={items}
                nameById={adsetNameById}
                objective={portfolio.objective}
                snapshotById={snapshotById}
              />
              {/* Held/approved budget approve+execute now lives in the Activity tab's unified
                  queue (it owns approval, the drain, and the receipts). This panel stays a
                  read view of the proposed reallocation. */}
            </OptimizerPanel>
            <OptimizerPanel
              meta={
                <span className="text-3xs text-muted-foreground">
                  {metric.costLabel} per audience &amp; angle
                </span>
              }
              title="Audience × angle"
            >
              <DataState
                error={
                  <ChartError
                    message="The audience × angle matrix could not load."
                    onRetry={angleMatrixQuery.refetch}
                  />
                }
                loading={<ChartSkeleton className="h-32" />}
                status={chartStatus(angleMatrixQuery)}
              >
                <AngleMatrix
                  cells={angleMatrixQuery.data}
                  currency={currency}
                  objective={portfolio.objective}
                />
              </DataState>
            </OptimizerPanel>
          </div>

          <OptimizerPanel
            bodyClassName="space-y-2.5"
            meta={
              <span className="text-3xs text-muted-foreground">
                {costCiLegend(metric)} · expand a row for its creative verdicts
              </span>
            }
            title={`${metric.costLabel} per ad set`}
          >
            <InsightDataTable
              columns={adsetColumns}
              defaultSort={{ columnId: 'cost', direction: 'desc' }}
              emptyState="No scored ad sets in the latest cycle."
              expandedContent={(row) => (
                <AdsetCreativeVerdicts
                  accountId={adAccountId}
                  adsetId={row.adsetId}
                  brandId={brandId}
                  currency={currency}
                />
              )}
              getRowId={(row) => row.adsetId}
              rowActions={(row) => (
                <Button
                  aria-label={`Chart the creatives in ${row.name ?? row.adsetId}`}
                  aria-pressed={selectedAdsetId === row.adsetId}
                  className={cn(
                    'size-7',
                    selectedAdsetId === row.adsetId && 'bg-muted text-primary',
                  )}
                  onClick={() =>
                    onSelectAdset(selectedAdsetId === row.adsetId ? null : row.adsetId)
                  }
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <LineChartIcon className="size-3.5" />
                </Button>
              )}
              rows={adsetRows}
            />
          </OptimizerPanel>

          {selectedAdsetId ? (
            <>
              <OptimizerPanel
                meta={
                  <span className="text-3xs text-muted-foreground">
                    {adsetNameById.get(selectedAdsetId) || selectedAdsetId}
                  </span>
                }
                title="Creatives"
              >
                <DataState
                  error={
                    <ChartError
                      message="This ad set's creatives could not load."
                      onRetry={dailyTrendsQuery.refetch}
                    />
                  }
                  loading={<ChartSkeleton className="h-40" />}
                  status={combinedChartStatus(dailyTrendsQuery, adsetAdsQuery)}
                >
                  <AdSetTimeline
                    ads={adsetAdsQuery.data}
                    angles={adAnglesQuery.data}
                    currency={currency}
                    metric={chartMetric}
                    onMetricChange={onMetricChange}
                    trends={dailyTrendsQuery.data}
                  />
                </DataState>
              </OptimizerPanel>
              <OptimizerPanel
                meta={<span className="text-3xs text-muted-foreground">ROAS vs break-even</span>}
                title="Ad-set profitability"
              >
                <DataState
                  error={
                    <ChartError
                      message="Ad-set profitability could not load."
                      onRetry={dailyTrendsQuery.refetch}
                    />
                  }
                  loading={<ChartSkeleton className="h-24" />}
                  status={chartStatus(dailyTrendsQuery)}
                >
                  <RoasProfitLine points={adSetRoasSeries(dailyTrendsQuery.data)} />
                </DataState>
              </OptimizerPanel>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="manage" className="min-h-0 overflow-y-auto p-3">
          <PortfolioManagePanel
            adAccountId={adAccountId}
            brandId={brandId}
            currency={currency}
            onDone={() => onSectionChange('performance')}
            portfolio={portfolio}
          />
        </TabsContent>

        <TabsContent value="activity" className="min-h-0 overflow-y-auto p-3">
          {/* The same unified queue the account-wide Actions tab renders, scoped to THIS
              portfolio: budget moves + recommendations, approved and executed on Meta from
              here. The group carries its own search + approve/execute toolbar. */}
          {portfolio.pending_recommendations > 0 || movedCount > 0 ? (
            <OptimizerActionsPortfolioGroup
              adAccountId={adAccountId}
              brandId={brandId}
              portfolio={portfolio}
            />
          ) : (
            <Card className="border-dashed bg-muted/10">
              <CardHeader>
                <CardTitle className="text-sm">
                  No pending actions for this portfolio yet.
                </CardTitle>
                <CardDescription>
                  Budget moves and recommendations that need your decision appear here.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
