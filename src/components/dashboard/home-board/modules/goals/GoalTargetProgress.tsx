'use client';

// A goal held against its target: the bar on the tile, the ring in the expanded module (with a
// tick where the complete days say the figure should be), and the lines that say what the two show.
// No projection: where the goal stands, never where it would land.

import { HOME_OBJECTIVE_METRICS } from '@continuum/contracts';
import { formatFigure } from '@/lib/home/format';
import { cn } from '@/lib/utils';
import { goalDayLabel, goalWindowLabel } from './goalModel';
import { type GoalTargetStatus, goalPaceWords } from './goalTargetModel';

type Compared = Extract<GoalTargetStatus, { kind: 'compared' }>;

type Tone = 'ok' | 'warn' | 'neutral';

const TONE_FILL: Record<Tone, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  neutral: 'bg-primary',
};
const TONE_STROKE: Record<Tone, string> = {
  ok: 'var(--success)',
  warn: 'var(--warning)',
  neutral: 'var(--primary)',
};

const unitOf = ({ target }: { target: Compared['target'] }) =>
  HOME_OBJECTIVE_METRICS[target.metric].unit;

/** Good or bad only where more is better: spending ahead of a spend target is neither. */
function toneOf(status: Compared): Tone {
  if (status.target.metric === 'spend' || status.paceRatio === null) return 'neutral';
  const percent = Math.round((status.paceRatio - 1) * 100);
  if (percent >= 3) return 'ok';
  return percent <= -6 ? 'warn' : 'neutral';
}

const percentOf = (progress: number) => Math.round(progress * 100);

/** The target, in the figure's own format. */
export function goalTargetFigure(target: Compared['target']): string {
  return formatFigure(target.target, unitOf({ target }), target.currency);
}

/** Where the goal stands: its period, the complete days, what they owe and the pace; once the
 *  period is over, how much of the target it reached. */
export function goalPaceLine(status: Compared): string {
  const { period, target } = status;
  const dates = goalWindowLabel({ since: period.since, until: period.until });
  if (period.phase === 'ended')
    return `${dates} · ended · ${percentOf(status.progress)}% of target`;
  const owed = formatFigure(status.expectedToDate, unitOf({ target }), target.currency);
  const pace = status.paceRatio === null ? null : goalPaceWords(status.paceRatio);
  return [`${dates} · day ${period.elapsedDays} of ${period.days}`, `expected ${owed} by now`, pace]
    .filter(Boolean)
    .join(' · ');
}

/** What a target that is not held against the figure says instead; null for the others. */
export function goalTargetNote(status: GoalTargetStatus): string | null {
  switch (status.kind) {
    case 'unreadable':
      return 'Couldn’t read this goal’s target just now. The figure is real.';
    case 'not-running':
      return `Target ${goalTargetFigure(status.target)}. ${
        status.period.phase === 'upcoming'
          ? `Its period starts ${goalDayLabel(status.period.since)}, so there is nothing to compare yet.`
          : 'Its period started today, so no day of it is complete yet.'
      }`;
    case 'mismatch': {
      const figures = status.figureCurrencies.filter(Boolean).join(' and ');
      return `This target is in ${status.target.currency} and these figures are ${
        figures ? `in ${figures}` : 'in an unknown currency'
      }, so they are not compared.`;
    }
    default:
      return null;
  }
}

export function GoalProgressBar({ status, label }: { status: Compared; label: string }) {
  const percent = percentOf(status.progress);
  return (
    <div
      aria-label={`${label} against its target`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.min(100, percent)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
    >
      <div
        className={cn('h-full rounded-full', TONE_FILL[toneOf(status)])}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

const RING_RADIUS = 84;

export function GoalRing({ status }: { status: Compared }) {
  const share = Math.min(1, status.progress);
  const expected = Math.min(1, status.expectedToDate / status.target.target);
  const running = status.period.phase === 'running';
  return (
    <div className="relative mx-auto aspect-square w-full max-w-48" data-testid="home-goals-ring">
      <svg aria-hidden="true" className="size-full" viewBox="0 0 200 200">
        <circle
          cx="100"
          cy="100"
          fill="none"
          r={RING_RADIUS}
          stroke="var(--muted)"
          strokeWidth="14"
        />
        <circle
          cx="100"
          cy="100"
          fill="none"
          pathLength="100"
          r={RING_RADIUS}
          stroke={TONE_STROKE[toneOf(status)]}
          strokeDasharray="100 100"
          strokeDashoffset={(100 - share * 100).toFixed(2)}
          strokeLinecap="round"
          strokeWidth="14"
          transform="rotate(-90 100 100)"
        />
        {running ? (
          <g transform={`rotate(${(expected * 360).toFixed(1)} 100 100)`}>
            <line
              stroke="var(--foreground)"
              strokeLinecap="round"
              strokeWidth="2.5"
              x1="100"
              x2="100"
              y1="5"
              y2="29"
            />
          </g>
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
        <span className="max-w-full truncate font-semibold text-2xl tabular-nums tracking-tight">
          {formatFigure(status.actual, unitOf(status), status.amount.currency)}
        </span>
        <span className="max-w-full truncate text-muted-foreground text-xs">
          of {goalTargetFigure(status.target)}
        </span>
      </div>
    </div>
  );
}
