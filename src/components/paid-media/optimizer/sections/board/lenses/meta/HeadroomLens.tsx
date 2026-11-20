'use client';

// Delivery headroom (Meta twin of G06): CPM against cost per result, one point per branch (or
// campaign), each as large as its spend and colored by its cost against the goal, with the goal
// as a dashed line. Low on both axes is room to spend more. The view rings and names the
// cheapest to reach and the best at converting. Small, it leads with the CPM spread over a bare
// scatter; at m or l it draws the axes, the labels and the takeaway.

import type { BoardModuleSize } from '@continuum/contracts';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useMemo, useRef } from 'react';
import {
  currencyColumnSuffix,
  currencySymbol,
  figureProps,
  formatCurrency,
} from '@/components/paid-media/optimizer/format';
import { BOARD_COLOR } from '../../palette';
import type { BoardModuleProps } from '../../types';
import { buildMix, type MixModel } from './branchesModel';
import {
  buildHeadroom,
  type HeadroomModel,
  type HeadroomPoint,
  headroomHeadline,
  niceScale,
  placeScatterLabels,
} from './headroomModel';
import {
  ChartTip,
  ENTER_EASE,
  frameStateOf,
  Headline,
  LegendItem,
  LegendRow,
  LensNote,
  MetaFrame,
  ReadNote,
  Takeaway,
  toneColor,
  useChartTip,
  useMeasuredWidth,
  WindowLine,
} from './MetaLensParts';
import { useMetaRanking } from './metaReads';

const TEST_ID = 'board-module-headroom';

export default function HeadroomLens({ ctx, slot }: BoardModuleProps) {
  const uiText = useTranslations('scale');
  const campaigns = useMetaRanking(ctx.brandId, ctx.adAccountId, 'top_campaigns');
  const mix = useMemo(
    () =>
      campaigns.status === 'ready' ? buildMix(campaigns.data, ctx.portfolios, ctx.currency) : null,
    [campaigns, ctx.portfolios, ctx.currency],
  );
  const model = useMemo(() => (mix ? buildHeadroom(mix, ctx.currency) : null), [mix, ctx.currency]);
  return (
    <MetaFrame
      slot={slot}
      state={frameStateOf(campaigns.status, Boolean(model && model.points.length > 0))}
      testId={TEST_ID}
      title={uiText('delivery_headroom_f24c4a7')}
    >
      {campaigns.status !== 'ready' ? (
        <ReadNote size={slot.size} state={campaigns} testId={TEST_ID} />
      ) : mix && model && model.points.length > 0 ? (
        <HeadroomView currency={ctx.currency} mix={mix} model={model} size={slot.size} />
      ) : (
        <LensNote testId={`${TEST_ID}-empty`}>
          {mix
            ? uiText('no_result_select_purchases_purchases_leads_le_6227fff', {
                result: mix.result?.kind ?? 'none',
              })
            : uiText('no_campaign_spent_in_the_last_30_days_57b869c')}
        </LensNote>
      )}
    </MetaFrame>
  );
}

