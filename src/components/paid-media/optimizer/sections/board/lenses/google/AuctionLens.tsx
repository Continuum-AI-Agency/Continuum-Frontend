'use client';

// G06 Auction: what each Search campaign wins of its auctions and why it loses the rest. One
// stacked bar per campaign — shown, lost to budget, lost to rank, Google's own shares — with the
// V3 case marked (half or more lost to budget) and its raise shown locked when the V3 finding says
// the primary conversion must be fixed first. When the account does not deliver (G12's account
// card, E1's dark days) the lens becomes the calendar of the days it showed no ad, because no
// impression share means anything while nothing serves.

import type { BoardModuleSize, GoogleTopCampaigns } from '@continuum/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import { AlertTriangleIcon, LockIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type FigureWindow, figureProps, formatCurrency } from '../../../../format';
import { type GoogleReadWindow, useGoogleCampaigns } from '../../../google/googleReads';
import { shareText } from '../../../google/views/cell';
import { figureWindowOf, windowRangeLabel } from '../../../platforms/googleAdsOverviewModel';
import {
  type GoogleAdsOverviewState,
  useGoogleAdsOverview,
} from '../../../platforms/useGoogleAdsOverview';
import { ModuleFrame, type ModuleFrameState } from '../../ModuleFrame';
import { BOARD_COLOR } from '../../palette';
import type { BoardModuleProps } from '../../types';
import {
  type AuctionChannel,
  type AuctionDark,
  type AuctionModel,
  type AuctionRow,
  type AuctionShares,
  auctionDarkTakeaway,
  auctionHeadline,
  auctionTakeaway,
  buildAuctionDark,
  buildAuctionShares,
  type CalendarDay,
  V3_BUDGET_LOST,
} from './auctionModel';
import {
  CARDS_UNREAD,
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

const CHANNEL_NAME: Record<AuctionChannel, string> = {
  search: 'Search',
  pmax: 'Performance Max',
};

const CHANNEL_COLOR: Record<AuctionChannel, string> = {
  search: BOARD_COLOR.search,
  pmax: BOARD_COLOR.pmax,
};

/** The three parts of a campaign's eligible impressions. What it won is context and stays
 *  neutral; the two losses take the warm and the cool pole, because they call for opposite
 *  fixes: budget buys back the first, only ads, pages and bids the second. */
const PARTS = [
  { key: 'shown', label: 'Shown', color: NEUTRAL_MARK, of: (row: AuctionRow) => row.shown },
  {
    key: 'budget',
    label: 'Lost to budget',
    color: BOARD_COLOR.above,
    of: (row: AuctionRow) => row.budgetLost,
  },
  {
    key: 'rank',
    label: 'Lost to rank',
    color: BOARD_COLOR.below,
    of: (row: AuctionRow) => row.rankLost,
  },
] as const;

const SERVED_INK = (percent: number) =>
  `color-mix(in srgb, var(--foreground) ${percent}%, transparent)`;
const UNREAD_FILL = 'var(--muted)';

export type AuctionLensState =
  | { status: 'loading' }
  | LensBlocked
  | {
      status: 'ready';
      model: AuctionModel;
      currency: string | null;
      scope: string;
      figureWindow: FigureWindow;
      /** The days the lens covers, beside the title. */
      windowDays: number;
      /** The Optimizer's cards did not answer: no V3 lock or dark day can be told. */
      cardsUnread: boolean;
    };

/** What the frame says the lens could show; no campaign on Search is `missing`. */
export function auctionFrameState(state: AuctionLensState): ModuleFrameState {
  if (state.status !== 'ready') return state.status;
  return state.model.kind === 'empty' ? 'missing' : 'ready';
}

type CampaignRead = Pick<UseQueryResult<GoogleTopCampaigns>, 'data' | 'isError' | 'error'>;

function enDay(day: string): string {
  return windowRangeLabel(day, day).split(' – ')[0] ?? day;
}

/** The lens's state from its reads. The calendar stands on the cards alone; the shares on the
 *  Google tab's account and the campaign read, with the cards for the V3 lock. */
export function auctionLensState({
  google,
  cards,
  dark,
  campaigns,
  readWindow,
}: {
  google: GoogleAdsOverviewState;
  cards: LensCards;
  dark: AuctionDark | null;
  campaigns: CampaignRead;
  readWindow: GoogleReadWindow;
}): AuctionLensState {
  if (cards.status === 'loading') return { status: 'loading' };
  if (dark) {
    const days = dark.weeks?.flat().filter((day) => day.inRange) ?? [];
    const first = days[0]?.day;
    const last = days[days.length - 1]?.day;
    return {
      status: 'ready',
      model: dark,
      currency: dark.currency,
      scope:
        first && last
          ? `${enDay(first)} – ${enDay(last)} · the days Google showed no ad, from the Optimizer's last cycle`
          : "Google's delivery status, from the Optimizer's last cycle",
      figureWindow: 'none',
      windowDays: dark.windowDays,
      cardsUnread: false,
    };
  }
  if (google.status === 'loading') return { status: 'loading' };
  if (google.status !== 'ready') {
    return googleReadBlocked(google) ?? { status: 'error', line: 'Google Ads could not be read.' };
  }
  if (campaigns.isError) {
    return {
      status: 'error',
      line: `The campaigns could not be read: ${campaigns.error?.message ?? 'the read did not answer.'}`,
    };
  }
  if (!campaigns.data) return { status: 'loading' };
  const shares = buildAuctionShares(campaigns.data, cards.status === 'ready' ? cards.cards : []);
  const days = Math.round(
    (Date.parse(readWindow.until) - Date.parse(readWindow.since)) / 86_400_000 + 1,
  );
  return {
    status: 'ready',
    model:
      shares.rows.length > 0
        ? shares
        : { kind: 'empty', reason: 'No campaign served on Search in this window.' },
    currency: campaigns.data.currency ?? google.account.currency,
    scope: `${windowRangeLabel(shares.since, shares.until)} · Google's impression share on Search, per campaign`,
    figureWindow: figureWindowOf(days),
    windowDays: days,
    cardsUnread: cards.status === 'error' || cards.status === 'unavailable',
  };
}

export default function AuctionLens({ ctx, slot }: BoardModuleProps) {
  const readWindow = useLensWindow();
  const google = useGoogleAdsOverview(ctx.brandId, readWindow);
  const cards = useLensCards(ctx.brandId);
  const today = new Date().toISOString().slice(0, 10);
  const dark = useMemo(
    () =>
      cards.status === 'ready'
        ? buildAuctionDark(cards.candidates, cards.cards, readWindow, today)
        : null,
    [cards, readWindow, today],
  );
  const ready = google.status === 'ready' && !dark ? google : null;
  const campaigns = useGoogleCampaigns({
    brandId: ctx.brandId,
    customerId: ready?.account.account_id ?? '',
    resultBucket: ready?.resultBucket ?? null,
    window: readWindow,
  });
  const state = auctionLensState({ google, cards, dark, campaigns, readWindow });
  return <AuctionLensView reason={slot.reason} size={slot.size} state={state} />;
}

export function AuctionLensView({
  state,
  size,
  reason,
}: {
  state: AuctionLensState;
  size: BoardModuleSize;
  reason?: string;
}) {
  return (
    <ModuleFrame
      action={
        <LensWindowTag
          days={state.status === 'ready' ? state.windowDays : LENS_WINDOW_DAYS}
          testId="auction-window"
        />
      }
      reason={reason}
      size={size}
      state={auctionFrameState(state)}
      testId="board-module-auction"
      title="Impression share"
    >
      <AuctionBody size={size} state={state} />
    </ModuleFrame>
  );
}

function AuctionBody({ state, size }: { state: AuctionLensState; size: BoardModuleSize }) {
  if (state.status === 'loading') return <LensLoading size={size} testId="auction" />;
  if (state.status !== 'ready') {
    return <LensEmpty testId="auction-empty">{state.line}</LensEmpty>;
  }
  const { model, currency, scope } = state;
  if (model.kind === 'empty') return <LensEmpty testId="auction-empty">{model.reason}</LensEmpty>;
  const small = isSmall(size);
  const takeaway = small
    ? null
    : model.kind === 'dark'
      ? auctionDarkTakeaway(model)
      : auctionTakeaway(model);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-kind={model.kind} data-testid="auction-lens">
      {model.kind === 'dark' ? (
        <DarkView currency={currency} dark={model} small={small} />
      ) : (
        <SharesView
          currency={currency}
          figureWindow={state.figureWindow}
          model={model}
          size={size}
        />
      )}
      {small ? null : <LensScope>{scope}</LensScope>}
      {!small && state.cardsUnread ? (
        <p className="text-muted-foreground text-xs" data-testid="auction-cards-unread">
          {CARDS_UNREAD}
        </p>
      ) : null}
      {takeaway ? <LensTakeaway testId="auction-takeaway">{takeaway}</LensTakeaway> : null}
    </div>
  );
}

