'use client';

// Branches (Meta twin of G05): each branch's share of the spend against its share of the
// results, and what a result costs there against the goal. On an account that runs one
// campaign per branch the rows are the branches (every campaign that names one, summed);
// otherwise they are the campaigns. Small, it leads with the cheapest-to-dearest cost and a bar
// per branch; at m or l it draws both shares per row, the cost beside them and the takeaway.

import type { BoardModuleSize } from '@continuum/contracts';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo, useRef } from 'react';
import { figureProps, formatCurrency } from '@/components/paid-media/optimizer/format';
import { cn } from '@/lib/utils';
import { BOARD_COLOR } from '../../palette';
import type { BoardModuleProps } from '../../types';
import { buildMix, foldTail, type MixModel, type MixRow, mixHeadline } from './branchesModel';
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
  WindowLine,
} from './MetaLensParts';
import { formatShare, vsReferenceText } from './metaLensModel';
import { useMetaRanking } from './metaReads';

const TEST_ID = 'board-module-branches';
const MAX_ROWS: Record<BoardModuleSize, number> = { s: 5, m: 6, l: 8, w: 8 };

export default function BranchesLens({ ctx, slot }: BoardModuleProps) {
  const campaigns = useMetaRanking(ctx.brandId, ctx.adAccountId, 'top_campaigns');
  const model = useMemo(
    () =>
      campaigns.status === 'ready' ? buildMix(campaigns.data, ctx.portfolios, ctx.currency) : null,
    [campaigns, ctx.portfolios, ctx.currency],
  );
  return (
    <MetaFrame
      slot={slot}
      state={frameStateOf(campaigns.status, model != null)}
      testId={TEST_ID}
      title="Branches"
    >
      {campaigns.status !== 'ready' ? (
        <ReadNote size={slot.size} state={campaigns} testId={TEST_ID} what="campaigns" />
      ) : model ? (
        <BranchesView currency={ctx.currency} model={model} size={slot.size} />
      ) : (
        <LensNote testId={`${TEST_ID}-empty`}>No campaign spent in the last 30 days.</LensNote>
      )}
    </MetaFrame>
  );
}

export function BranchesView({
  model,
  size,
  currency,
}: {
  model: MixModel;
  size: BoardModuleSize;
  currency: string | null;
}) {
  return size === 's' ? (
    <BranchesSmall currency={currency} model={model} />
  ) : (
    <BranchesFull currency={currency} model={model} size={size} />
  );
}

function rowTip(row: MixRow, model: MixModel, currency: string | null) {
  const words = model.result?.en;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-medium">{row.label}</span>
      <span>
        {formatCurrency(row.spend, currency)} spend · {formatShare(row.spendShare)}
      </span>
      {words && row.results != null ? (
        <span>
          {row.results.toLocaleString('en-US')} {row.results === 1 ? words.one : words.many} ·{' '}
          {formatShare(row.resultShare)}
        </span>
      ) : null}
      {words && row.costPerResult != null ? (
        <span>
          {formatCurrency(row.costPerResult, currency)} per {words.one}
        </span>
      ) : null}
    </span>
  );
}

