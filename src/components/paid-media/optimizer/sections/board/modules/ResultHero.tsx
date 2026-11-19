'use client';

// O02 Result hero (rResult in docs/optimizer-redesign/adaptive-15/app.js): the result that counts
// against its goal. A ring of the results against what the spend would buy at the goal (or, with
// no goal, against what the platform reports), the cost per result on a bullet in the diverging
// tone, the spend, and the 7-day cost per result over the last 30 days with the goal's line. When
// the reading counts otherwise than the platform (Vivo 47: 592 real results against the 4,051
// conversions Google reports), a switch shows the platform's number beside the counted one.
//
// The figure is the counted kind's portfolios' own figure, the one the lanes print beside it
// (resultHeroModel): live on Meta, the dated metrics read on Google; only Google's V1 count and,
// while no portfolio has a figure, Google's own read of the account stand in, each said as such.
// Every figure says its window. A figure no read carried is never drawn; the hero says in one
// line what is missing.

import { getOptimizationMetricDefinition, type PortfolioListItem } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { fetchPaidAccountOverview } from '@/lib/paid-media/paid-overview.client';
import { cn } from '@/lib/utils';
import { figureProps, formatCpa, formatCurrency } from '../../../format';
import { useOptimizerPortfolioEfficiency } from '../../../useOptimizerData';
import { resultKinds } from '../../account/overviewModel';
import { figureWindowOf } from '../../platforms/googleAdsOverviewModel';
import { PlatformChip } from '../../platforms/PlatformChip';
import { usePortfolioMemberStates } from '../../platforms/portfolioPlatforms';
import {
  type GoogleAdsOverviewState,
  useGoogleAdsOverview,
} from '../../platforms/useGoogleAdsOverview';
import { type PortfolioFigure, portfolioFigureFromReads } from '../../portfolioFigure';
import { usePortfolioFigures } from '../../usePortfolioFigures';
import { ModuleFrame, type ModuleFrameState } from '../ModuleFrame';
import { BulletMark, dayLabel, RingMark, TrendLine } from '../marks';
import { divergingColor, goalDistanceLabel, goalSide, type TrendPoint } from '../marksModel';
import { BOARD_COLOR } from '../palette';
import { BOARD_MODULE_TITLES } from '../registry';
import type { BoardModuleProps, BoardPlatform } from '../types';
import {
  countsRealResults,
  formatResultCount,
  RESULT_ROLLING_DAYS,
  RESULT_TREND_DAYS,
  type ResultFigures,
  resultFromGoogle,
  resultFromPortfolios,
  resultFromReading,
  resultRing,
  resultWindowLabel,
  trendFromDaily,
  trendFromSeries,
  trendReadWindow,
} from './resultHeroModel';

const FIVE_MINUTES = 5 * 60 * 1000;
const PLATFORM_NAME: Record<BoardPlatform, string> = { meta: 'Meta', google_ads: 'Google' };

export default function ResultHero(props: BoardModuleProps) {
  return props.ctx.platform === 'google_ads' ? (
    <GoogleResultHero {...props} />
  ) : (
    <MetaResultHero {...props} />
  );
}

type TrendView = {
  points: TrendPoint[];
  state: 'loading' | 'ready' | 'missing';
  /** What the line is, with its window. */
  caption: string;
  /** Said instead of the line when there is none to draw. */
  note: string;
  /** How the last point's day reads beside its figure. */
  lastLabel?: (day: string) => string;
};

const REAL_COUNT_NO_TREND = 'No daily read counts these results, so there is no trend to draw.';

function kpiOf(portfolio: PortfolioListItem) {
  return getOptimizationMetricDefinition(portfolio.target_metric ?? portfolio.objective);
}

/** The portfolios that buy the counted kind, and the figures among them. */
function countingOf(
  portfolios: readonly PortfolioListItem[],
  figures: ReadonlyMap<string, PortfolioFigure>,
  kind: string | null,
): { portfolios: PortfolioListItem[]; figures: PortfolioFigure[] } {
  const counting = portfolios.filter((portfolio) => kpiOf(portfolio).kpiField === kind);
  return {
    portfolios: counting,
    figures: counting.flatMap((portfolio) => {
      const figure = figures.get(portfolio.id);
      return figure ? [figure] : [];
    }),
  };
}

