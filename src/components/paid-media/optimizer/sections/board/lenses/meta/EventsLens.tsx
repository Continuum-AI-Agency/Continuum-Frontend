'use client';

// Optimization events (Meta twin of G10): the event each portfolio asks Meta to find, what one
// is worth and the goal it is held to; then, for the event that carries a value (a purchase),
// what one costs against what it is worth over the last 30 days, with the ROAS. A portfolio
// whose ad sets left Meta, or whose event stopped firing, is flagged by name and date. The
// events read from the portfolios alone, so they still show while the campaign read is out;
// only the value waits for it.

import type { BoardModuleSize } from '@continuum/contracts';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { TriangleAlert } from '@/components/icons';
import { figureProps, formatCurrency } from '@/components/paid-media/optimizer/format';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { BOARD_COLOR } from '../../palette';
import type { BoardModuleProps } from '../../types';
import {
  buildEvents,
  type EventsModel,
  flagText,
  type PortfolioEvent,
  type ValuedEvent,
} from './eventsModel';
import {
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
  WindowLine,
} from './MetaLensParts';
import type { MetaRankRow } from './metaLensModel';
import { formatRoas, RESULT_WORDS_EN } from './metaLensModel';
import { type MetaReadState, useMetaRanking } from './metaReads';

const TEST_ID = 'board-module-events';

type ScaleCopy = ReturnType<typeof useTranslations<'scale'>>;

export default function EventsLens({ ctx, slot }: BoardModuleProps) {
  const uiText = useTranslations('scale');
  const campaigns = useMetaRanking(ctx.brandId, ctx.adAccountId, 'top_campaigns');
  const model = useMemo(
    () =>
      buildEvents(
        ctx.portfolios,
        campaigns.status === 'ready' ? campaigns.data : null,
        ctx.currency,
      ),
    [campaigns, ctx.portfolios, ctx.currency],
  );
  // The events read from the portfolios; only their worth waits for the campaign read, so the
  // frame reads as loading (or failed) with it, and as missing only when no portfolio exists.
  const state = frameStateOf(
    campaigns.status === 'no-account' ? 'ready' : campaigns.status,
    model.events.length > 0,
  );
  return (
    <MetaFrame
      slot={slot}
      state={state}
      testId={TEST_ID}
      title={uiText('optimization_events_03a85d8')}
    >
      {model.events.length === 0 ? (
        campaigns.status === 'ready' || campaigns.status === 'no-account' ? (
          <LensNote testId={`${TEST_ID}-empty`}>
            {uiText('no_portfolio_on_this_account_yet_so_no_event__a554fa7')}
          </LensNote>
        ) : (
          <ReadNote size={slot.size} state={campaigns} testId={TEST_ID} />
        )
      ) : (
        <EventsView campaigns={campaigns} currency={ctx.currency} model={model} size={slot.size} />
      )}
    </MetaFrame>
  );
}

export function EventsView({
  model,
  campaigns,
  size,
  currency,
}: {
  model: EventsModel;
  /** The campaign read the value comes from, to say why a value is missing. */
  campaigns: MetaReadState<MetaRankRow[]>;
  size: BoardModuleSize;
  currency: string | null;
}) {
  const uiText = useTranslations('scale');
  const valueNote =
    campaigns.status === 'loading'
      ? uiText('reading_what_each_event_is_worth_c2421d3')
      : campaigns.status === 'error'
        ? uiText('the_campaign_read_failed_so_no_event_has_a_va_59ab263')
        : campaigns.status === 'no-account'
          ? uiText('select_a_meta_ad_account_to_read_what_each_ev_f26c13f')
          : null;
  return size === 's' ? (
    <EventsSmall currency={currency} model={model} valueNote={valueNote} />
  ) : (
    <EventsFull currency={currency} model={model} valueNote={valueNote} />
  );
}

