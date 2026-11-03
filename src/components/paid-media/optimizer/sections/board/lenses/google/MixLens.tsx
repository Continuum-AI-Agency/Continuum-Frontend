'use client';

// G05 Mix: where the Google money goes and what it buys. By campaign type, two whole bars — the
// spend and the results, each split by type — joined by a ribbon per type, so a type that takes
// more than it brings is seen at once; by campaign, a pair of bars per campaign when the account
// runs one type; by course line, each line's share of the spend against the share agreed with
// the client (the Optimizer's P4 finding). A small lens leads with its widest gap; a larger one
// draws the whole split, each part's cost against the portfolio goal and one takeaway sentence.

import type { BoardModuleSize, GoogleTopCampaigns } from '@continuum/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import { AlertTriangleIcon, CheckIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type FigureWindow, figureProps, formatCurrency } from '../../../../format';
import { useGoogleCampaigns } from '../../../google/googleReads';
import { figureWindowOf, windowRangeLabel } from '../../../platforms/googleAdsOverviewModel';
import {
  type GoogleAdsOverviewState,
  useGoogleAdsOverview,
} from '../../../platforms/useGoogleAdsOverview';
import { ModuleFrame, type ModuleFrameState } from '../../ModuleFrame';
import { BOARD_COLOR } from '../../palette';
import type { BoardModuleProps } from '../../types';
import {
  googleReadBlocked,
  isSmall,
  LENS_WINDOW_DAYS,
  Legend,
  type LegendItem,
  type LensBlocked,
  type LensCards,
  LensEmpty,
  LensHeadline,
  LensLoading,
  LensScope,
  LensTakeaway,
  LensWindowTag,
  NEUTRAL_MARK,
  TipMark,
  useLensCards,
  useLensWindow,
} from './MixAuctionSignalParts';
import { countLabel, findingsOf, shareLabel } from './mixAuctionSignalModel';
import {
  buildMix,
  type GoalStanding,
  goalStanding,
  type MixChannel,
  type MixLine,
  type MixLines,
  type MixModel,
  type MixRow,
  type MixSplit,
  mixHeadlineLine,
  mixHeadlineRow,
  mixTakeaway,
  needsCampaignRead,
} from './mixModel';

const CHANNEL_COLOR: Record<MixChannel, string> = {
  search: BOARD_COLOR.search,
  pmax: BOARD_COLOR.pmax,
  video: BOARD_COLOR.video,
  other: NEUTRAL_MARK,
};

/** A campaign's result bar takes its channel's colour; one the read gave no type keeps the muted
 *  text tone, which still stands apart from the neutral spend bar beside it. */
function resultColor(channel: MixChannel): string {
  return channel === 'other' ? 'var(--muted-foreground)' : CHANNEL_COLOR[channel];
}

const AGREED_TICK = 'color-mix(in srgb, var(--foreground) 55%, transparent)';

export type MixLensState =
  | { status: 'loading' }
  | LensBlocked
  | {
      status: 'ready';
      model: MixModel;
      currency: string | null;
      /** The window and source line under the chart. */
      scope: string;
      figureWindow: FigureWindow;
      /** The days the split covers, beside the title. */
      windowDays: number;
    };

/** What the frame says the lens could show; a split with fewer than two parts is `missing`. */
export function mixFrameState(state: MixLensState): ModuleFrameState {
  if (state.status !== 'ready') return state.status;
  return state.model.kind === 'empty' ? 'missing' : 'ready';
}

type CampaignRead = Pick<UseQueryResult<GoogleTopCampaigns>, 'data' | 'isError' | 'error'>;

/** The lens's state from its reads. The agreed lines stand on the P4 finding alone; the split by
 *  type on the Google tab's read; the split by campaign also on the campaign read. */
