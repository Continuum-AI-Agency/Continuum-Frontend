'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

// Flight pacing, told as two bars anyone can read: how much of the flight has ELAPSED
// and how much of the budget is SPENT. When the two bars line up the portfolio is on
// plan; the gap between them is the verdict, in the reader's own eyes before the chip
// says it. Below: what today's pace lands on at the end of the flight, and what the
// remaining days would have to average to finish exactly on budget.
//
// Every state the model can be in has words: no flight (with the way to set one), not
// started, waiting for the first paced cycle, ended. Nothing here renders a green gauge
// off a placeholder — see buildFlightPacing for why.

import { CalendarPlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ExplainPopover, ExplainRow } from '../components/ExplainPopover';
import { StatusChip, type StatusTone } from '../components/StatusChip';
import { formatCurrency } from '../format';
import type { FlightPacingModel, FlightPacingStatus } from './flightPacingModel';

const STATUS_TONE: Record<FlightPacingStatus, StatusTone> = {
  on_track: 'success',
  underpacing: 'info',
  overpacing: 'warning',
};

const STATUS_LABEL: Record<FlightPacingStatus, string> = {
  on_track: 'On track',
  underpacing: 'Underpacing',
  overpacing: 'Overpacing',
};

const STATUS_HINT: Record<FlightPacingStatus, string> = {
  on_track: 'Spend is within 5% of where the plan says it should be today.',
  underpacing:
    'Spend is more than 5% behind the plan. The optimizer raises the daily total to catch up.',
  overpacing:
    'Spend is more than 5% ahead of the plan. The optimizer lowers the daily total to stay on budget.',
};

