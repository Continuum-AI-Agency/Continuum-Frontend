'use client';

// When the account read was taken, and how to ask for another.
//
// The read is composed once a day by a worker and then served frozen. On 2026-09-21 the row
// every user was looking at was written at 00:03 UTC by the build that preceded the ~06:00
// deploy, and the screen said nothing about when — so a stale answer and a current one were
// indistinguishable, and nobody could ask for a fresh one.
//
// A figure without a date cannot be checked. This line is the date, and the button beside it
// is the way to ask again. The server owns the floor (a 30-minute cooldown, three re-reads per
// account per UTC day); this only ever reports what the server already decided, so the control
// never offers a re-read that will be refused.

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AccountReadRefresh } from '../../useOptimizerData';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago, in the coarsest unit that is still true.
 *
 * Deliberately not "a few seconds ago": this read is composed nightly, so minute precision is
 * the finest thing that ever means anything, and pretending otherwise would suggest the figure
 * moves more often than it does.
 */
export function agoLabel(from: string, now: Date): string | null {
  const taken = Date.parse(from);
  if (Number.isNaN(taken)) return null;
  const elapsed = now.getTime() - taken;
  if (elapsed < 0) return 'just now';
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} min ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  const days = Math.floor(elapsed / DAY);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/** The clock time the cooldown lifts, in the reader's own zone. */
export function clockLabel(at: string): string | null {
  const when = Date.parse(at);
  if (Number.isNaN(when)) return null;
  return new Date(when).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * The sentence under the figures: when this read was taken.
 *
 * Null means there is genuinely nothing to date — no composition has ever landed — and the
 * caller renders no line rather than inventing one.
 */
export function takenLine(readyAt: string | null, now: Date): string | null {
  if (!readyAt) return null;
  const ago = agoLabel(readyAt, now);
  return ago ? `Read taken ${ago}` : null;
}

/** What the control should say, given what the server decided. */
export function refreshCopy(refresh: AccountReadRefresh): {
  /** Said beside the button, or instead of it. */
  note: string | null;
  /** Rendered only when a re-read is genuinely on its way. */
  running: boolean;
} {
  if (!refresh) return { note: null, running: false };
  if (refresh.state === 'queued' || refresh.state === 'generating') {
    return {
      note: 'Re-reading this account now — a new read lands in a few minutes.',
      running: true,
    };
  }
  if (refresh.state === 'stalled') {
    return { note: 'The last read stopped part-way through.', running: false };
  }
  if (refresh.reason === 'too_soon') {
    const at = refresh.retry_after ? clockLabel(refresh.retry_after) : null;
    return {
      note: at ? `Can be re-read again at ${at}.` : 'Re-read again shortly.',
      running: false,
    };
  }
  if (refresh.reason === 'daily_limit') {
    return {
      note: 'Re-read three times today — the next one is tomorrow morning.',
      running: false,
    };
  }
  if (refresh.reason === 'no_active_portfolio') {
    return { note: null, running: false };
  }
  return { note: null, running: false };
}

export type AccountReadFreshnessProps = {
  /** When the composition on screen was written. Null when none has ever landed. */
  readyAt: string | null;
  /** The UTC day that composition covers, as the envelope carries it (`YYYY-MM-DD`). */
  utcDay: string | null;
  /**
   * Today's row, and whether it may be asked for again. Null when the RPC predates the
   * migration — the Frontend promotes first — and then no control is offered at all.
   */
  refresh: AccountReadRefresh;
  /** Absent renders the line without a button, which is what a read-only view wants. */
  onRequest?: () => void;
  /** The request is in flight over the wire, as opposed to the read being recomposed. */
  requesting?: boolean;
  /** Named when the ask was refused, so the failure lands where the person tapped. */
  error?: string | null;
  /** Injected by the tests so a relative label is not a moving target. */
  now?: Date;
  className?: string;
};

export function AccountReadFreshness({
  readyAt,
  utcDay,
  refresh,
  onRequest,
  requesting = false,
  error = null,
  now = new Date(),
  className,
}: AccountReadFreshnessProps) {
  const taken = takenLine(readyAt, now);
  const { note, running } = refreshCopy(refresh);
  // No `refresh` means the server has no opinion to report — it is an older RPC — so there is
  // no control at all. A permanently disabled button nobody can explain is worse than none.
  const offersControl = Boolean(onRequest) && refresh !== null;
  const canAsk = offersControl && Boolean(refresh?.can_request) && !requesting;

  // Nothing to date, nothing running, nothing to offer: say nothing. An empty bar under a
  // section is worse than no bar, because it looks like something failed to load.
  if (!taken && !note && !offersControl && !error) return null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-2xs text-muted-foreground',
        className,
      )}
      data-testid="account-read-freshness"
    >
      <p className="flex flex-wrap items-center gap-x-1.5">
        {taken ? (
          <span data-testid="account-read-taken">
            {taken}
            {utcDay ? <span className="text-muted-foreground/70"> · {utcDay} UTC</span> : null}
          </span>
        ) : (
          <span data-testid="account-read-taken">No read taken yet</span>
        )}
        {note ? (
          <span
            className={cn(running && 'text-foreground')}
            data-running={running ? 'true' : undefined}
            data-testid="account-read-refresh-note"
          >
            {note}
          </span>
        ) : null}
      </p>
      <span className="flex items-center gap-2">
        {error ? (
          <span className="text-destructive" data-testid="account-read-refresh-error">
            {error}
          </span>
        ) : null}
        {offersControl ? (
          <Button
            data-testid="account-read-refresh"
            disabled={!canAsk}
            onClick={onRequest}
            size="xs"
            type="button"
            variant="outline"
          >
            {requesting || running ? 'Re-reading…' : 'Re-read'}
          </Button>
        ) : null}
      </span>
    </div>
  );
}
