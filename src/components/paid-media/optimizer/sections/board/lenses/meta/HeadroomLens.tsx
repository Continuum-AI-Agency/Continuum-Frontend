'use client';
import {
  useLocale as useAuditLocale,
  useTranslations as useBetaTranslations,
  useLocale as useNumberLocale,
} from 'next-intl';
import { resultWordsUi } from './metaLensModel';

// Delivery headroom (Meta twin of G06): CPM against cost per result, one point per branch (or
// campaign), each as large as its spend and colored by its cost against the goal, with the goal
// as a dashed line. Low on both axes is room to spend more. The view rings and names the
// cheapest to reach and the best at converting. Small, it leads with the CPM spread over a bare
// scatter; at m or l it draws the axes, the labels and the takeaway.

import type { BoardModuleSize } from '@continuum/contracts';
import { motion, useReducedMotion } from 'motion/react';
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
  const betaUiText = useBetaTranslations('scale');

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
      title={betaUiText('beta_f24c4a7d1889')}
    >
      {campaigns.status !== 'ready' ? (
        <ReadNote size={slot.size} state={campaigns} testId={TEST_ID} what="campaigns" />
      ) : mix && model && model.points.length > 0 ? (
        <HeadroomView currency={ctx.currency} mix={mix} model={model} size={slot.size} />
      ) : (
        <LensNote testId={`${TEST_ID}-empty`}>
          {mix
            ? betaUiText('beta_d9e7643b37e7', {
                value0: String(
                  (mix.result ? resultWordsUi(mix.result.kind, betaUiText).many : undefined) ??
                    'results',
                ),
              })
            : betaUiText('beta_57b869c75f73')}
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
function tickText(value: number, currency: string | null, locale: string = 'en-US'): string {
  return `${currencySymbol(currency)}${value.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
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
  const auditLocale = useAuditLocale();

  const numberLocale = useNumberLocale();

  const betaUiText = useBetaTranslations('scale');

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
  const words = mix.result ? resultWordsUi(mix.result.kind, betaUiText) : null;
  const goalText =
    goal != null
      ? betaUiText('beta_f4da73c83194', {
          value0: String(tickText(goal, currency, auditLocale)),
        })
      : '';
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
      <span>CPM {formatCurrency(point.cpm, currency, numberLocale)}</span>
      <span>
        {formatCurrency(point.costPerResult, currency, numberLocale)}{' '}
        {betaUiText('beta_b427c3dec904')} {words?.one ?? betaUiText('beta_f6a214f7a5fc')}
      </span>
      <span>
        {formatCurrency(point.spend, currency, numberLocale)} {betaUiText('beta_f64a33ff88c3')}
      </span>
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
            : `${model.points.length} ${mix.by === 'branch' ? 'branches' : 'campaigns'} · size: spend`
        }
        testId={TEST_ID}
      />
      <div className="relative w-full" ref={host}>
        <svg
          aria-label={betaUiText('beta_0c9ad31f06b9', {
            value0: String(words?.one ?? betaUiText('metaResultSingle')),
            value1: String(mix.by),
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
                    {tickText(tick, currency, auditLocale)}
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
                  {tickText(tick, currency, auditLocale)}
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
                {betaUiText('beta_9221bd5cd9df')} {words?.one ?? betaUiText('beta_f6a214f7a5fc')}
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
                transition={{
                  duration: 0.45,
                  delay: index * 0.06,
                  ease: ENTER_EASE,
                }}
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
          <Callouts
            currency={currency}
            model={model}
            unitOne={words?.one ?? betaUiText('metaResultSingle')}
          />
          <LegendRow>
            <LegendItem
              color={BOARD_COLOR.below}
              label={betaUiText('beta_d1d4fc8b319e', {
                value0: String(referenceName),
              })}
              variant="dot"
            />
            {model.points.some((point) => point.tone === 'mid') ? (
              <LegendItem
                color={BOARD_COLOR.mid}
                label={betaUiText('beta_b10e9eb28dc0', {
                  value0: String(referenceName),
                })}
                variant="dot"
              />
            ) : null}
            <LegendItem
              color={BOARD_COLOR.above}
              label={betaUiText('beta_fad31ed8fa01', {
                value0: String(referenceName),
              })}
              variant="dot"
            />
            {goal != null ? (
              <LegendItem
                label={betaUiText('beta_966faaa3d319', {
                  value0: String(formatCurrency(goal, currency, numberLocale)),
                  value1: String(words?.one ?? betaUiText('metaResultSingle')),
                })}
                variant="dashed"
              />
            ) : null}
          </LegendRow>
          {model.unplaced.length > 0 ? (
            <LensNote testId={`${TEST_ID}-unplaced`}>
              {betaUiText('beta_1ea442a134b2')} {words?.many ?? betaUiText('beta_c099142bc318')}{' '}
              {betaUiText('beta_b9a4b8e1228b')} {model.unplaced.map((row) => row.label).join(', ')}.
            </LensNote>
          ) : null}
          {model.smallCount > 0 ? (
            <LensNote>
              {model.smallCount} {betaUiText('beta_e823da61abfb')}{' '}
              {mix.by === 'branch'
                ? betaUiText('beta_4ed379d418bb')
                : betaUiText('beta_7a4c3d21f9c6')}{' '}
              {betaUiText('beta_5c4c8c0b6008')}
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
  unitOne,
}: {
  model: HeadroomModel;
  currency: string | null;
  unitOne: string;
}) {
  const numberLocale = useNumberLocale();

  const betaUiText = useBetaTranslations('scale');

  const { cheapest, best } = model;
  if (!cheapest || !best) return null;
  return (
    <dl className="grid gap-1 text-xs sm:grid-cols-2" data-testid={`${TEST_ID}-callouts`}>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <dt className="shrink-0 text-muted-foreground">{betaUiText('beta_1ed837d9a1a7')}</dt>
        <dd className="min-w-0 truncate">
          <span className="font-medium">{cheapest.label}</span> {betaUiText('beta_44edc01a0114')}{' '}
          <span {...figureProps('board.headroom.cheapest.cpm', cheapest.cpm, currency, 'd30')}>
            {formatCurrency(cheapest.cpm, currency, numberLocale)}
          </span>
        </dd>
      </div>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <dt className="shrink-0 text-muted-foreground">{betaUiText('beta_fcc5df5a7763')}</dt>
        <dd className="min-w-0 truncate">
          <span className="font-medium">{best.label}</span> ·{' '}
          <span {...figureProps('board.headroom.best.cost', best.costPerResult, currency, 'd30')}>
            {formatCurrency(best.costPerResult, currency, numberLocale)}
          </span>{' '}
          {betaUiText('beta_b427c3dec904')} {unitOne}
        </dd>
      </div>
    </dl>
  );
}