export function mixLensState({
  google,
  cards,
  campaigns,
  goal,
}: {
  google: GoogleAdsOverviewState;
  cards: LensCards;
  /** Null when the split by type stands without it. */
  campaigns: CampaignRead | null;
  goal: number | null;
}): MixLensState {
  if (cards.status === 'loading') return { status: 'loading' };
  const lineCard =
    cards.status === 'ready' ? (findingsOf(cards.cards, 'course_line_split')[0] ?? null) : null;
  if (lineCard) {
    return {
      status: 'ready',
      model: buildMix({ overview: null, campaigns: null, lineCard, bucket: null, goal: null }),
      currency: lineCard.currency,
      scope: "From the Optimizer's last cycle",
      figureWindow: figureWindowOf(lineCard.window_days),
      windowDays: lineCard.window_days,
    };
  }
  if (google.status === 'loading') return { status: 'loading' };
  if (google.status !== 'ready') {
    return googleReadBlocked(google) ?? { status: 'error', line: 'Google Ads could not be read.' };
  }
  if (campaigns?.isError) {
    return {
      status: 'error',
      line: `The campaigns could not be read: ${campaigns.error?.message ?? 'the read did not answer.'}`,
    };
  }
  if (campaigns && !campaigns.data) return { status: 'loading' };
  const { overview, resultBucket, account } = google;
  return {
    status: 'ready',
    model: buildMix({
      overview,
      campaigns: campaigns?.data ?? null,
      lineCard: null,
      bucket: resultBucket,
      // The goal prices the portfolios' result; with no single one it prices nothing here.
      goal: resultBucket ? goal : null,
    }),
    currency: account.currency,
    scope: `${windowRangeLabel(overview.since, overview.until)} · what Google reports`,
    figureWindow: figureWindowOf(overview.days),
    windowDays: overview.days,
  };
}

export default function MixLens({ ctx, slot }: BoardModuleProps) {
  const readWindow = useLensWindow();
  const google = useGoogleAdsOverview(ctx.brandId, readWindow);
  const cards = useLensCards(ctx.brandId);
  const ready = google.status === 'ready' ? google : null;
  const wantsCampaigns = ready != null && needsCampaignRead(ready.overview);
  const campaigns = useGoogleCampaigns({
    brandId: ctx.brandId,
    customerId: wantsCampaigns && ready ? ready.account.account_id : '',
    resultBucket: ready?.resultBucket ?? null,
    window: readWindow,
  });
  const state = mixLensState({
    google,
    cards,
    campaigns: wantsCampaigns ? campaigns : null,
    goal: ctx.reading.result.goal,
  });
  return <MixLensView reason={slot.reason} size={slot.size} state={state} />;
}

export function MixLensView({
  state,
  size,
  reason,
}: {
  state: MixLensState;
  size: BoardModuleSize;
  reason?: string;
}) {
  return (
    <ModuleFrame
      action={
        <LensWindowTag
          days={state.status === 'ready' ? state.windowDays : LENS_WINDOW_DAYS}
          testId="mix-window"
        />
      }
      reason={reason}
      size={size}
      state={mixFrameState(state)}
      testId="board-module-mix"
      title="Campaign mix"
    >
      <MixBody size={size} state={state} />
    </ModuleFrame>
  );
}

function MixBody({ state, size }: { state: MixLensState; size: BoardModuleSize }) {
  if (state.status === 'loading') return <LensLoading size={size} testId="mix" />;
  if (state.status !== 'ready') return <LensEmpty testId="mix-empty">{state.line}</LensEmpty>;
  const { model, currency, scope, figureWindow } = state;
  if (model.kind === 'empty') return <LensEmpty testId="mix-empty">{model.reason}</LensEmpty>;
  const small = isSmall(size);
  const takeaway = small ? null : mixTakeaway(model, currency);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-kind={model.kind} data-testid="mix-lens">
      {model.kind === 'line' ? (
        <LineView lines={model} small={small} figureWindow={figureWindow} />
      ) : model.kind === 'type' ? (
        <TypeView currency={currency} small={small} split={model} figureWindow={figureWindow} />
      ) : (
        <CampaignView currency={currency} small={small} split={model} figureWindow={figureWindow} />
      )}
      {small ? null : <LensScope>{scope}</LensScope>}
      {takeaway ? <LensTakeaway testId="mix-takeaway">{takeaway}</LensTakeaway> : null}
    </div>
  );
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function SplitHeadline({ split, figureWindow }: { split: MixSplit; figureWindow: FigureWindow }) {
  const lead = mixHeadlineRow(split);
  if (!lead) return null;
  const figure = figureProps(
    `board.mix.${lead.key}.spend-share`,
    Math.round(lead.spendShare * 100),
    null,
    figureWindow,
    'percent',
  );
  if (lead.resultShare == null) {
    return (
      <LensHeadline
        figure={figure}
        label={`${lead.label} · share of spend`}
        testId="mix-headline"
        value={shareLabel(lead.spendShare)}
      />
    );
  }
  return (
    <LensHeadline
      figure={figure}
      label={`${lead.label} · share of spend → share of ${split.words.many}`}
      testId="mix-headline"
      value={`${shareLabel(lead.spendShare)} → ${shareLabel(lead.resultShare)}`}
    />
  );
}

