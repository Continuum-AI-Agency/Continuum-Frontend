'use client';

import type {
  AccountCandidate,
  AdSetSnapshot,
  AudienceProposalRow,
  CycleItemRow,
  PortfolioLevel,
  PortfolioListItem,
  RecommendationRow,
} from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { maxCiUpperBound } from '@/components/paid-media/optimizer/charts/chartScale';
import { itemWritable } from '@/components/paid-media/optimizer/platformWrites';
import { portfolioCurrency } from '@/components/paid-media/optimizer/portfolioCurrency';
import { parseReport, recommendationLabel } from '@/components/paid-media/optimizer/reportModel';
import { AccountRead } from '@/components/paid-media/optimizer/sections/account/AccountRead';
import {
  audienceCardView,
  audienceComparison,
  type ComparisonCell,
} from '@/components/paid-media/optimizer/sections/audienceCardModel';
import { moveTitle } from '@/components/paid-media/optimizer/sections/crossPlatformMove/BudgetMoveQueueRow';
import { MoveLegLine } from '@/components/paid-media/optimizer/sections/crossPlatformMove/MoveLegLine';
import {
  BudgetDetail,
  buildActionQueue,
  buildMoveQueue,
  CreativeBriefDetail,
  pauseBlockedNote,
  recRowLine,
} from '@/components/paid-media/optimizer/sections/OptimizerActionsPortfolioGroup';
import { cardRecommendationId } from '@/components/paid-media/optimizer/sections/platformCards/platformCardActionModel';
import { portfolioPlanPerDay } from '@/components/paid-media/optimizer/sections/portfolioPlan';
import { RecEvidenceChart } from '@/components/paid-media/optimizer/sections/RecEvidenceChart';
import { withHonestCapBinding } from '@/components/paid-media/optimizer/sections/recQueueModel';
import {
  useCurrentMoves,
  useOptimizerAccountSnapshots,
  useOptimizerAudienceProposals,
  useOptimizerEnrolledAdsets,
  useOptimizerPerformance,
} from '@/components/paid-media/optimizer/useOptimizerData';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { bareAccountId } from '@/lib/paid-media/accountId';
import { HOME_DRAFT_READ_ONLY } from '../../HomePresentationContext';

function cellText(cell: ComparisonCell): string {
  return cell.kind === 'text'
    ? cell.text
    : cell.chips.map((chip) => chip.name).join(', ') || cell.empty;
}