function FlagBadge({ event }: { event: PortfolioEvent }) {
  if (!event.flag) return null;
  const many = event.kind ? RESULT_WORDS_EN[event.kind].many : 'results';
  return (
    <Badge
      className="max-w-full whitespace-normal text-left"
      data-testid={`${TEST_ID}-flag`}
      variant={
        event.flag.kind === 'lost' || event.flag.kind === 'silent' ? 'destructive' : 'warning'
      }
    >
      <TriangleAlert aria-hidden="true" />
      {flagText(event.flag, many)}
    </Badge>
  );
}

function valueLine(event: PortfolioEvent, currency: string | null, uiText: ScaleCopy): string {
  return uiText('worth_select_yes_worth_value_on_average_other_78111a9', {
    worth: event.valuePerResult != null ? 'yes' : 'no',
    value: event.valuePerResult != null ? formatCurrency(event.valuePerResult, currency) : '',
    hasGoal: event.goal != null ? 'yes' : 'no',
    goal: event.goal != null ? formatCurrency(event.goal, currency) : '',
    result: event.kind ?? 'none',
  });
}

function EventsSmall({
  model,
  currency,
  valueNote,
}: {
  model: EventsModel;
  currency: string | null;
  valueNote: string | null;
}) {
  const uiText = useTranslations('scale');
  const valued = model.valued;
  const first = model.events[0];
  const flagged = model.events.find((event) => event.flag);
  return (
    <div className="flex flex-col gap-3">
      {valued ? (
        <Headline
          caption={uiText('average_value_per_result_select_purchases_pur_d322ed8', {
            result: valued.kind,
            roas: formatRoas(valued.roas),
          })}
          figure={formatCurrency(valued.valuePerResult, currency)}
          figureAttrs={figureProps('board.events.value', valued.valuePerResult, currency, 'd30')}
          testId={`${TEST_ID}-headline`}
        />
      ) : first?.goal != null ? (
        <Headline
          caption={uiText('goal_per_result_select_purchases_purchase_lea_01f513f', {
            result: first.kind ?? 'none',
            name: first.name,
          })}
          figure={formatCurrency(first.goal, currency)}
          testId={`${TEST_ID}-headline`}
        />
      ) : null}
      {valued ? <WindowLine testId={TEST_ID} /> : null}
      <ul className="flex flex-col gap-1.5">
        {model.events.slice(0, 3).map((event) => (
          <li
            className="flex min-w-0 items-baseline justify-between gap-2 text-xs"
            key={event.portfolioId}
          >
            <span className="min-w-0 truncate text-muted-foreground" title={event.name}>
              {event.eventLabel}
            </span>
            <span className="shrink-0 font-mono tabular-nums">
              {event.valuePerResult != null
                ? formatCurrency(event.valuePerResult, currency)
                : event.goal != null
                  ? uiText('goal_goal_118e036', { goal: formatCurrency(event.goal, currency) })
                  : '—'}
            </span>
          </li>
        ))}
      </ul>
      {flagged?.flag ? (
        <p className="flex items-start gap-1.5 text-xs" data-testid={`${TEST_ID}-flag`}>
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-3 shrink-0 text-destructive-ink"
          />
          <span>
            <span className="font-medium">{flagged.name}</span> ·{' '}
            {flagText(flagged.flag, flagged.kind ? RESULT_WORDS_EN[flagged.kind].many : 'results')}
          </span>
        </p>
      ) : null}
      {valueNote && !valued ? <LensNote>{valueNote}</LensNote> : null}
    </div>
  );
}