// ── The shares, a stacked bar per campaign ─────────────────────────────────────────────────────

function ShareStack({ row, index }: { row: AuctionRow; index: number }) {
  const parts = PARTS.flatMap((part) => {
    const value = part.of(row);
    return value != null && value > 0 ? [{ ...part, value }] : [];
  });
  const rest = Math.max(0, 1 - parts.reduce((sum, part) => sum + part.value, 0));
  return (
    <div className="flex h-3.5 w-full gap-0.5" data-testid="auction-stack">
      {parts.map((part, order) => (
        <TipMark
          className="h-full min-w-[2px] shrink"
          color={part.color}
          delay={index * 0.06 + order * 0.05}
          fillClassName="inset-0 rounded-[4px]"
          key={part.key}
          label={`${row.name} · ${part.label}`}
          style={{ flexBasis: `${(part.value * 100).toFixed(2)}%`, flexGrow: 0 }}
          testId={`auction-part-${part.key}`}
          value={shareText(part.value)}
        />
      ))}
      {rest > 0.005 ? (
        <span
          aria-hidden="true"
          className="h-full shrink rounded-[4px]"
          data-testid="auction-part-unread"
          style={{ flexBasis: `${(rest * 100).toFixed(2)}%`, flexGrow: 0, background: UNREAD_FILL }}
        />
      ) : null}
    </div>
  );
}