function BranchesSmall({ model, currency }: { model: MixModel; currency: string | null }) {
  const reduce = useReducedMotion();
  const headline = mixHeadline(model, currency);
  const rows = foldTail(model, MAX_ROWS.s).filter((row) => row.costPerResult != null);
  const goal = model.reference?.kind === 'goal' ? model.reference.value : null;
  const max = Math.max(goal ?? 0, ...rows.map((row) => row.costPerResult ?? 0)) * 1.05 || 1;
  return (
    <div className="flex flex-col gap-3">
      <Headline
        caption={headline.caption}
        figure={headline.figure}
        testId={`${TEST_ID}-headline`}
      />
      <WindowLine testId={TEST_ID} />
      {rows.length > 0 ? (
        <ul aria-label={headline.caption} className="flex flex-col gap-1.5">
          {rows.map((row, index) => (
            <li
              className="grid grid-cols-[minmax(3.5rem,5.5rem)_minmax(0,1fr)_auto] items-center gap-2 text-xs"
              key={row.key}
            >
              <span className="truncate text-muted-foreground" title={row.label}>
                {row.label}
              </span>
              <span className="relative h-1.5">
                <motion.span
                  animate={{ scaleX: 1 }}
                  className="absolute inset-y-0 left-0 rounded-full"
                  initial={reduce ? false : { scaleX: 0 }}
                  style={{
                    width: `${((row.costPerResult ?? 0) / max) * 100}%`,
                    background: toneColor(row.tone),
                    originX: 0,
                  }}
                  transition={{ duration: 0.6, delay: index * 0.05, ease: ENTER_EASE }}
                />
                {goal != null ? (
                  <span
                    aria-hidden="true"
                    className="absolute -inset-y-1 border-foreground/50 border-l border-dashed"
                    style={{ left: `${(goal / max) * 100}%` }}
                  />
                ) : null}
              </span>
              <span className="font-mono tabular-nums">
                {formatCurrency(row.costPerResult, currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <LensNote>No {model.result?.en.many ?? 'results'} in the last 30 days.</LensNote>
      )}
    </div>
  );
}

/** The spend share's hollow capsule: money put in, never mistaken for a result bar. */
const SPEND_OUTLINE =
  'inset 0 0 0 1.5px color-mix(in srgb, var(--muted-foreground) 70%, transparent)';

/** One share as a bar, labelled at its end. The longest share fills the row less the label. */
function ShareBar({
  share,
  max,
  color,
  delay,
  reduce,
}: {
  share: number | null;
  max: number;
  /** A fill, or null for the hollow spend capsule. */
  color: string | null;
  delay: number;
  reduce: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {share != null ? (
        <motion.span
          animate={{ scaleX: 1 }}
          className="block h-1.5 shrink-0 rounded-full"
          initial={reduce ? false : { scaleX: 0 }}
          style={{
            width: `calc((100% - 2.75rem) * ${Math.max(share > 0 ? 0.015 : 0, share / max)})`,
            ...(color ? { background: color } : { boxShadow: SPEND_OUTLINE }),
            originX: 0,
          }}
          transition={{ duration: 0.6, delay, ease: ENTER_EASE }}
        />
      ) : null}
      <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
        {formatShare(share)}
      </span>
    </span>
  );
}

function BranchesFull({
  model,
  size,
  currency,
}: {
  model: MixModel;
  size: BoardModuleSize;
  currency: string | null;
}) {
  const reduce = useReducedMotion() ?? false;
  const host = useRef<HTMLDivElement>(null);
  const { tip, show, hide } = useChartTip(host);
  const rows = foldTail(model, MAX_ROWS[size]);
  const max = Math.max(...rows.map((row) => Math.max(row.spendShare, row.resultShare ?? 0)), 0.01);
  const words = model.result?.en;
  const noun = model.by === 'branch' ? 'branches' : 'campaigns';
  const reference = model.reference;
  return (
    <div className="flex flex-col gap-3">
      <WindowLine
        detail={`${
          model.by === 'branch'
            ? `${model.rows.filter((row) => !row.folded).length} ${noun} from ${model.campaignCount} campaigns`
            : `${model.campaignCount} campaigns`
        }${
          words && model.totals.results != null
            ? ` · ${model.totals.results.toLocaleString('en-US')} ${words.many}`
            : ''
        }`}
        testId={TEST_ID}
      />
      <div className="relative" ref={host}>
        <ul
          aria-label={`Share of spend and of ${words?.many ?? 'results'} by ${model.by}`}
          className="flex flex-col gap-2.5"
        >
          {rows.map((row, index) => (
            <li
              className={cn(
                'grid grid-cols-[minmax(4.5rem,8.5rem)_minmax(0,1fr)_auto] items-center gap-x-3',
                row.folded && 'text-muted-foreground',
              )}
              data-testid={`${TEST_ID}-row`}
              key={row.key}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-xs" title={row.label}>
                  {row.label}
                </span>
                {model.by === 'branch' && !row.folded && row.campaignIds.length > 1 ? (
                  <span className="block text-muted-foreground text-xs">
                    {row.campaignIds.length} campaigns
                  </span>
                ) : null}
              </span>
              <span
                aria-label={`${row.label}: ${formatShare(row.spendShare)} of spend, ${formatShare(row.resultShare)} of ${words?.many ?? 'results'}`}
                className="flex min-w-0 flex-col gap-1"
                onPointerEnter={(event) => show(event, rowTip(row, model, currency))}
                onPointerLeave={hide}
                role="img"
              >
                <ShareBar
                  color={null}
                  delay={index * 0.05}
                  max={max}
                  reduce={reduce}
                  share={row.spendShare}
                />
                <ShareBar
                  color={toneColor(row.tone)}
                  delay={index * 0.05 + 0.08}
                  max={max}
                  reduce={reduce}
                  share={row.resultShare}
                />
              </span>
              <span className="min-w-0 text-right">
                <span
                  className="block font-medium font-mono text-xs tabular-nums"
                  {...figureProps(
                    `board.branches.${row.key}.cost`,
                    row.costPerResult,
                    currency,
                    'd30',
                  )}
                >
                  {row.costPerResult != null
                    ? formatCurrency(row.costPerResult, currency)
                    : `No ${words?.many ?? 'results'}`}
                </span>
                {row.costPerResult != null && reference ? (
                  <span className="flex items-center justify-end gap-1 text-muted-foreground text-xs">
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full"
                      style={{ background: toneColor(row.tone) }}
                    />
                    {vsReferenceText(row.costPerResult, reference)}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <ChartTip tip={tip} />
      </div>
      <LegendRow>
        <LegendItem label="Share of spend" variant="outline" />
        <LegendItem
          color={BOARD_COLOR.below}
          label={`Share of ${words?.many ?? 'results'} · under ${reference?.kind === 'average' ? 'average' : 'goal'}`}
        />
        {model.rows.some((row) => row.tone === 'mid' && row.costPerResult != null) ? (
          <LegendItem color={BOARD_COLOR.mid} label="on it" />
        ) : null}
        <LegendItem color={BOARD_COLOR.above} label="over" />
        {reference && words ? (
          <span data-testid={`${TEST_ID}-reference`}>
            Cost per {words.one} ·{' '}
            {reference.kind === 'goal'
              ? `goal ${formatCurrency(reference.value, currency)}${reference.source ? ` (${reference.source})` : ''}`
              : `account average ${formatCurrency(reference.value, currency)}`}
          </span>
        ) : null}
      </LegendRow>
      <Takeaway testId={`${TEST_ID}-takeaway`} text={model.takeaway} />
    </div>
  );
}