function EventsFull({
  model,
  currency,
  valueNote,
}: {
  model: EventsModel;
  currency: string | null;
  valueNote: string | null;
}) {
  const uiText = useTranslations('scale');
  return (
    <div className="flex flex-col gap-3">
      <ul
        aria-label={uiText('what_each_portfolio_optimizes_for_824902f')}
        className="grid gap-2 sm:grid-cols-2"
      >
        {model.events.map((event) => (
          <li
            className={cn(
              'flex min-w-0 flex-col gap-1 rounded-lg border p-3',
              event.flag?.kind === 'lost' && 'border-dashed',
            )}
            data-testid={`${TEST_ID}-event`}
            key={event.portfolioId}
          >
            <span className="truncate font-medium text-sm" title={event.name}>
              {event.name}
            </span>
            <span className="text-muted-foreground text-xs">
              {uiText.rich('optimizes_for_b_event_b_129af52', {
                event: event.eventLabel,
                b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
              })}
            </span>
            <span className="text-muted-foreground text-xs">
              {valueLine(event, currency, uiText)}
            </span>
            <FlagBadge event={event} />
          </li>
        ))}
      </ul>
      {model.valued ? (
        <ValuedEconomics currency={currency} valued={model.valued} />
      ) : valueNote ? (
        <LensNote>{valueNote}</LensNote>
      ) : (
        <LensNote>{uiText('no_event_on_this_account_reported_a_value_in__c2fb5e7')}</LensNote>
      )}
      <Takeaway testId={`${TEST_ID}-takeaway`} text={model.takeaway} />
    </div>
  );
}

function ValuedEconomics({ valued, currency }: { valued: ValuedEvent; currency: string | null }) {
  const uiText = useTranslations('scale');
  const reduce = useReducedMotion();
  const result = valued.kind;
  const max = Math.max(valued.costPerResult, valued.valuePerResult, valued.goal ?? 0) || 1;
  const bars = [
    {
      key: 'cost',
      label: uiText('cost_per_result_select_purchases_purchase_lea_069c0b4', { result }),
      value: valued.costPerResult,
      color: toneColor(valued.tone),
    },
    ...(valued.goal != null
      ? [{ key: 'goal', label: uiText('goal_cdbf697'), value: valued.goal, color: BOARD_COLOR.mid }]
      : []),
    {
      key: 'value',
      label: uiText('value_of_a_result_select_purchases_purchase_l_c320e74', { result }),
      value: valued.valuePerResult,
      color: BOARD_COLOR.mid,
    },
  ];
  return (
    <section
      aria-label={uiText('one_result_select_purchases_purchase_leads_le_1ad63bb', { result })}
      className="flex flex-col gap-2"
    >
      <WindowLine
        detail={uiText('one_result_select_purchases_purchase_leads_le_8e7e864', { result })}
        testId={TEST_ID}
      />
      <ul className="flex flex-col gap-1.5">
        {bars.map((bar, index) => (
          <li
            className="grid grid-cols-[minmax(5.5rem,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-xs"
            data-testid={`${TEST_ID}-bar-${bar.key}`}
            key={bar.key}
          >
            <span className="truncate text-muted-foreground">{bar.label}</span>
            <span className="h-2 min-w-0">
              <motion.span
                animate={{ scaleX: 1 }}
                className={cn(
                  'block h-full rounded-full',
                  bar.key === 'goal' && 'border border-foreground/40 border-dashed',
                )}
                initial={reduce ? false : { scaleX: 0 }}
                style={{
                  width: `${(bar.value / max) * 100}%`,
                  background: bar.color,
                  originX: 0,
                }}
                transition={{ duration: 0.6, delay: index * 0.08, ease: ENTER_EASE }}
              />
            </span>
            <span
              className="font-medium font-mono tabular-nums"
              {...figureProps(`board.events.${bar.key}`, bar.value, currency, 'd30')}
            >
              {formatCurrency(bar.value, currency)}
            </span>
          </li>
        ))}
      </ul>
      <LegendRow>
        <LegendItem
          color={toneColor(valued.tone)}
          label={
            valued.goal == null
              ? uiText('no_cost_goal_for_this_event_af7b645')
              : valued.tone === 'above'
                ? uiText('cost_over_the_goal_6df6eeb')
                : valued.tone === 'below'
                  ? uiText('cost_under_the_goal_08bdb1a')
                  : uiText('cost_on_the_goal_442f414')
          }
        />
        <span data-testid={`${TEST_ID}-totals`}>
          {uiText('count_plural_one_result_select_purchases_purc_d8b37c8', {
            count: valued.results,
            result,
            value: formatCurrency(valued.value, currency),
            spend: formatCurrency(valued.spend, currency),
            roas: formatRoas(valued.roas),
          })}
        </span>
      </LegendRow>
    </section>
  );
}
