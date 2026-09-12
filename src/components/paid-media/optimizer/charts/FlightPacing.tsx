'use client';

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
function fmtDate(date: string): string {
  return DATE_FMT.format(new Date(`${date}T00:00:00Z`));
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
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-2xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground tabular-nums">{detail}</span>
      </div>
      <div
        aria-label={`${label}: ${Math.round(clamped)}%`}
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
  if (model.kind === 'no_flight') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          No flight yet. Give this portfolio a start date, an end date and a total budget and the
          optimizer will pace spend to land on it.
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
            Set a flight
          </Button>
        ) : null}
      </div>
    );
  }

  if (model.kind === 'not_started') {
    return (
      <p className="text-xs text-muted-foreground">
        Flight starts {fmtDate(model.start)} · {formatCurrency(model.budget, currency)} through{' '}
        {fmtDate(model.end)}. Pacing begins on day one.
      </p>
    );
  }

  if (model.kind === 'awaiting_cycle') {
    return (
      <div className="space-y-2">
        <Bar
          detail={`Day ${model.dayIndex} of ${model.periodDays}`}
          label="Time elapsed"
          pct={(model.dayIndex / model.periodDays) * 100}
          tone="time"
        />
        <p className="text-2xs text-muted-foreground">
          Spend to date is not known yet — it arrives with the next scored cycle (the daily series
          does not reach back to {fmtDate(model.start)}).
        </p>
      </div>
    );
  }

  if (model.kind === 'ended') {
    return (
      <div className="space-y-2">
        <Bar detail="Flight ended" label="Time elapsed" pct={100} tone="time" />
        {model.spent != null && model.spentPct != null ? (
          <Bar
            detail={`${formatCurrency(model.spent, currency)} of ${formatCurrency(model.budget, currency)}`}
            label="Budget spent"
            pct={model.spentPct}
            tone="spend"
          />
        ) : null}
        <p className="text-2xs text-muted-foreground">
          Ended {fmtDate(model.end)}. Set a new flight to keep pacing.
        </p>
      </div>
    );
  }

  const tone = STATUS_TONE[model.status];
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusChip hint={STATUS_HINT[model.status]} tone={tone}>
          {STATUS_LABEL[model.status]}
        </StatusChip>
        <span className="text-2xs text-muted-foreground">
          {fmtDate(model.start)} → {fmtDate(model.end)}
          {model.source === 'client' ? ' · estimated from spend' : ''}
        </span>
      </div>
      <Bar
        detail={`Day ${model.dayIndex} of ${model.periodDays} · ${Math.round(model.timePct)}%`}
        label="Time elapsed"
        pct={model.timePct}
        tone="time"
      />
      <Bar
        detail={`${formatCurrency(model.spent, currency)} of ${formatCurrency(model.budget, currency)} · ${Math.round(model.spentPct)}%`}
        label="Budget spent"
        pct={model.spentPct}
        tone="spend"
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-2xs text-muted-foreground">
        <span>
          At this pace:{' '}
          <b className="text-foreground">{formatCurrency(model.projectedEnd, currency)}</b> by{' '}
          {fmtDate(model.end)}
        </span>
        <span>
          To land on budget:{' '}
          <b className="text-foreground">{formatCurrency(model.dailyNeeded, currency)}</b>
          /day
        </span>
        <ExplainPopover title="How pacing is judged">
          <p>
            The plan spends the budget evenly: {formatCurrency(model.dailyPlanned, currency)} a day.
            Actual spend is compared with what the plan says should have been spent by today; more
            than 5% off in either direction changes the verdict.
          </p>
          <ExplainRow
            label="Should have spent by today"
            value={formatCurrency(model.dailyPlanned * Math.max(0, model.dayIndex - 1), currency)}
          />
          <ExplainRow label="Actually spent" value={formatCurrency(model.spent, currency)} />
          <ExplainRow label="Actual ÷ plan" value={`${Math.round(model.ratio * 100)}%`} />
          <ExplainRow label="Remaining" value={formatCurrency(model.remaining, currency)} />
          {model.note ? <p className="pt-1 italic">Engine: {model.note}</p> : null}
        </ExplainPopover>
      </div>
    </div>
  );
}