function shareOrDash(share: number | null): string {
  return share == null ? '—' : shareText(share);
}

function ShareRow({
  row,
  index,
  currency,
  small,
}: {
  row: AuctionRow;
  index: number;
  currency: string | null;
  small: boolean;
}) {
  return (
    <li
      className="min-w-0 space-y-1"
      data-locked={row.locked ? 'true' : 'false'}
      data-testid="auction-row"
      data-v3={row.v3 ? 'true' : 'false'}
    >
      {small ? null : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span className="min-w-0 truncate font-medium text-foreground" title={row.name}>
            {row.name}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ background: CHANNEL_COLOR[row.channel] }}
            />
            {CHANNEL_NAME[row.channel]}
          </span>
          {row.budgetPerDay != null ? (
            <span className="ml-auto text-muted-foreground tabular-nums">
              {formatCurrency(row.budgetPerDay, currency)}/day
            </span>
          ) : null}
        </div>
      )}
      <ShareStack index={index} row={row} />
      {small ? null : (
        <div
          className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-muted-foreground text-xs"
          data-testid="auction-row-shares"
        >
          <span>Shown {shareOrDash(row.shown)}</span>
          <span>Lost to budget {shareOrDash(row.budgetLost)}</span>
          <span>Lost to rank {shareOrDash(row.rankLost)}</span>
        </div>
      )}
      {!small && (row.v3 || row.locked) ? (
        <div className="flex flex-wrap gap-1.5">
          {row.v3 ? (
            <Badge data-testid="auction-v3" variant="destructive">
              <AlertTriangleIcon aria-hidden="true" />
              {`${shareText(V3_BUDGET_LOST)} or more lost to budget`}
            </Badge>
          ) : null}
          {row.locked ? (
            <Badge data-testid="auction-locked" variant="secondary">
              <LockIcon aria-hidden="true" />
              Raise locked
            </Badge>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function sharesLegend(model: AuctionShares): LegendItem[] {
  const items: LegendItem[] = [
    { label: 'Shown', color: NEUTRAL_MARK },
    { label: 'Lost to budget · more budget buys it back', color: BOARD_COLOR.above },
    { label: 'Lost to rank · ads, pages and bids win it', color: BOARD_COLOR.below },
  ];
  const unread = model.rows.some((row) => PARTS.some((part) => part.of(row) == null));
  return unread ? [...items, { label: 'Not in this read', color: UNREAD_FILL }] : items;
}

function SharesView({
  model,
  currency,
  size,
  figureWindow,
}: {
  model: AuctionShares;
  currency: string | null;
  size: BoardModuleSize;
  figureWindow: FigureWindow;
}) {
  const small = isSmall(size);
  const headline = auctionHeadline(model);
  const rows = small
    ? headline
      ? [headline.row]
      : model.rows.slice(0, 1)
    : model.rows.slice(0, size === 'm' ? 4 : 6);
  const reasons = [...new Set(rows.flatMap((row) => (row.missing ? [row.missing] : [])))];
  return (
    <>
      {small && headline ? (
        <LensHeadline
          figure={figureProps(
            `board.auction.${headline.row.id}.${headline.measure}-lost`,
            Math.round(headline.share * 100),
            null,
            figureWindow,
            'percent',
          )}
          label={`${headline.row.name} · lost to ${headline.measure}`}
          testId="auction-headline"
          value={shareText(headline.share)}
        />
      ) : null}
      <ul className="space-y-3" data-testid="auction-rows">
        {rows.map((row, index) => (
          <ShareRow currency={currency} index={index} key={row.id} row={row} small={small} />
        ))}
      </ul>
      {small ? null : <Legend items={sharesLegend(model)} testId="auction-legend" />}
      {!small && model.locked.length > 0 ? (
        <p
          className="flex items-start gap-1.5 text-muted-foreground text-xs"
          data-testid="auction-lock-note"
        >
          <LockIcon aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
          <span>
            Raise locked for {model.locked.join(', ')}: fix the primary conversion first, then the
            budget card proposes the raise against real leads.
          </span>
        </p>
      ) : null}
      {!small && reasons.length > 0 ? (
        <ul className="space-y-0.5 text-muted-foreground text-xs" data-testid="auction-reasons">
          {reasons.map((reason) => (
            <li key={reason}>— {reason}.</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

// ── The days without ads ──────────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function DayCell({
  day,
  maxSpend,
  currency,
  compact,
}: {
  day: CalendarDay;
  maxSpend: number;
  currency: string | null;
  compact: boolean;
}) {
  const cell = compact ? 'h-2.5 rounded-[3px]' : 'h-7 rounded-md';
  const number = Number(day.day.slice(8));
  if (!day.inRange) return <span aria-hidden="true" className={cell} />;
  if (day.state === 'unknown') {
    return (
      <span
        className={cn(cell, 'grid place-items-center text-muted-foreground text-xs tabular-nums')}
        data-testid="auction-day-unknown"
        style={{ background: `color-mix(in srgb, ${UNREAD_FILL} 60%, transparent)` }}
      >
        {compact ? null : number}
      </span>
    );
  }
  const dark = day.state === 'dark';
  const shade =
    day.spend != null && maxSpend > 0 ? Math.round(8 + 30 * (day.spend / maxSpend)) : 14;
  return (
    <TipMark
      className={cn(cell, 'grid place-items-center', dark && 'border border-dashed')}
      grow="none"
      label={enDay(day.day)}
      style={dark ? { borderColor: BOARD_COLOR.above } : { background: SERVED_INK(shade) }}
      testId={dark ? 'auction-day-dark' : 'auction-day-served'}
      value={
        dark
          ? 'No ad shown'
          : day.spend != null
            ? `${formatCurrency(day.spend, currency)} spent`
            : 'Ads shown'
      }
    >
      {compact ? null : <span className="text-foreground text-xs tabular-nums">{number}</span>}
    </TipMark>
  );
}

function darkLegend(dark: AuctionDark): LegendItem[] {
  const days = dark.weeks?.flat().filter((day) => day.inRange) ?? [];
  const items: LegendItem[] = [];
  if (days.some((day) => day.state === 'served')) {
    items.push({ label: 'Ads shown · shade is the spend', color: SERVED_INK(28) });
  }
  items.push({ label: 'No ad shown', color: BOARD_COLOR.above, mark: 'outline' });
  if (days.some((day) => day.state === 'unknown')) {
    items.push({ label: 'Not in the delivery card', color: UNREAD_FILL });
  }
  return items;
}

function DarkView({
  dark,
  currency,
  small,
}: {
  dark: AuctionDark;
  currency: string | null;
  small: boolean;
}) {
  const daysWord = dark.darkDays === 1 ? 'day' : 'days';
  const weeks = dark.weeks ? (small ? dark.weeks.slice(-2) : dark.weeks) : null;
  return (
    <>
      {small ? (
        <LensHeadline
          figure={figureProps('board.auction.dark-days', dark.darkDays, null, 'none', 'count')}
          label={`${daysWord} without ads${dark.suspended ? ' · Google suspended the account' : ''}`}
          testId="auction-headline"
          value={String(dark.darkDays)}
        />
      ) : (
        <Badge className="self-start" data-testid="auction-dark-days" variant="destructive">
          <AlertTriangleIcon aria-hidden="true" />
          {`${dark.darkDays} ${daysWord} without ads`}
        </Badge>
      )}
      {weeks ? (
        <figure
          aria-label={`${dark.darkDays} ${daysWord} without ads`}
          className="min-w-0 space-y-1"
          data-testid="auction-calendar"
        >
          {small ? null : (
            <div className="grid grid-cols-7 gap-1 text-center text-muted-foreground text-xs">
              {WEEKDAYS.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-7 gap-1">
            {weeks.flat().map((day) => (
              <DayCell
                compact={small}
                currency={currency}
                day={day}
                key={day.day}
                maxSpend={dark.maxSpend}
              />
            ))}
          </div>
        </figure>
      ) : null}
      {small ? null : <Legend items={darkLegend(dark)} testId="auction-legend" />}
      {!small && dark.status ? (
        <div
          className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 sm:flex-row sm:items-start"
          data-testid="auction-delivery-status"
          data-tone={dark.status.tone}
        >
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="font-medium text-foreground text-sm">{dark.status.title}</p>
            <p className="text-muted-foreground text-xs">{dark.status.detail}</p>
          </div>
          <a
            className={cn(
              buttonVariants({ variant: 'secondary', size: 'sm' }),
              'shrink-0 self-start',
            )}
            href={dark.status.href}
            rel="noreferrer"
            target="_blank"
          >
            Open in Google Ads
          </a>
        </div>
      ) : null}
    </>
  );
}