function MetaResultHero({ ctx, slot }: BoardModuleProps) {
  const uiText = useTranslations('scale');
  const ids = useMemo(() => ctx.portfolios.map((portfolio) => portfolio.id), [ctx.portfolios]);
  const efficiency = useOptimizerPortfolioEfficiency(ids);
  const { figures, pending } = usePortfolioFigures({
    brandId: ctx.brandId,
    adAccountId: ctx.adAccountId,
    portfolios: ctx.portfolios,
    series: efficiency.series,
  });
  const reading = ctx.reading.result;
  const kinds = resultKinds(ctx.portfolios, figures);
  const kind = reading.kind ?? kinds[0]?.kind ?? null;
  const counting = countingOf(ctx.portfolios, figures, kind);
  const counted = resultFromPortfolios({ kinds, reading, currency: ctx.currency });
  const points = trendFromSeries(
    counting.portfolios.map((portfolio) => efficiency.series[ids.indexOf(portfolio.id)] ?? []),
    counting.portfolios[0] ? kpiOf(counting.portfolios[0]).denominatorMultiplier : 1,
  );
  const missing =
    ctx.portfolios.length === 0
      ? uiText('no_portfolio_on_this_account_yet_so_no_result_48b7be1')
      : uiText('no_portfolio_buying_this_result_has_a_measure_abe293d');
  return (
    <ResultHeroView
      counted={counted}
      kind={kind}
      // Every figure lands before any is drawn: a snapshot painted first would flip to the live
      // figure under the reader's eyes.
      loading={efficiency.pending || pending}
      missing={counted ? null : missing}
      platform="meta"
      readingSource={reading.source ?? null}
      slot={slot}
      trend={{
        points,
        state: efficiency.pending
          ? 'loading'
          : points.some((point) => point.value != null)
            ? 'ready'
            : 'missing',
        caption: uiText('rolling_day_cost_per_result_as_each_cycle_mea_c96e008', {
          rolling: RESULT_ROLLING_DAYS,
          days: RESULT_TREND_DAYS,
        }),
        note: uiText('no_cycle_has_priced_this_result_yet_9e71388'),
        lastLabel: (day) => uiText('cycle_of_day_a2c8721', { day: dayLabel(day) }),
      }}
      windowLabel={
        counted ? resultWindowLabel(counted, { portfolios: counting.figures, google: null }) : ''
      }
    />
  );
}

/** What the Google read could not do, in one line; null while it reads or once it has. */
export function googleReadMissing(state: GoogleAdsOverviewState): {
  line: string;
  error: boolean;
} | null {
  switch (state.status) {
    case 'loading':
    case 'ready':
      return null;
    case 'no-connection':
      return { line: "Google Ads isn't connected, so no result is counted.", error: false };
    case 'no-grant':
      return { line: 'No Google Ads account is granted to this brand yet.', error: false };
    case 'no-role':
      return { line: 'Reading Google Ads needs the Operator, Admin or Owner role.', error: false };
    case 'no-access':
      return { line: 'No live Google grant reaches this account.', error: false };
    case 'error':
      return {
        line: state.reconnect
          ? 'Google refused the login: reconnect Google to read the result.'
          : `Google's read failed: ${state.message}`,
        error: true,
      };
  }
}

