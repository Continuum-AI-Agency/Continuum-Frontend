'use client';

// G06 Auction: what each Search campaign wins of its auctions and why it loses the rest. One
// stacked bar per campaign — shown, lost to budget, lost to rank, Google's own shares — with the
// V3 case marked (half or more lost to budget) and its raise shown locked when the V3 finding says
// the primary conversion must be fixed first. When the account does not deliver (G12's account
// card, E1's dark days) the lens becomes the calendar of the days it showed no ad, because no
// impression share means anything while nothing serves.

import type { BoardModuleSize, GoogleTopCampaigns } from '@continuum/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Lock, TriangleAlert } from '@/components/icons';
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

type ScaleCopy = ReturnType<typeof useTranslations<'scale'>>;

function channelName(channel: AuctionChannel, uiText: ScaleCopy): string {
  return channel === 'search' ? uiText('search_49c266b') : 'Performance Max';
}

const CHANNEL_COLOR: Record<AuctionChannel, string> = {
  search: BOARD_COLOR.search,
  pmax: BOARD_COLOR.pmax,
};

/** The three parts of a campaign's eligible impressions. What it won is context and stays
 *  neutral; the two losses take the warm and the cool pole, because they call for opposite
 *  fixes: budget buys back the first, only ads, pages and bids the second. */
const PARTS = [
  {
    key: 'shown',
    label: 'shown_6ba2a0e',
    color: NEUTRAL_MARK,
    of: (row: AuctionRow) => row.shown,
  },
  {
    key: 'budget',
    label: 'lost_to_budget_d856931',
    color: BOARD_COLOR.above,
    of: (row: AuctionRow) => row.budgetLost,
  },
  {
    key: 'rank',
    label: 'lost_to_rank_3029ccc',
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
  const uiText = useTranslations('scale');
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
      title={uiText('impression_share_7df40c2')}
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
  const uiText = useTranslations('scale');
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
          label={`${row.name} · ${uiText(part.label)}`}
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
  const uiText = useTranslations('scale');
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
            {channelName(row.channel, uiText)}
          </span>
          {row.budgetPerDay != null ? (
            <span className="ml-auto text-muted-foreground tabular-nums">
              {uiText('sentence_72ced7255fc0', { v0: formatCurrency(row.budgetPerDay, currency) })}
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
          <span>{uiText('shown_share_fbcac83', { share: shareOrDash(row.shown) })}</span>
          <span>
            {uiText('lost_to_budget_share_7c2b111', { share: shareOrDash(row.budgetLost) })}
          </span>
          <span>{uiText('lost_to_rank_share_bea787b', { share: shareOrDash(row.rankLost) })}</span>
        </div>
      )}
      {!small && (row.v3 || row.locked) ? (
        <div className="flex flex-wrap gap-1.5">
          {row.v3 ? (
            <Badge data-testid="auction-v3" variant="destructive">
              <TriangleAlert aria-hidden="true" />
              {uiText('share_or_more_lost_to_budget_2fb4276', { share: shareText(V3_BUDGET_LOST) })}
            </Badge>
          ) : null}
          {row.locked ? (
            <Badge data-testid="auction-locked" variant="secondary">
              <Lock aria-hidden="true" />
              {uiText('raise_locked_b576c4f')}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function sharesLegend(model: AuctionShares, uiText: ScaleCopy): LegendItem[] {
  const items: LegendItem[] = [
    { label: uiText('shown_6ba2a0e'), color: NEUTRAL_MARK },
    {
      label: uiText('lost_to_budget_more_budget_buys_it_back_ec115c8'),
      color: BOARD_COLOR.above,
    },
    { label: uiText('lost_to_rank_ads_pages_and_bids_win_it_b7d9661'), color: BOARD_COLOR.below },
  ];
  const unread = model.rows.some((row) => PARTS.some((part) => part.of(row) == null));
  return unread
    ? [...items, { label: uiText('not_in_this_read_e94d097'), color: UNREAD_FILL }]
    : items;
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
  const uiText = useTranslations('scale');
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
          label={uiText('name_measure_select_budget_lost_to_budget_oth_facc403', {
            name: headline.row.name,
            measure: headline.measure,
          })}
          testId="auction-headline"
          value={shareText(headline.share)}
        />
      ) : null}
      <ul className="space-y-3" data-testid="auction-rows">
        {rows.map((row, index) => (
          <ShareRow currency={currency} index={index} key={row.id} row={row} small={small} />
        ))}
      </ul>
      {small ? null : <Legend items={sharesLegend(model, uiText)} testId="auction-legend" />}
      {!small && model.locked.length > 0 ? (
        <p
          className="flex items-start gap-1.5 text-muted-foreground text-xs"
          data-testid="auction-lock-note"
        >
          <Lock aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
          <span>
            {uiText('raise_locked_for_campaigns_fix_the_primary_co_842c17f', {
              campaigns: model.locked.join(', '),
            })}
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

/** Monday to Sunday, short, in the UI's language (2024-01-01 was a Monday). */
function weekdayNames(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, day) => format.format(Date.UTC(2024, 0, 1 + day)));
}

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
  const uiText = useTranslations('scale');
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
          ? uiText('no_ad_shown_d3de8f6')
          : day.spend != null
            ? uiText('amount_spent_f287dd9', { amount: formatCurrency(day.spend, currency) })
            : uiText('ads_shown_9845e63')
      }
    >
      {compact ? null : <span className="text-foreground text-xs tabular-nums">{number}</span>}
    </TipMark>
  );
}

function darkLegend(dark: AuctionDark, uiText: ScaleCopy): LegendItem[] {
  const days = dark.weeks?.flat().filter((day) => day.inRange) ?? [];
  const items: LegendItem[] = [];
  if (days.some((day) => day.state === 'served')) {
    items.push({ label: uiText('ads_shown_shade_is_the_spend_77b24d4'), color: SERVED_INK(28) });
  }
  items.push({ label: uiText('no_ad_shown_d3de8f6'), color: BOARD_COLOR.above, mark: 'outline' });
  if (days.some((day) => day.state === 'unknown')) {
    items.push({ label: uiText('not_in_the_delivery_card_979765d'), color: UNREAD_FILL });
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
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const darkDaysText = uiText('count_plural_one_day_without_ads_other_days_w_a71b574', {
    count: dark.darkDays,
  });
  const weeks = dark.weeks ? (small ? dark.weeks.slice(-2) : dark.weeks) : null;
  return (
    <>
      {small ? (
        <LensHeadline
          figure={figureProps('board.auction.dark-days', dark.darkDays, null, 'none', 'count')}
          label={uiText('count_plural_one_day_without_ads_other_days_w_7a8c626', {
            count: dark.darkDays,
            suspended: dark.suspended ? 'yes' : 'no',
          })}
          testId="auction-headline"
          value={String(dark.darkDays)}
        />
      ) : (
        <Badge className="self-start" data-testid="auction-dark-days" variant="destructive">
          <TriangleAlert aria-hidden="true" />
          {darkDaysText}
        </Badge>
      )}
      {weeks ? (
        <figure
          aria-label={darkDaysText}
          className="min-w-0 space-y-1"
          data-testid="auction-calendar"
        >
          {small ? null : (
            <div className="grid grid-cols-7 gap-1 text-center text-muted-foreground text-xs">
              {weekdayNames(uiLocale).map((name) => (
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
      {small ? null : <Legend items={darkLegend(dark, uiText)} testId="auction-legend" />}
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
            {uiText('open_in_google_ads_0131249')}
          </a>
        </div>
      ) : null}
    </>
  );
}