/** "62% of spend → 8% of leads": a part's two shares, as its row says them. */
function sharesLine(row: MixRow, split: MixSplit): string {
  const spend = `${shareLabel(row.spendShare)} of spend`;
  if (split.results == null) return spend;
  if (split.results === 0) return `${spend} · no ${split.words.many} in this window`;
  return `${spend} → ${shareLabel(row.resultShare ?? 0)} of ${split.words.many}`;
}

function costLine(row: MixRow, split: MixSplit, currency: string | null): string {
  if (row.costPerResult != null) {
    return `${formatCurrency(row.costPerResult, currency)} per ${split.words.one}`;
  }
  if (row.results != null) return `no ${split.words.one} yet`;
  return formatCurrency(row.spend, currency);
}

function GoalBadge({ standing }: { standing: GoalStanding }) {
  if (standing.side === 'on') {
    return (
      <Badge data-testid="mix-goal" variant="secondary">
        {standing.label}
      </Badge>
    );
  }
  const under = standing.side === 'under';
  return (
    <Badge data-testid="mix-goal" variant={under ? 'success' : 'destructive'}>
      {under ? <CheckIcon aria-hidden="true" /> : <AlertTriangleIcon aria-hidden="true" />}
      {standing.label}
    </Badge>
  );
}

// ── By campaign type: the two whole bars and their ribbons ─────────────────────────────────────

type Segment = { row: MixRow; x0: number; x1: number; share: number };

function segmentsOf(rows: readonly MixRow[], shareOf: (row: MixRow) => number): Segment[] {
  let at = 0;
  return rows.map((row) => {
    const share = shareOf(row);
    const segment = { row, x0: at * 100, x1: (at + share) * 100, share };
    at += share;
    return segment;
  });
}

/** A share prints inside its block only from this wide, where it fits with room to spare. */
const INSIDE_LABEL_MIN = 0.14;
/** The 2px surface gap between blocks, in the ribbons' 0–100 units at a lens's usual width. */
const RIBBON_GAP = 0.5;

function ribbonPath(top: Segment, bottom: Segment): string {
  const n = (value: number) => value.toFixed(2);
  const a0 = top.x0;
  const a1 = Math.max(top.x0, top.x1 - RIBBON_GAP);
  const b0 = bottom.x0;
  const b1 = Math.max(bottom.x0, bottom.x1 - RIBBON_GAP);
  return `M${n(a0)} 0C${n(a0)} 5 ${n(b0)} 5 ${n(b0)} 10L${n(b1)} 10C${n(b1)} 5 ${n(a1)} 5 ${n(a1)} 0Z`;
}

function SegmentBar({
  segments,
  measure,
  compact,
  onActive,
}: {
  segments: readonly Segment[];
  measure: string;
  compact: boolean;
  onActive: (key: string | null) => void;
}) {
  return (
    <div className={cn('relative w-full', compact ? 'h-4' : 'h-[22px]')}>
      {segments.map((segment, index) =>
        segment.share > 0 ? (
          <TipMark
            className="absolute inset-y-0"
            color={CHANNEL_COLOR[segment.row.channel]}
            delay={index * 0.06}
            fillClassName={compact ? 'inset-x-0 inset-y-1 rounded-full' : 'inset-0 rounded-[4px]'}
            key={segment.row.key}
            label={`${segment.row.label} · share of ${measure}`}
            onActive={(active) => onActive(active ? segment.row.key : null)}
            style={{
              left: `${segment.x0.toFixed(3)}%`,
              width: `max(2px, calc(${(segment.x1 - segment.x0).toFixed(3)}% - 2px))`,
            }}
            testId="mix-segment"
            value={shareLabel(segment.share)}
          >
            {!compact && segment.share >= INSIDE_LABEL_MIN && segment.row.channel !== 'other' ? (
              <span className="pointer-events-none absolute inset-y-0 left-1.5 flex items-center font-semibold text-white text-xs">
                {shareLabel(segment.share)}
              </span>
            ) : null}
          </TipMark>
        ) : null,
      )}
    </div>
  );
}