type Plot = {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const PLOTS: Record<'small' | 'full', Omit<Plot, 'width'>> = {
  small: { height: 104, left: 8, right: 8, top: 10, bottom: 10 },
  full: { height: 244, left: 52, right: 16, top: 30, bottom: 40 },
};

/** An axis tick: the symbol and the round figure; the axis title names the code. */
function tickText(value: number, currency: string | null): string {
  return `${currencySymbol(currency)}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function HeadroomView({
  mix,
  model,
  size,
  currency,
}: {
  mix: MixModel;
  model: HeadroomModel;
  size: BoardModuleSize;
  currency: string | null;
}) {
  const uiText = useTranslations('scale');
  const small = size === 's';
  const host = useRef<HTMLDivElement>(null);
  const width = useMeasuredWidth(host, small ? 260 : 560);
  const { tip, show, hide } = useChartTip(host);
  const reduce = useReducedMotion();
  const plot: Plot = { ...PLOTS[small ? 'small' : 'full'], width };
  const goal = mix.reference?.kind === 'goal' ? mix.reference.value : null;
  const xs = niceScale(model.points.map((point) => point.cpm));
  const ys = niceScale([
    ...model.points.map((point) => point.costPerResult),
    ...(goal != null ? [goal] : []),
  ]);
  const innerW = Math.max(1, plot.width - plot.left - plot.right);
  const innerH = plot.height - plot.top - plot.bottom;
  const X = (value: number) => plot.left + ((value - xs.min) / (xs.max - xs.min || 1)) * innerW;
  const Y = (value: number) => plot.top + (1 - (value - ys.min) / (ys.max - ys.min || 1)) * innerH;
  const maxSpend = Math.max(...model.points.map((point) => point.spend), 1);
  const circles = model.points.map((point) => ({
    point,
    cx: X(point.cpm),
    cy: Y(point.costPerResult),
    r: (small ? 3 : 5) + (small ? 3 : 5) * Math.sqrt(point.spend / maxSpend),
    text: point.label,
  }));
  const result = mix.result?.kind ?? 'none';
  const goalText =
    goal != null ? uiText('goal_goal_118e036', { goal: tickText(goal, currency) }) : '';
  const labels = small
    ? null
    : placeScatterLabels({
        circles,
        goal: goal != null ? { y: Y(goal), text: goalText } : null,
        left: plot.left,
        right: plot.width - plot.right,
      });
  const unit = currencyColumnSuffix(currency);
  const headline = headroomHeadline(model, mix, currency);
  const called = new Set([model.cheapest?.key, model.best?.key].filter(Boolean));
  const referenceName = mix.reference?.kind === 'average' ? 'average' : 'goal';

  const tipOf = (point: HeadroomPoint) => (
    <span className="flex flex-col gap-0.5">
      <span className="font-medium">{point.label}</span>
      <span>CPM {formatCurrency(point.cpm, currency)}</span>
      <span>
        {uiText('cost_per_result_select_purchases_purchase_lea_7034173', {
          cost: formatCurrency(point.costPerResult, currency),
          result,
        })}
      </span>
      <span>{uiText('spend_spend_6f7473e', { spend: formatCurrency(point.spend, currency) })}</span>
    </span>
  );

  return (
    <div className="flex flex-col gap-3">
      {small && headline ? (
        <Headline
          caption={headline.caption}
          figure={headline.figure}
          testId={`${TEST_ID}-headline`}
        />
      ) : null}
      <WindowLine
        detail={
          small
            ? undefined
            : uiText('by_select_branch_count_plural_one_branch_othe_653b11d', {
                by: mix.by,
                count: model.points.length,
              })
        }
        testId={TEST_ID}
      />
      <div className="relative w-full" ref={host}>
        <svg
          aria-label={uiText('cpm_against_cost_per_result_select_purchases__a6e4725', {
            result,
            by: mix.by,
          })}
          className="block w-full overflow-visible"
          height={plot.height}
          role="img"
          viewBox={`0 0 ${plot.width} ${plot.height}`}
        >
          {small
            ? null
            : ys.ticks.map((tick) => (
                <g key={`y${tick}`}>
                  <line
                    stroke="var(--border)"
                    x1={plot.left}
                    x2={plot.width - plot.right}
                    y1={Y(tick)}
                    y2={Y(tick)}
                  />
                  <text
                    className="fill-muted-foreground font-mono"
                    fontSize={12}
                    textAnchor="end"
                    x={plot.left - 6}
                    y={Y(tick) + 4}
                  >
                    {tickText(tick, currency)}
                  </text>
                </g>
              ))}
          {small
            ? null
            : xs.ticks.map((tick) => (
                <text
                  className="fill-muted-foreground font-mono"
                  fontSize={12}
                  key={`x${tick}`}
                  textAnchor="middle"
                  x={X(tick)}
                  y={plot.height - plot.bottom + 18}
                >
                  {tickText(tick, currency)}
                </text>
              ))}
          {small ? null : (
            <>
              <text
                className="fill-muted-foreground"
                fontSize={12}
                textAnchor="end"
                x={plot.width - plot.right}
                y={plot.height - 4}
              >
                CPM{unit}
              </text>
              <text className="fill-muted-foreground" fontSize={12} x={4} y={14}>
                {uiText('cost_per_result_select_purchases_purchase_lea_069c0b4', { result })}
                {unit}
              </text>
            </>
          )}
          {goal != null ? (
            <g data-testid={`${TEST_ID}-goal`}>
              <line
                stroke="var(--foreground)"
                strokeDasharray="4 3"
                strokeOpacity={0.55}
                strokeWidth={1.25}
                x1={plot.left}
                x2={plot.width - plot.right}
                y1={Y(goal)}
                y2={Y(goal)}
              />
              {labels?.goal ? (
                <text
                  className="fill-muted-foreground"
                  fontSize={12}
                  textAnchor={labels.goal.anchor}
                  x={labels.goal.x}
                  y={labels.goal.y}
                >
                  {goalText}
                </text>
              ) : null}
            </g>
          ) : null}
          {circles.map(({ point, cx, cy, r }, index) => (
            <g
              className="cursor-default"
              data-label={point.label}
              data-testid={`${TEST_ID}-point`}
              key={point.key}
              onPointerEnter={(event) => show(event, tipOf(point))}
              onPointerLeave={hide}
            >
              {called.has(point.key) && !small ? (
                <circle
                  cx={cx}
                  cy={cy}
                  fill="none"
                  r={r + 4}
                  stroke="var(--foreground)"
                  strokeWidth={1.25}
                />
              ) : null}
              <motion.circle
                animate={{ r, opacity: 1 }}
                cx={cx}
                cy={cy}
                fill={toneColor(point.tone)}
                initial={reduce ? false : { r: 0, opacity: 0 }}
                stroke="var(--card)"
                strokeWidth={2}
                transition={{ duration: 0.45, delay: index * 0.06, ease: ENTER_EASE }}
              />
            </g>
          ))}
          {labels?.points.map((label, index) => {
            const circle = circles[index];
            return circle ? (
              <text
                className="pointer-events-none fill-foreground font-medium"
                fontSize={12}
                key={`l${circle.point.key}`}
                textAnchor={label.anchor}
                x={label.x}
                y={label.y}
              >
                {circle.text}
              </text>
            ) : null;
          })}
        </svg>
        <ChartTip tip={tip} />
      </div>
      {small ? null : (
        <>
          <Callouts currency={currency} model={model} result={result} />
          <LegendRow>
            <LegendItem
              color={BOARD_COLOR.below}
              label={uiText('under_reference_select_average_average_other__944ab38', {
                reference: referenceName,
              })}
              variant="dot"
            />
            {model.points.some((point) => point.tone === 'mid') ? (
              <LegendItem
                color={BOARD_COLOR.mid}
                label={uiText('on_reference_select_average_average_other_goa_0d1efa4', {
                  reference: referenceName,
                })}
                variant="dot"
              />
            ) : null}
            <LegendItem
              color={BOARD_COLOR.above}
              label={uiText('over_reference_select_average_average_other_g_eba2bce', {
                reference: referenceName,
              })}
              variant="dot"
            />
            {goal != null ? (
              <LegendItem
                label={uiText('goal_goal_per_result_select_purchases_purchas_52fd078', {
                  goal: formatCurrency(goal, currency),
                  result,
                })}
                variant="dashed"
              />
            ) : null}
          </LegendRow>
          {model.unplaced.length > 0 ? (
            <LensNote testId={`${TEST_ID}-unplaced`}>
              {uiText('no_result_select_purchases_purchases_leads_le_8cbeaa8', {
                result,
                list: model.unplaced.map((row) => row.label).join(', '),
              })}
            </LensNote>
          ) : null}
          {model.smallCount > 0 ? (
            <LensNote>
              {uiText('by_select_branch_count_plural_one_smaller_gro_f249c5e', {
                by: mix.by,
                count: model.smallCount,
              })}
            </LensNote>
          ) : null}
          <Takeaway testId={`${TEST_ID}-takeaway`} text={model.takeaway} />
        </>
      )}
    </div>
  );
}

function Callouts({
  model,
  currency,
  result,
}: {
  model: HeadroomModel;
  currency: string | null;
  /** The result a cost is per (a MetaResultKind), or `none` when the account counts none. */
  result: string;
}) {
  const uiText = useTranslations('scale');
  const { cheapest, best } = model;
  if (!cheapest || !best) return null;
  return (
    <dl className="grid gap-1 text-xs sm:grid-cols-2" data-testid={`${TEST_ID}-callouts`}>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <dt className="shrink-0 text-muted-foreground">{uiText('cheapest_to_reach_1ed837d')}</dt>
        <dd className="min-w-0 truncate">
          {uiText.rich('b_label_b_cpm_fig_cpm_fig_77bbe21', {
            label: cheapest.label,
            cpm: formatCurrency(cheapest.cpm, currency),
            b: (chunks) => <span className="font-medium">{chunks}</span>,
            fig: (chunks) => (
              <span {...figureProps('board.headroom.cheapest.cpm', cheapest.cpm, currency, 'd30')}>
                {chunks}
              </span>
            ),
          })}
        </dd>
      </div>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <dt className="shrink-0 text-muted-foreground">{uiText('converts_best_fcc5df5')}</dt>
        <dd className="min-w-0 truncate">
          {uiText.rich('b_label_b_fig_cost_fig_per_result_select_purc_d238485', {
            label: best.label,
            cost: formatCurrency(best.costPerResult, currency),
            result,
            b: (chunks) => <span className="font-medium">{chunks}</span>,
            fig: (chunks) => (
              <span
                {...figureProps('board.headroom.best.cost', best.costPerResult, currency, 'd30')}
              >
                {chunks}
              </span>
            ),
          })}
        </dd>
      </div>
    </dl>
  );
}