const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
function fmtDate(date: string, locale: UiLocale = 'en'): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function Bar({
  label,
  pct,
  detail,
  tone,
}: {
  label: string;
  pct: number;
  detail: string;
  tone: 'time' | 'spend';
}) {
  const uiLocale = useLocale();
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground tabular-nums">{detail}</span>
      </div>
      <div
        aria-label={`${label}: ${new Intl.NumberFormat(uiLocale, { style: 'percent', maximumFractionDigits: 0 }).format(Math.round(clamped) / 100)}`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(clamped)}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            tone === 'time' ? 'bg-muted-foreground/50' : 'bg-primary',
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

type FlightPacingProps = {
  model: FlightPacingModel;
  currency?: string | null;
  /** Opens Manage so a flight can be set; hides the CTA when absent. */
  onSetFlight?: () => void;
};

export function FlightPacing({ model, currency, onSetFlight }: FlightPacingProps) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  if (model.kind === 'no_flight') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {uiText('no_flight_yet_give_this_portfolio_a_start_dat_6e6466c')}
        </p>
        {onSetFlight ? (
          <Button
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={onSetFlight}
            size="sm"
            type="button"
            variant="secondary"
          >
            <CalendarPlusIcon aria-hidden className="size-3.5" />
            {uiText('set_a_flight_1bc9e41')}
          </Button>
        ) : null}
      </div>
    );
  }

  if (model.kind === 'not_started') {
    return (
      <p className="text-xs text-muted-foreground">
        {uiText.rich('sentence_fffb63dd4b2d', {
          v0: fmtDate(model.start, uiLocale),
          v1: formatCurrency(model.budget, currency, uiLocale),
          v2: fmtDate(model.end, uiLocale),
        })}
      </p>
    );
  }

  if (model.kind === 'awaiting_cycle') {
    return (
      <div className="space-y-2">
        <Bar
          detail={uiText('flightDayProgress', {
            day: model.dayIndex,
            total: model.periodDays,
            hasPercentage: 'no',
            percentage: '',
          })}
          label={uiText('time_elapsed_5550d8a')}
          pct={(model.dayIndex / model.periodDays) * 100}
          tone="time"
        />
        <p className="text-xs text-muted-foreground">
          {uiText.rich('sentence_cc28421f680e', { v0: fmtDate(model.start, uiLocale) })}
        </p>
      </div>
    );
  }

  if (model.kind === 'ended') {
    return (
      <div className="space-y-2">
        <Bar
          detail={uiText('flightEndedLabel')}
          label={uiText('time_elapsed_5550d8a')}
          pct={100}
          tone="time"
        />
        {model.spent != null && model.spentPct != null ? (
          <Bar
            detail={uiText('flightBudgetProgress', {
              spent: formatCurrency(model.spent, currency, uiLocale),
              budget: formatCurrency(model.budget, currency, uiLocale),
              hasPercentage: 'no',
              percentage: '',
            })}
            label={uiText('budget_spent_0538a8b')}
            pct={model.spentPct}
            tone="spend"
          />
        ) : null}
        <p className="text-xs text-muted-foreground">
          {uiText.rich('sentence_85f111260c2b', { v0: fmtDate(model.end, uiLocale) })}
        </p>
      </div>
    );
  }

  const tone = STATUS_TONE[model.status];
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusChip hint={uiText('flightStatusHint', { status: model.status })} tone={tone}>
          {uiText('flightStatusLabel', { status: model.status })}
        </StatusChip>
        <span className="text-xs text-muted-foreground">
          {fmtDate(model.start, uiLocale)} → {fmtDate(model.end, uiLocale)}
          {model.source === 'client' ? uiText('estimated_from_spend_d0b878b') : ''}
        </span>
      </div>
      <Bar
        detail={uiText('flightDayProgress', {
          day: model.dayIndex,
          total: model.periodDays,
          hasPercentage: 'yes',
          percentage: new Intl.NumberFormat(uiLocale, {
            style: 'percent',
            maximumFractionDigits: 0,
          }).format(Math.round(model.timePct) / 100),
        })}
        label={uiText('time_elapsed_5550d8a')}
        pct={model.timePct}
        tone="time"
      />
      <Bar
        detail={uiText('flightBudgetProgress', {
          spent: formatCurrency(model.spent, currency, uiLocale),
          budget: formatCurrency(model.budget, currency, uiLocale),
          hasPercentage: 'yes',
          percentage: new Intl.NumberFormat(uiLocale, {
            style: 'percent',
            maximumFractionDigits: 0,
          }).format(Math.round(model.spentPct) / 100),
        })}
        label={uiText('budget_spent_0538a8b')}
        pct={model.spentPct}
        tone="spend"
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {uiText.rich('sentence_96bfc423db79', {
            v0: () => (
              <b className="text-foreground">
                {formatCurrency(model.projectedEnd, currency, uiLocale)}
              </b>
            ),
            v1: fmtDate(model.end, uiLocale),
          })}
        </span>
        <span>
          {uiText.rich('sentence_f8fe74c17d98', {
            v0: () => (
              <b className="text-foreground">
                {formatCurrency(model.dailyNeeded, currency, uiLocale)}
              </b>
            ),
          })}
        </span>
        <ExplainPopover title={uiText('how_pacing_is_judged_48ce572')}>
          <p>
            {uiText.rich('sentence_13d8e6c2441f', {
              v0: formatCurrency(model.dailyPlanned, currency, uiLocale),
            })}
          </p>
          <ExplainRow
            label={uiText('should_have_spent_by_today_aa66b0c')}
            value={formatCurrency(
              model.dailyPlanned * Math.max(0, model.dayIndex - 1),
              currency,
              uiLocale,
            )}
          />
          <ExplainRow
            label={uiText('actually_spent_64fd3b5')}
            value={formatCurrency(model.spent, currency, uiLocale)}
          />
          <ExplainRow
            label={uiText('actual_plan_6b5832e')}
            value={`${Math.round(model.ratio * 100)}%`}
          />
          <ExplainRow
            label={uiText('remaining_f3e4352')}
            value={formatCurrency(model.remaining, currency, uiLocale)}
          />
          {model.note ? (
            <p className="pt-1 italic">
              {uiText.rich('sentence_730867679513', { v0: model.note })}
            </p>
          ) : null}
        </ExplainPopover>
      </div>
    </div>
  );
}