function BarCaption({ name, figure }: { name: string; figure: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="font-medium text-foreground">{name}</span>
      <span className="text-muted-foreground tabular-nums">{figure}</span>
    </div>
  );
}

function RibbonChart({
  split,
  currency,
  compact,
}: {
  split: MixSplit;
  currency: string | null;
  compact: boolean;
}) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<string | null>(null);
  const spend = segmentsOf(split.rows, (row) => row.spendShare);
  const results = split.results ? segmentsOf(split.rows, (row) => row.resultShare ?? 0) : null;
  const words = split.words;
  const summary = split.rows
    .map(
      (row) =>
        `${row.label}: ${shareLabel(row.spendShare)} of spend${row.resultShare == null ? '' : `, ${shareLabel(row.resultShare)} of ${words.many}`}`,
    )
    .join('. ');
  return (
    <figure
      aria-label={`Spend and ${words.many} by campaign type. ${summary}.`}
      className="min-w-0 space-y-1"
      data-testid="mix-ribbons"
    >
      {compact ? null : <BarCaption figure={formatCurrency(split.spend, currency)} name="Spend" />}
      <SegmentBar compact={compact} measure="spend" onActive={setActive} segments={spend} />
      {results ? (
        <>
          <svg
            aria-hidden="true"
            className={cn('block w-full', compact ? 'h-3' : 'h-9')}
            preserveAspectRatio="none"
            viewBox="0 0 100 10"
          >
            {spend.map((top, index) => {
              const bottom = results[index];
              if (!bottom || (top.share === 0 && bottom.share === 0)) return null;
              const opacity = active == null ? 0.16 : active === top.row.key ? 0.42 : 0.06;
              return (
                <motion.path
                  animate={{ opacity }}
                  d={ribbonPath(top, bottom)}
                  data-testid="mix-ribbon"
                  fill={CHANNEL_COLOR[top.row.channel]}
                  initial={reduce ? false : { opacity: 0 }}
                  key={top.row.key}
                  transition={{ duration: 0.45, delay: reduce || active != null ? 0 : 0.25 }}
                />
              );
            })}
          </svg>
          <SegmentBar
            compact={compact}
            measure={words.many}
            onActive={setActive}
            segments={results}
          />
          {compact ? null : (
            <BarCaption figure={countLabel(split.results ?? 0)} name={capitalized(words.many)} />
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-xs" data-testid="mix-no-results">
          {split.results === 0
            ? `No ${words.many} in this window: only the spend splits here.`
            : 'No single result is counted for these campaigns: only the spend splits here.'}
        </p>
      )}
    </figure>
  );
}

function legendOf(split: MixSplit): LegendItem[] {
  return split.rows.map((row) => ({ label: row.label, color: CHANNEL_COLOR[row.channel] }));
}

function TypeRows({ split, currency }: { split: MixSplit; currency: string | null }) {
  return (
    <ul className="divide-y divide-border/60" data-testid="mix-rows">
      {split.rows.map((row) => {
        const standing = goalStanding(row.costPerResult, split.goal);
        return (
          <li className="flex items-start gap-2 py-1.5 text-xs" data-testid="mix-row" key={row.key}>
            <span
              aria-hidden="true"
              className="mt-1 size-2.5 shrink-0 rounded-[3px]"
              style={{ background: CHANNEL_COLOR[row.channel] }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate" title={row.label}>
                <span className="font-medium text-foreground">{row.label}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {row.campaigns} {row.campaigns === 1 ? 'campaign' : 'campaigns'}
                </span>
              </p>
              <p className="text-muted-foreground" data-testid="mix-row-shares">
                {sharesLine(row, split)}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-semibold tabular-nums" data-testid="mix-row-cost">
                {costLine(row, split, currency)}
              </span>
              {standing ? <GoalBadge standing={standing} /> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TypeView({
  split,
  currency,
  small,
  figureWindow,
}: {
  split: MixSplit;
  currency: string | null;
  small: boolean;
  figureWindow: FigureWindow;
}) {
  return (
    <>
      {small ? <SplitHeadline split={split} figureWindow={figureWindow} /> : null}
      <RibbonChart compact={small} currency={currency} split={split} />
      {small ? (
        <Legend items={legendOf(split)} testId="mix-legend" />
      ) : (
        <TypeRows currency={currency} split={split} />
      )}
    </>
  );
}

// ── By campaign: a pair of bars per campaign ───────────────────────────────────────────────────

function CampaignView({
  split,
  currency,
  small,
  figureWindow,
}: {
  split: MixSplit;
  currency: string | null;
  small: boolean;
  figureWindow: FigureWindow;
}) {
  const rows = small ? split.rows.slice(0, 3) : split.rows;
  const longest = Math.max(
    ...split.rows.flatMap((row) => [row.spendShare, row.resultShare ?? 0]),
    0.0001,
  );
  const width = (share: number) => `${((share / longest) * 100).toFixed(2)}%`;
  const resultInk = resultColor(
    split.rows.find((row) => row.channel !== 'other')?.channel ?? 'other',
  );
  // Beside the results it bought, the spend is context and stays neutral; alone, it is the one
  // series and takes the campaigns' channel colour.
  const spendInk = (row: MixRow) => (split.results ? NEUTRAL_MARK : resultColor(row.channel));
  return (
    <>
      {small ? <SplitHeadline split={split} figureWindow={figureWindow} /> : null}
      <ul className="space-y-2" data-testid="mix-pairs">
        {rows.map((row, index) => {
          const standing = goalStanding(row.costPerResult, split.goal);
          return (
            <li className="min-w-0 space-y-1" data-testid="mix-pair" key={row.key}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate font-medium text-foreground" title={row.label}>
                  {row.label}
                </span>
                <span className="shrink-0 font-semibold tabular-nums" data-testid="mix-row-cost">
                  {costLine(row, split, currency)}
                </span>
              </div>
              <div className="space-y-0.5">
                <TipMark
                  className="h-3 min-w-[2px]"
                  color={spendInk(row)}
                  delay={index * 0.05}
                  fillClassName="inset-x-0 inset-y-0.5 rounded-full"
                  label={`${row.label} · share of spend`}
                  style={{ width: width(row.spendShare) }}
                  value={shareLabel(row.spendShare)}
                />
                {row.resultShare != null ? (
                  <TipMark
                    className="h-3 min-w-[2px]"
                    color={resultColor(row.channel)}
                    delay={index * 0.05 + 0.03}
                    fillClassName="inset-x-0 inset-y-0.5 rounded-full"
                    label={`${row.label} · share of ${split.words.many}`}
                    style={{ width: width(row.resultShare) }}
                    value={shareLabel(row.resultShare)}
                  />
                ) : null}
              </div>
              {small ? null : (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
                  <span data-testid="mix-row-shares">{sharesLine(row, split)}</span>
                  {standing ? <GoalBadge standing={standing} /> : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {split.results == null ? (
        <p className="text-muted-foreground text-xs" data-testid="mix-no-results">
          No single result is counted for these campaigns: only the spend splits here.
        </p>
      ) : null}
      <Legend
        items={[
          { label: 'Share of spend', color: split.results ? NEUTRAL_MARK : resultInk },
          ...(split.results ? [{ label: `Share of ${split.words.many}`, color: resultInk }] : []),
        ]}
        testId="mix-legend"
      />
    </>
  );
}

// ── By course line: each line's share against the agreed one ──────────────────────────────────

function lineColor(row: MixLine): string {
  if (!row.flagged || row.target == null) return NEUTRAL_MARK;
  return row.share > row.target ? BOARD_COLOR.above : BOARD_COLOR.below;
}

function signedPoints(points: number): string {
  return `${points > 0 ? '+' : ''}${points} pts`;
}

function lineLegend(lines: MixLines): LegendItem[] {
  const items: LegendItem[] = [];
  const off = lines.rows.filter((row) => row.flagged && row.target != null);
  if (off.some((row) => row.share > (row.target ?? 0))) {
    items.push({ label: 'Over the agreed share', color: BOARD_COLOR.above });
  }
  if (off.some((row) => row.share < (row.target ?? 0))) {
    items.push({ label: 'Under the agreed share', color: BOARD_COLOR.below });
  }
  if (lines.rows.some((row) => !row.flagged)) {
    items.push({ label: 'On the agreed split', color: NEUTRAL_MARK });
  }
  items.push({ label: 'Agreed share', color: AGREED_TICK, mark: 'tick' });
  return items;
}

function LineView({
  lines,
  small,
  figureWindow,
}: {
  lines: MixLines;
  small: boolean;
  figureWindow: FigureWindow;
}) {
  const lead = mixHeadlineLine(lines);
  const top = Math.min(
    1,
    Math.max(...lines.rows.flatMap((row) => [row.share, row.target ?? 0]), 0.0001) * 1.15,
  );
  const at = (share: number) => `${((share / top) * 100).toFixed(2)}%`;
  const rows = small && lead ? [lead] : lines.rows;
  return (
    <>
      {small && lead ? (
        <LensHeadline
          figure={figureProps(
            'board.mix.line.share',
            Math.round(lead.share * 100),
            null,
            figureWindow,
            'percent',
          )}
          label={
            lead.target == null
              ? `${lead.label} · share of spend`
              : `${lead.label} · share of spend, agreed ${shareLabel(lead.target)}`
          }
          testId="mix-headline"
          value={shareLabel(lead.share)}
        />
      ) : null}
      <ul className="space-y-2.5" data-testid="mix-lines">
        {rows.map((row, index) => (
          <li
            className="min-w-0 space-y-1"
            data-flagged={row.flagged ? 'true' : 'false'}
            data-testid="mix-line"
            key={row.label}
          >
            {small ? null : (
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate font-medium text-foreground" title={row.label}>
                  {row.label}
                </span>
                <span className="shrink-0 tabular-nums" data-testid="mix-line-share">
                  <span className="font-semibold">{shareLabel(row.share)}</span>
                  {row.target == null ? null : (
                    <span className="text-muted-foreground">
                      {' '}
                      · agreed {shareLabel(row.target)}
                    </span>
                  )}
                </span>
              </div>
            )}
            <div className="relative h-3">
              <span
                aria-hidden="true"
                className="absolute inset-x-0 inset-y-[3px] rounded-full bg-muted"
              />
              <TipMark
                className="absolute inset-y-0 left-0 min-w-[2px]"
                color={lineColor(row)}
                delay={index * 0.06}
                fillClassName="inset-x-0 inset-y-[3px] rounded-full"
                label={`${row.label} · share of spend`}
                style={{ width: at(row.share) }}
                value={shareLabel(row.share)}
              />
              {row.target == null ? null : (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-y-0.5 border-l-[1.5px] border-dashed"
                  data-testid="mix-line-agreed"
                  style={{ left: at(row.target), borderColor: AGREED_TICK }}
                />
              )}
            </div>
            {small ? null : (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
                <span data-testid="mix-line-spend">
                  {formatCurrency(row.spend, lines.currency)}
                </span>
                {row.deviation == null ? null : (
                  <Badge
                    data-testid="mix-line-deviation"
                    variant={row.flagged ? 'destructive' : 'success'}
                  >
                    {row.flagged ? (
                      <AlertTriangleIcon aria-hidden="true" />
                    ) : (
                      <CheckIcon aria-hidden="true" />
                    )}
                    {signedPoints(row.deviation)}
                  </Badge>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <Legend items={lineLegend(lines)} testId="mix-legend" />
    </>
  );
}
