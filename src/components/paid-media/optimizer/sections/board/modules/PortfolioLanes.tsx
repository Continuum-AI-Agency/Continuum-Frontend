'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// O04 Portfolio lanes (rLanes in docs/optimizer-redesign/adaptive-15/app.js): one lane per
// portfolio — its cost per result on a bullet against its own goal (the goal's tick, the band
// under it, the cost's dot in the diverging tone), the figure written beside it, a status in
// words, the daily plan and the decisions waiting. Sortable by distance to the goal; a re-sort
// slides the lanes to their places. A lane opens its portfolio.
//
// The figures are the portfolios' headline figures (portfolioFigure): on Meta the live 7 days of
// usePortfolioFigures, the reads the Today rows make; on Google the metrics read, as the Google
// tab's rows read it — the same query keys, so the lanes cost no read the tab did not make.

import type { PortfolioListItem } from '@continuum/contracts';
import {
  CheckIcon,
  ClockIcon,
  type LucideIcon,
  PlusIcon,
  TargetIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { figureProps, formatCpa, formatCurrency } from '../../../format';
import { useOptimizerPortfolioEfficiency } from '../../../useOptimizerData';
import { PlatformChips } from '../../platforms/PlatformChip';
import { portfolioPlatforms } from '../../platforms/platformTabsModel';
import { usePortfolioMemberStates } from '../../platforms/portfolioPlatforms';
import { type PortfolioFigure, portfolioFigureFromReads } from '../../portfolioFigure';
import { usePortfolioFigures } from '../../usePortfolioFigures';
import { ModuleFrame } from '../ModuleFrame';
import { BulletMark } from '../marks';
import { divergingColor, goalDistanceLabel } from '../marksModel';
import { BOARD_COLOR } from '../palette';
import { BOARD_MODULE_TITLES } from '../registry';
import type { BoardModuleProps } from '../types';
import {
  LANE_SORT_LABEL,
  LANE_STATUS_LABEL,
  type LaneSort,
  type LaneStatus,
  type PortfolioLane,
  portfolioLane,
  sortLanes,
} from './portfolioLanesModel';

export default function PortfolioLanes(props: BoardModuleProps) {
  return props.ctx.platform === 'google_ads' ? (
    <GoogleLanes {...props} />
  ) : (
    <MetaLanes {...props} />
  );
}

function MetaLanes({ ctx, slot }: BoardModuleProps) {
  const ids = useMemo(() => ctx.portfolios.map((portfolio) => portfolio.id), [ctx.portfolios]);
  const efficiency = useOptimizerPortfolioEfficiency(ids);
  const { figures, pending } = usePortfolioFigures({
    brandId: ctx.brandId,
    adAccountId: ctx.adAccountId,
    portfolios: ctx.portfolios,
    series: efficiency.series,
  });
  return (
    <LanesView
      ctx={ctx}
      lanes={ctx.portfolios.map((portfolio) =>
        portfolioLane(portfolio, figures.get(portfolio.id) ?? null, ctx.currency),
      )}
      loading={efficiency.pending || pending}
      slot={slot}
    />
  );
}

function GoogleLanes({ ctx, slot }: BoardModuleProps) {
  const ids = useMemo(() => ctx.portfolios.map((portfolio) => portfolio.id), [ctx.portfolios]);
  const efficiency = useOptimizerPortfolioEfficiency(ids);
  const metricsById = usePortfolioMemberStates(ids);
  const lanes = ctx.portfolios.map((portfolio, index) => {
    const state = metricsById.get(portfolio.id);
    const figure: PortfolioFigure | null = portfolioFigureFromReads({
      portfolio,
      snapshots: null,
      readAt: null,
      memberIds: null,
      series: efficiency.series[index] ?? [],
      metrics: state?.status === 'ready' ? state.metrics : null,
    });
    return portfolioLane(portfolio, figure, ctx.currency);
  });
  return (
    <LanesView
      ctx={ctx}
      lanes={lanes}
      loading={efficiency.pending || ids.some((id) => metricsById.get(id)?.status === 'loading')}
      slot={slot}
    />
  );
}

const STATUS_STYLE: Record<LaneStatus, { icon: LucideIcon; tone: string }> = {
  'on-track': { icon: CheckIcon, tone: 'border-success/30 text-success-ink' },
  'above-goal': {
    icon: TriangleAlertIcon,
    tone: 'border-destructive/30 text-destructive-ink',
  },
  'no-goal': { icon: TargetIcon, tone: 'border-border text-muted-foreground' },
  'lost-ad-sets': {
    icon: TriangleAlertIcon,
    tone: 'border-destructive/30 text-destructive-ink',
  },
  unread: { icon: ClockIcon, tone: 'border-border text-muted-foreground' },
};

function applyModeLabel(portfolio: PortfolioListItem): string {
  if (portfolio.apply_mode === 'autopilot') {
    return portfolio.autopilot_paused ? 'Autopilot paused' : 'Autopilot';
  }
  return portfolio.apply_mode === 'observe' ? 'Observe' : 'Recommend';
}

const SORTS: LaneSort[] = ['distance', 'budget', 'decisions'];

function LanesView({
  ctx,
  slot,
  lanes,
  loading,
}: BoardModuleProps & { lanes: PortfolioLane[]; loading: boolean }) {
  const betaUiText = useBetaTranslations('scale');

  const reduce = useReducedMotion();
  const [sort, setSort] = useState<LaneSort>('distance');
  const frame = {
    reason: slot.reason,
    size: slot.size,
    testId: 'board-module-portfolios',
    title: betaUiText('boardModuleTitle', { id: 'portfolios' }),
  };
  if (lanes.length === 0) {
    return (
      <ModuleFrame {...frame} state="missing">
        <p className="text-muted-foreground text-sm" data-testid="board-lanes-empty">
          {betaUiText('beta_91398ce42dae')}{' '}
          <button
            className="inline-flex items-center gap-1 font-medium text-primary-ink hover:underline"
            onClick={ctx.onCreatePortfolio}
            type="button"
          >
            <PlusIcon aria-hidden="true" className="size-3.5" />
            {betaUiText('beta_2283fad67e39')}
          </button>
        </p>
      </ModuleFrame>
    );
  }
  if (loading) {
    return (
      <ModuleFrame {...frame} state="loading">
        <div className="space-y-2">
          {lanes.map((lane) => (
            <div className="h-16 animate-pulse rounded-lg bg-muted/40" key={lane.portfolio.id} />
          ))}
        </div>
      </ModuleFrame>
    );
  }
  const sorted = sortLanes(lanes, sort);
  return (
    <ModuleFrame {...frame}>
      <div className="space-y-3">
        <ToggleGroup
          aria-label={betaUiText('beta_703463b5e86b')}
          className="flex-wrap"
          data-testid="board-lanes-sort"
          onValueChange={(next) => {
            const picked = SORTS.find((option) => option === String(next));
            if (picked) setSort(picked);
          }}
          size="sm"
          type="single"
          value={sort}
          variant="outline"
        >
          {SORTS.map((option) => (
            <ToggleGroupItem className="h-7 px-2 text-xs" key={option} value={option}>
              {LANE_SORT_LABEL[option]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ul className="space-y-2" data-testid="board-lanes">
          {sorted.map((lane) => (
            <motion.li
              key={lane.portfolio.id}
              layout={reduce ? false : 'position'}
              transition={{
                type: 'spring',
                visualDuration: 0.42,
                bounce: 0.12,
              }}
            >
              <Lane lane={lane} onSelect={() => ctx.onSelectPortfolio(lane.portfolio.id)} />
            </motion.li>
          ))}
        </ul>
        <LanesLegend />
      </div>
    </ModuleFrame>
  );
}

/** "$53.12 per conversation · goal $45.00" — the figure the bullet draws, always written; and
 *  without a cost, what the window did instead. */
function laneFigureLine(lane: PortfolioLane): string {
  const { cost, goal, currency, words, status, figure } = lane;
  const parts: string[] = [];
  if (cost != null) parts.push(`${formatCpa(cost, currency)} per ${words.one}`);
  else if (figure && figure.spend > 0)
    parts.push(`${formatCurrency(figure.spend, currency)} spent, no ${words.one} yet`);
  else if (figure) parts.push('nothing spent in the window');
  else if (status === 'lost-ad-sets') parts.push('no cycle can move it until its ad sets return');
  else parts.push(goal != null ? 'not read yet' : 'no figure yet');
  if (goal != null) parts.push(`goal ${formatCpa(goal, currency)}`);
  else if (cost != null) parts.push('no goal to judge it against');
  return parts.join(' · ');
}

function Lane({ lane, onSelect }: { lane: PortfolioLane; onSelect: () => void }) {
  const betaUiText = useBetaTranslations('scale');

  const { portfolio, status, cost, goal, currency } = lane;
  const style = STATUS_STYLE[status];
  const StatusIcon = style.icon;
  const distance = goalDistanceLabel(cost, goal, betaUiText);
  return (
    <button
      className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring @[40rem]/module:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_auto] @[40rem]/module:items-center"
      data-status={status}
      data-testid="board-lane"
      onClick={onSelect}
      type="button"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-sm" data-testid="board-lane-name">
          {portfolio.name}
        </p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
          <PlatformChips platforms={portfolioPlatforms(portfolio.platforms)} />
          <Badge className="bg-background" variant="outline">
            {applyModeLabel(portfolio)}
          </Badge>
          <Badge
            className={cn('gap-1 bg-background', style.tone)}
            data-testid="board-lane-status"
            variant="outline"
          >
            <StatusIcon aria-hidden="true" />
            {LANE_STATUS_LABEL[status]}
          </Badge>
        </div>
      </div>
      <div className="col-span-2 row-start-2 min-w-0 space-y-0.5 @[40rem]/module:col-span-1 @[40rem]/module:row-start-auto">
        {cost != null && goal != null ? (
          <BulletMark
            color={divergingColor(cost, goal)}
            goal={goal}
            label={betaUiText('beta_ea26c96bdc69', {
              value0: String(formatCpa(cost, currency)),
              value1: String(formatCpa(goal, currency)),
            })}
            testId="board-lane-bullet"
            value={cost}
          />
        ) : null}
        <p className="text-muted-foreground text-xs leading-snug">
          <span
            className="text-foreground tabular-nums"
            {...figureProps(`board.lane.${portfolio.id}.cost`, cost, currency, 'd7')}
          >
            {laneFigureLine(lane)}
          </span>
          {distance ? ` · ${distance}` : ''}
          {lane.asOf ? ` · ${lane.asOf}` : ''}
        </p>
      </div>
      <div className="col-start-2 row-start-1 flex flex-col items-end gap-0.5 whitespace-nowrap text-xs @[40rem]/module:col-start-auto @[40rem]/module:row-start-auto">
        <span
          className="font-semibold text-sm tabular-nums"
          {...figureProps(
            `board.lane.${portfolio.id}.daily`,
            lane.dailyBudget,
            currency,
            'none',
            'per-period',
          )}
        >
          {lane.dailyBudget != null
            ? betaUiText('beta_d19a4214887d', {
                value0: String(formatCurrency(lane.dailyBudget, currency)),
              })
            : '—'}
        </span>
        <span className="text-muted-foreground">
          {lane.pending > 0
            ? betaUiText('beta_243a8a63a270', { value0: String(lane.pending) })
            : betaUiText('beta_53fc431ccd89')}
        </span>
      </div>
    </button>
  );
}

function LanesLegend() {
  const betaUiText = useBetaTranslations('scale');

  return (
    <div
      className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs"
      data-testid="board-lanes-legend"
    >
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-muted-foreground" />
        {betaUiText('beta_8bd368931df1')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-1.5 w-3 rounded-full"
          style={{ background: BOARD_COLOR.below, opacity: 0.22 }}
        />
        {betaUiText('beta_31547225f931')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-3 border-foreground/55 border-l-[1.5px] border-dashed"
        />
        {betaUiText('beta_cdbf6975e8a3')}
      </span>
    </div>
  );
}