function RecommendationEvidence({
  rec,
  currency,
  snapshot,
  item,
  proposals,
  objective,
  maxCpa,
}: {
  rec: RecommendationRow;
  currency: string | null;
  snapshot: AdSetSnapshot | null;
  item: CycleItemRow | null;
  proposals: readonly AudienceProposalRow[];
  objective: ReturnType<typeof getOptimizationMetricDefinition>;
  maxCpa: number;
}) {
  const uiText = useTranslations('dashboard');
  const audience = audienceCardView([...proposals], rec);
  const comparison = audience.plan ? audienceComparison(audience.plan) : null;
  return (
    <div
      className="space-y-3 pt-3 text-muted-foreground text-xs"
      data-testid="home-draft-recommendation-evidence"
    >
      <CreativeBriefDetail rec={rec} />
      <RecEvidenceChart
        rec={rec}
        currency={currency}
        snapshot={snapshot}
        item={item}
        kpiField={objective.kpiField}
        denominatorMultiplier={objective.denominatorMultiplier}
        maxCpa={maxCpa}
        name={snapshot?.name ?? rec.adset_name}
      />
      {comparison ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="mb-2 text-left font-medium text-foreground">
              {uiText('audience_comparison_3ac1849')}
            </caption>
            <thead>
              <tr>
                <th scope="col">{uiText('setting_818cd8d')}</th>
                <th scope="col">{uiText('current_e0d1b68')}</th>
                <th scope="col">{uiText('proposed_9b0c660')}</th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="py-1 font-normal">
                    {row.label}
                  </th>
                  <td>{cellText(row.current)}</td>
                  <td>{cellText(row.proposed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            {comparison.currentReach} · {comparison.proposedReach}
          </p>
          {comparison.exclusionWarning ? <p>{comparison.exclusionWarning}</p> : null}
        </div>
      ) : null}
      {audience.errorMessage ? <p role="alert">{audience.errorMessage}</p> : null}
    </div>
  );
}

/** Reuse the queue's read/selection models and pure evidence views, without its mutation hosts. */
export function ReadOnlyQueue({
  brandId,
  portfolio,
  platformCards = [],
}: {
  brandId: string;
  portfolio: PortfolioListItem;
  platformCards?: AccountCandidate[];
}) {
  const uiText = useTranslations('dashboard');
  const adAccountId = portfolio.ad_account_id ? bareAccountId(portfolio.ad_account_id) : '';
  const performance = useOptimizerPerformance(portfolio.id);
  const enrolled = useOptimizerEnrolledAdsets(portfolio.id);
  const snapshots = useOptimizerAccountSnapshots(
    brandId,
    adAccountId,
    (portfolio.level as PortfolioLevel) ?? 'adset',
  );
  const proposals = useOptimizerAudienceProposals(brandId);
  const report = parseReport(performance.data);
  const moves = useCurrentMoves(portfolio, brandId, adAccountId, report?.latest_items ?? []);
  const currency = portfolioCurrency(portfolio, null);
  const names = useMemo(
    () =>
      new Map([
        ...enrolled.data.map((row) => [row.adset_id, row.adset_name ?? row.adset_id] as const),
        ...(report?.latest_items ?? []).map(
          (row) => [row.adset_id, row.adset_name ?? row.adset_id] as const,
        ),
      ]),
    [enrolled.data, report?.latest_items],
  );
  const rows = useMemo(() => {
    const cardIds = new Set(platformCards.map(cardRecommendationId));
    return buildActionQueue(
      report && {
        ...report,
        latest_items: moves.current,
        recommendations: report.recommendations
          .filter((rec) => !cardIds.has(rec.id))
          .map((rec) => withHonestCapBinding(rec, report.latest_items)),
      },
      names,
      [],
      (item) => itemWritable(portfolio, item),
      (rec) => pauseBlockedNote(rec, portfolio, moves.notes),
    );
  }, [report, moves.current, moves.notes, platformCards, names, portfolio]);
  const moveRows = useMemo(() => buildMoveQueue(report), [report]);
  const objective = getOptimizationMetricDefinition(portfolio.objective);
  const maxCpa = maxCiUpperBound(report?.latest_items ?? [], objective.denominatorMultiplier);
  const run: unknown = report?.latest_run;
  const recordedAt =
    run && typeof run === 'object' && 'cycle_ts' in run && typeof run.cycle_ts === 'string'
      ? run.cycle_ts
      : null;

  if (!performance.isSuccess && performance.isError)
    return (
      <p className="text-destructive-ink text-xs" role="alert">
        {uiText('this_portfolio_s_queue_could_not_be_read_5e2bb81')}
      </p>
    );
  if (!performance.isSuccess) return <Skeleton className="h-24 w-full" />;
  if (!report)
    return (
      <p className="text-muted-foreground text-xs">
        {uiText('no_recorded_queue_is_available_for_this_portf_b4e53be')}
      </p>
    );

  return (
    <div className="space-y-3 text-xs" data-testid="home-draft-queue">
      <p className="text-muted-foreground">
        {uiText('latest_recorded_cycle_b7ca651')}
        {recordedAt ? (
          <>
            {' '}
            · <time dateTime={recordedAt}>{recordedAt}</time>
          </>
        ) : (
          ` · ${uiText('date_not_recorded_40b7215')}`
        )}{' '}
        · {currency ?? uiText('currency_not_recorded_b6f3038')}
      </p>
      {platformCards.length > 0 ? (
        <AccountRead
          candidates={platformCards}
          currency={currency}
          dailySpend={portfolioPlanPerDay(portfolio)}
          portfolioNames={new Map([[portfolio.id, portfolio.name]])}
        />
      ) : null}
      <ul className="divide-y divide-border">
        {moveRows.map(({ key, rec, move }) => (
          <li className="py-2" key={key}>
            <details data-home-queue-key={key}>
              <summary className="cursor-pointer font-medium text-foreground">
                {moveTitle(move)} · {rec.status}
              </summary>
              <p className="pt-2 text-muted-foreground">{rec.reason}</p>
              <ul>
                {move.legs.map((leg) => (
                  <MoveLegLine
                    {...leg}
                    currency={move.currency}
                    key={leg.index}
                    testId="home-draft-move-leg"
                  />
                ))}
              </ul>
            </details>
          </li>
        ))}
        {rows.map((row) => (
          <li className="py-2" key={row.key}>
            <details data-home-queue-key={row.key}>
              <summary className="cursor-pointer font-medium text-foreground">
                {row.name ?? row.adsetId} ·{' '}
                {row.route === 'budget'
                  ? uiText('budget_change_fb5ad5f')
                  : recommendationLabel(row.rec.kind).label}
              </summary>
              {row.route === 'budget' ? (
                <div className="space-y-2 pt-3 text-muted-foreground">
                  {Number.isFinite(row.item.current_budget) &&
                  Number.isFinite(row.item.final_budget) ? (
                    <BudgetDetail item={row.item} currency={currency} />
                  ) : (
                    <p>
                      {uiText('budget_amounts_were_not_reported_11a8844')}
                      {row.item.reason ? ` ${row.item.reason}` : ''}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <p className="pt-2 text-muted-foreground">
                    {recRowLine(row.rec, currency)} · {row.rec.status}
                  </p>
                  <RecommendationEvidence
                    rec={row.rec}
                    currency={currency}
                    snapshot={
                      snapshots.data.find((snapshot) => snapshot.id === row.adsetId) ?? null
                    }
                    item={report.latest_items.find((item) => item.adset_id === row.adsetId) ?? null}
                    proposals={proposals.data}
                    objective={objective}
                    maxCpa={maxCpa}
                  />
                </>
              )}
            </details>
          </li>
        ))}
      </ul>
      {rows.length === 0 && moveRows.length === 0 && platformCards.length === 0 ? (
        <p>{uiText('nothing_is_recorded_in_this_queue_e492102')}</p>
      ) : null}
      {moves.notes.size > 0 ? (
        <p className="text-muted-foreground">{[...moves.notes.values()].join(' · ')}</p>
      ) : null}
      <div className="flex gap-2">
        <Button disabled size="sm" title={uiText(HOME_DRAFT_READ_ONLY)}>
          {uiText('approve_6007acb')}
        </Button>
        <Button disabled size="sm" title={uiText(HOME_DRAFT_READ_ONLY)} variant="outline">
          {uiText('dismiss_48845bf')}
        </Button>
      </div>
    </div>
  );
}