function GoogleResultHero({ ctx, slot }: BoardModuleProps) {
  const uiText = useTranslations('scale');
  const reading = ctx.reading.result;
  // The reading counts the real results of the V1 card: that count stands, over its own days. No
  // daily read counts those, and Google's own daily count is another result, so no trend either.
  const realCount = countsRealResults(reading);
  const state = useGoogleAdsOverview(ctx.brandId, null);
  const ready = state.status === 'ready' ? state : null;

  // The lanes' figures, from the same reads under the same keys: a Google portfolio's metrics read.
  const ids = useMemo(() => ctx.portfolios.map((portfolio) => portfolio.id), [ctx.portfolios]);
  const efficiency = useOptimizerPortfolioEfficiency(ids);
  const metricsById = usePortfolioMemberStates(ids);
  const figures = new Map<string, PortfolioFigure>();
  ctx.portfolios.forEach((portfolio, index) => {
    const metrics = metricsById.get(portfolio.id);
    const figure = portfolioFigureFromReads({
      portfolio,
      snapshots: null,
      readAt: null,
      memberIds: null,
      series: efficiency.series[index] ?? [],
      metrics: metrics?.status === 'ready' ? metrics.metrics : null,
    });
    if (figure) figures.set(portfolio.id, figure);
  });
  const kinds = resultKinds(ctx.portfolios, figures);
  const kind = reading.kind ?? kinds[0]?.kind ?? null;
  const counting = countingOf(ctx.portfolios, figures, kind);
  const portfoliosPending =
    efficiency.pending || ids.some((id) => metricsById.get(id)?.status === 'loading');
  const fromPortfolios = resultFromPortfolios({
    kinds,
    reading,
    currency: counting.figures[0]?.currency ?? ctx.currency,
  });
  const counted = realCount
    ? resultFromReading(reading)
    : (fromPortfolios ??
      (ready
        ? resultFromGoogle({ overview: ready.overview, reading, currency: ready.account.currency })
        : null));

  const bucket = realCount ? null : (ready?.resultBucket ?? null);
  const window = ready ? trendReadWindow(ready.overview.until) : null;
  const customerId = ready?.account.account_id ?? null;
  const daily = useQuery({
    queryKey: [
      'optimizer',
      'board',
      'result-trend',
      ctx.brandId,
      customerId ?? 'none',
      window?.since ?? '',
      window?.until ?? '',
      bucket ?? 'none',
    ],
    queryFn: () => {
      if (!customerId || !window || !bucket) throw new Error('The Google read has not landed.');
      return fetchPaidAccountOverview({
        brandId: ctx.brandId,
        adAccountId: customerId,
        platform: 'google-ads',
        range: { preset: 'custom', since: window.since, until: window.until },
        resultBucket: bucket,
      });
    },
    enabled: Boolean(customerId && window && bucket),
    staleTime: FIVE_MINUTES,
    retry: 1,
  });
  const failure = googleReadMissing(state);
  const points = daily.data && window ? trendFromDaily(daily.data.trends ?? [], window) : [];
  const caption = uiText('rolling_day_cost_per_result_across_the_whole__cdc717e', {
    rolling: RESULT_ROLLING_DAYS,
    days: RESULT_TREND_DAYS,
  });
  const trend: TrendView = realCount
    ? { points, state: 'missing', caption, note: REAL_COUNT_NO_TREND }
    : !bucket
      ? {
          points,
          state: ready ? 'missing' : 'loading',
          caption,
          note: uiText('google_counts_no_single_result_here_no_portfo_3b3ecc6'),
        }
      : daily.isError
        ? {
            points,
            state: 'missing',
            caption,
            note: uiText('google_s_daily_read_did_not_answer_02701f9'),
          }
        : daily.isPending
          ? { points, state: 'loading', caption, note: '' }
          : {
              points,
              state: points.some((point) => point.value != null) ? 'ready' : 'missing',
              caption,
              note: uiText('no_rolling_day_window_in_the_last_days_days_c_d0ea2b9', {
                rolling: RESULT_ROLLING_DAYS,
                days: RESULT_TREND_DAYS,
              }),
            };
  return (
    <ResultHeroView
      counted={counted}
      error={failure?.error ?? false}
      kind={kind}
      // The portfolios' figures land before any is drawn, and Google's own read only stands in
      // once none of them has one.
      loading={!realCount && (portfoliosPending || (!fromPortfolios && state.status === 'loading'))}
      missing={
        counted
          ? null
          : (failure?.line ?? uiText('google_has_not_answered_for_this_account_yet_0367fcc'))
      }
      platform="google_ads"
      readingSource={reading.source ?? null}
      slot={slot}
      trend={trend}
      windowLabel={
        counted
          ? resultWindowLabel(counted, {
              portfolios: counting.figures,
              google: ready?.overview ?? null,
            })
          : ''
      }
    />
  );
}

