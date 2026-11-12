'use client';
import {
  useLocale as useAuditLocale,
  useTranslations as useBetaTranslations,
  useLocale as useFormatLocale,
  useLocale as useNumberLocale,
} from 'next-intl';
import { resultWordsUi } from './metaLensModel';

// Optimization events (Meta twin of G10): the event each portfolio asks Meta to find, what one
// is worth and the goal it is held to; then, for the event that carries a value (a purchase),
// what one costs against what it is worth over the last 30 days, with the ROAS. A portfolio
// whose ad sets left Meta, or whose event stopped firing, is flagged by name and date. The
// events read from the portfolios alone, so they still show while the campaign read is out;
// only the value waits for it.

import type { BoardModuleSize } from '@continuum/contracts';
import { AlertTriangleIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';
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

export default function EventsLens({ ctx, slot }: BoardModuleProps) {
  const betaUiText = useBetaTranslations('scale');

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
    <MetaFrame slot={slot} state={state} testId={TEST_ID} title={betaUiText('beta_03a85d8775e9')}>
      {model.events.length === 0 ? (
        campaigns.status === 'ready' || campaigns.status === 'no-account' ? (
          <LensNote testId={`${TEST_ID}-empty`}>{betaUiText('beta_a554fa797af8')}</LensNote>
        ) : (
          <ReadNote size={slot.size} state={campaigns} testId={TEST_ID} what="campaigns" />
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
  const betaUiText = useBetaTranslations('scale');

  const valueNote =
    campaigns.status === 'ready'
      ? null
      : betaUiText('metaEventValueState', { state: campaigns.status });
  return size === 's' ? (
    <EventsSmall currency={currency} model={model} valueNote={valueNote} />
  ) : (
    <EventsFull currency={currency} model={model} valueNote={valueNote} />
  );
}

function FlagBadge({ event }: { event: PortfolioEvent }) {
  const betaUiText = useBetaTranslations('scale');
  const auditLocale = useAuditLocale();

  if (!event.flag) return null;
  const many = event.kind ? resultWordsUi(event.kind, betaUiText).many : betaUiText('metaResults');
  return (
    <Badge
      className="max-w-full whitespace-normal text-left"
      data-testid={`${TEST_ID}-flag`}
      variant={
        event.flag.kind === 'lost' || event.flag.kind === 'silent' ? 'destructive' : 'warning'
      }
    >
      <AlertTriangleIcon aria-hidden="true" />
      {flagText(event.flag, many, betaUiText, auditLocale)}
    </Badge>
  );
}

function valueLine(event: PortfolioEvent, currency: string | null): string {
  const worth =
    event.valuePerResult != null
      ? `Worth ${formatCurrency(event.valuePerResult, currency)} on average`
      : 'No value reported';
  const goal =
    event.goal != null
      ? `goal ${formatCurrency(event.goal, currency)} per ${event.unit}`
      : 'no cost goal';
  return `${worth} · ${goal}`;
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
  const auditLocale = useAuditLocale();

  const numberLocale = useNumberLocale();

  const betaUiText = useBetaTranslations('scale');

  const valued = model.valued;
  const first = model.events[0];
  const flagged = model.events.find((event) => event.flag);
  return (
    <div className="flex flex-col gap-3">
      {valued ? (
        <Headline
          caption={betaUiText('beta_a32ac363d2cc', {
            value0: String(resultWordsUi(valued.kind, betaUiText).one),
            value1: String(formatRoas(valued.roas)),
          })}
          figure={formatCurrency(valued.valuePerResult, currency, numberLocale)}
          figureAttrs={figureProps('board.events.value', valued.valuePerResult, currency, 'd30')}
          testId={`${TEST_ID}-headline`}
        />
      ) : first?.goal != null ? (
        <Headline
          caption={betaUiText('beta_03f8bce28e2b', {
            value0: String(first.unit),
            value1: String(first.name),
          })}
          figure={formatCurrency(first.goal, currency, numberLocale)}
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
                ? formatCurrency(event.valuePerResult, currency, numberLocale)
                : event.goal != null
                  ? betaUiText('beta_f4da73c83194', {
                      value0: String(formatCurrency(event.goal, currency, numberLocale)),
                    })
                  : '—'}
            </span>
          </li>
        ))}
      </ul>
      {flagged?.flag ? (
        <p className="flex items-start gap-1.5 text-xs" data-testid={`${TEST_ID}-flag`}>
          <AlertTriangleIcon
            aria-hidden="true"
            className="mt-0.5 size-3 shrink-0 text-destructive-ink"
          />
          <span>
            <span className="font-medium">{flagged.name}</span> ·{' '}
            {flagText(
              flagged.flag,
              flagged.kind
                ? resultWordsUi(flagged.kind, betaUiText).many
                : betaUiText('metaResults'),
              betaUiText,
              auditLocale,
            )}
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
  const betaUiText = useBetaTranslations('scale');

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={betaUiText('beta_824902f17f29')} className="grid gap-2 sm:grid-cols-2">
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
              {betaUiText('beta_b6fad5761994')}{' '}
              <span className="font-medium text-foreground">{event.eventLabel}</span>
            </span>
            <span className="text-muted-foreground text-xs">{valueLine(event, currency)}</span>
            <FlagBadge event={event} />
          </li>
        ))}
      </ul>
      {model.valued ? (
        <ValuedEconomics currency={currency} valued={model.valued} />
      ) : valueNote ? (
        <LensNote>{valueNote}</LensNote>
      ) : (
        <LensNote>{betaUiText('beta_c2fb5e724801')}</LensNote>
      )}
      <Takeaway testId={`${TEST_ID}-takeaway`} text={model.takeaway} />
    </div>
  );
}

function ValuedEconomics({ valued, currency }: { valued: ValuedEvent; currency: string | null }) {
  const formatLocale = useFormatLocale();

  const numberLocale = useNumberLocale();

  const betaUiText = useBetaTranslations('scale');

  const reduce = useReducedMotion();
  const max = Math.max(valued.costPerResult, valued.valuePerResult, valued.goal ?? 0) || 1;
  const bars = [
    {
      key: 'cost',
      label: betaUiText('metaCostPer', {
        result: resultWordsUi(valued.kind, betaUiText).one,
      }),
      value: valued.costPerResult,
      color: toneColor(valued.tone),
    },
    ...(valued.goal != null
      ? [
          {
            key: 'goal',
            label: betaUiText('storyGoal'),
            value: valued.goal,
            color: BOARD_COLOR.mid,
          },
        ]
      : []),
    {
      key: 'value',
      label: betaUiText('metaValuePer', {
        result: resultWordsUi(valued.kind, betaUiText).one,
      }),
      value: valued.valuePerResult,
      color: BOARD_COLOR.mid,
    },
  ];
  return (
    <section
      aria-label={betaUiText('beta_0490c08e293c', {
        value0: String(resultWordsUi(valued.kind, betaUiText).one),
      })}
      className="flex flex-col gap-2"
    >
      <WindowLine
        detail={betaUiText('metaValueComparison', {
          result: resultWordsUi(valued.kind, betaUiText).one,
        })}
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
                transition={{
                  duration: 0.6,
                  delay: index * 0.08,
                  ease: ENTER_EASE,
                }}
              />
            </span>
            <span
              className="font-medium font-mono tabular-nums"
              {...figureProps(`board.events.${bar.key}`, bar.value, currency, 'd30')}
            >
              {formatCurrency(bar.value, currency, numberLocale)}
            </span>
          </li>
        ))}
      </ul>
      <LegendRow>
        <LegendItem
          color={toneColor(valued.tone)}
          label={
            valued.goal == null
              ? betaUiText('beta_af7b645ec76b')
              : valued.tone === 'above'
                ? betaUiText('beta_6df6eeba8f65')
                : valued.tone === 'below'
                  ? betaUiText('beta_08bdb1a351a6')
                  : betaUiText('beta_442f414690ba')
          }
        />
        <span data-testid={`${TEST_ID}-totals`}>
          {valued.results.toLocaleString(formatLocale)}{' '}
          {resultWordsUi(valued.kind, betaUiText).many} {betaUiText('beta_c0a6eb55b12b')}{' '}
          {formatCurrency(valued.value, currency, numberLocale)} {betaUiText('beta_b8d31e852725')}{' '}
          {formatCurrency(valued.spend, currency, numberLocale)} {betaUiText('beta_aae5cad256ab')}{' '}
          {formatRoas(valued.roas)}
        </span>
      </LegendRow>
    </section>
  );
}