function ResultHeroView({
  slot,
  platform,
  counted,
  kind,
  readingSource,
  windowLabel,
  trend,
  loading,
  missing,
  error = false,
}: {
  slot: BoardModuleProps['slot'];
  platform: BoardPlatform;
  counted: ResultFigures | null;
  /** The result kind counted ('conversations', 'leads'…); null when none is known. */
  kind: string | null;
  /** Where the reading took its own count from (AdAccountResult.source). */
  readingSource: string | null;
  /** The window the figures cover, said beside them. */
  windowLabel: string;
  trend: TrendView;
  loading: boolean;
  missing: string | null;
  error?: boolean;
}) {
  const uiText = useTranslations('scale');
  const [showReported, setShowReported] = useState(false);
  const reportedLabelId = useId();
  const frame = (state: ModuleFrameState, body: ReactNode) => (
    <ModuleFrame
      action={<PlatformChip platform={platform} />}
      reason={slot.reason}
      size={slot.size}
      state={state}
      testId="board-module-result"
      title={BOARD_MODULE_TITLES.result}
    >
      {body}
    </ModuleFrame>
  );
  if (loading) {
    return frame('loading', <div className="h-48 animate-pulse rounded-lg bg-muted/40" />);
  }
  if (!counted) {
    return frame(
      error ? 'error' : 'missing',
      <p className="text-muted-foreground text-sm" data-testid="board-result-missing">
        {missing}
      </p>,
    );
  }

  const { count, spend, costPerResult: cost, goal, currency } = counted;
  const window = figureWindowOf(counted.windowDays);
  const ring = resultRing(counted);
  const side = goalSide(cost, goal);
  const tone = divergingColor(cost, goal);
  const unit = count === 1 ? counted.words.one : counted.words.many;
  const reportedBy = PLATFORM_NAME[platform];
  const reported = counted.platformReported;
  // Spend the reported count is priced over: the read's own, else what the counted cost implies.
  const pricedSpend = spend ?? (cost != null && count != null ? cost * count : null);

  const figure =
    count == null ? null : (
      <>
        <span
          className="font-mono font-semibold text-[32px] tabular-nums leading-[1.2]"
          {...figureProps('board.result.count', count, null, window, 'count')}
        >
          {formatResultCount(count)}
        </span>
        <span className="text-muted-foreground text-xs leading-snug">{unit}</span>
      </>
    );

  return frame(
    'ready',
    <div
      className="space-y-4"
      data-kind={kind ?? ''}
      data-reading-source={readingSource ?? 'none'}
      data-source={counted.source}
    >
      <p className="text-muted-foreground text-xs" data-testid="board-result-window">
        {windowLabel}
      </p>
      <div className="grid gap-4 @[30rem]/module:grid-cols-[11rem_minmax(0,1fr)] @[30rem]/module:items-center">
        <div className="flex justify-center">
          {ring && figure ? (
            <RingMark
              color={ring.basis === 'goal' ? tone : BOARD_COLOR.search}
              label={
                ring.basis === 'goal'
                  ? uiText('part_unit_of_whole_the_spend_buys_at_the_goal_0eb50b4', {
                      part: formatResultCount(ring.part),
                      unit,
                      whole: formatResultCount(ring.whole),
                    })
                  : uiText('part_unit_of_whole_platform_reports_d5e487d', {
                      part: formatResultCount(ring.part),
                      unit,
                      whole: formatResultCount(ring.whole),
                      platform: reportedBy,
                    })
              }
              part={ring.part}
              whole={ring.whole}
            >
              {figure}
              <span className="max-w-[6.5rem] text-muted-foreground text-xs leading-snug">
                {ring.basis === 'goal'
                  ? uiText('of_whole_at_the_goal_goal_eaf4b99', {
                      whole: formatResultCount(ring.whole),
                      goal: formatCpa(goal, currency),
                    })
                  : uiText('of_whole_platform_counts_44bcefa', {
                      whole: formatResultCount(ring.whole),
                      platform: reportedBy,
                    })}
              </span>
            </RingMark>
          ) : figure ? (
            <div className="flex flex-col items-center gap-0.5 py-2 text-center">{figure}</div>
          ) : (
            <p className="text-muted-foreground text-xs" data-testid="board-result-uncounted">
              {uiText('platform_counts_no_single_result_here_570573f', { platform: reportedBy })}
            </p>
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
              <span className="text-muted-foreground">{uiText('cost_per_result_a664c01')}</span>
              <span
                className="font-semibold tabular-nums"
                {...figureProps('board.result.cost', cost, currency, window)}
              >
                {formatCpa(cost, currency)}
              </span>
            </div>
            {goal != null && cost != null ? (
              <BulletMark
                color={tone}
                goal={goal}
                label={uiText('cost_against_a_goal_of_goal_4e99f4a', {
                  cost: formatCpa(cost, currency),
                  goal: formatCpa(goal, currency),
                })}
                testId="board-result-bullet"
                value={cost}
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
              {goal != null ? (
                <span>{uiText('goal_goal_118e036', { goal: formatCpa(goal, currency) })}</span>
              ) : (
                <span data-testid="board-result-no-goal">
                  {uiText('no_portfolio_sets_a_goal_for_this_result_9eb1290')}
                </span>
              )}
              {side !== 'none' ? (
                <Badge
                  className={cn(
                    'bg-background',
                    side === 'above'
                      ? 'border-destructive/30 text-destructive-ink'
                      : 'border-success/30 text-success-ink',
                  )}
                  data-side={side}
                  data-testid="board-result-distance"
                  variant="outline"
                >
                  {goalDistanceLabel(cost, goal)}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
            <span className="text-muted-foreground">{uiText('spend_85f3d55')}</span>
            <span
              className="font-semibold tabular-nums"
              {...figureProps('board.result.spend', pricedSpend, currency, window)}
            >
              {formatCurrency(pricedSpend, currency)}
            </span>
          </div>
          {reported != null ? (
            <div className="space-y-1.5">
              <div className="flex w-fit items-center gap-2 text-xs">
                <Switch
                  aria-labelledby={reportedLabelId}
                  checked={showReported}
                  data-testid="board-result-reported-switch"
                  onCheckedChange={(checked) => setShowReported(checked)}
                  size="sm"
                />
                <span id={reportedLabelId}>
                  {uiText('platform_reports_5137d3e', { platform: reportedBy })}
                </span>
              </div>
              {showReported ? (
                <p className="text-xs" data-testid="board-result-reported">
                  {uiText.rich(
                    pricedSpend != null && reported > 0
                      ? 'fig_reported_fig_muted_as_platform_counts_the_04c2a9b'
                      : 'fig_reported_fig_muted_as_platform_counts_the_9f22474',
                    {
                      reported: formatResultCount(reported),
                      platform: reportedBy,
                      each:
                        pricedSpend != null && reported > 0
                          ? formatCpa(pricedSpend / reported, currency)
                          : '',
                      count: count != null ? formatResultCount(count) : '—',
                      fig: (chunks) => (
                        <span
                          className="font-semibold tabular-nums"
                          {...figureProps('board.result.reported', reported, null, window, 'count')}
                        >
                          {chunks}
                        </span>
                      ),
                      muted: (chunks) => <span className="text-muted-foreground">{chunks}</span>,
                    },
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
          {counted.others.length > 0 ? (
            <p className="text-muted-foreground text-xs" data-testid="board-result-others">
              {uiText('also_bought_list_5a385a2', {
                list: counted.others
                  .map((other) =>
                    uiText('count_unit_for_spend_78534e1', {
                      count: formatResultCount(other.count),
                      unit: other.count === 1 ? other.words.one : other.words.many,
                      spend: formatCurrency(other.spend, currency),
                    }),
                  )
                  .join(' · '),
              })}
            </p>
          ) : null}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-xs" data-testid="board-trend-caption">
          {trend.caption}
        </p>
        {trend.state === 'ready' ? (
          <TrendLine
            formatValue={(value) => formatCpa(value, currency)}
            goal={goal}
            goalLabel={
              goal != null
                ? uiText('goal_goal_118e036', { goal: formatCpa(goal, currency) })
                : undefined
            }
            label={
              goal != null
                ? uiText('caption_against_a_goal_of_goal_3d566e2', {
                    caption: trend.caption,
                    goal: formatCpa(goal, currency),
                  })
                : trend.caption
            }
            lastLabel={trend.lastLabel}
            points={trend.points}
          />
        ) : trend.state === 'loading' ? (
          <div
            className="h-28 animate-pulse rounded-md bg-muted/40"
            data-testid="board-trend-loading"
          />
        ) : (
          <p className="text-muted-foreground text-xs" data-testid="board-trend-missing">
            {trend.note}
          </p>
        )}
      </div>
    </div>,
  );
}
