// The Actions page's change preview (G12): every write the Optimizer proposes or applied, as the
// money it moves before → after, the guardrails it passes and the one thing a person does next.
// Pure, so a bar, the figure written beside it and the checklist read the same numbers.
//
// The guardrails are the service's own (Continuum-Optimizer/src/apply.ts): the per-cycle % cap
// holds an AUTOPILOT move above it for a person (a person's approval is not held by it), the
// daily cap refuses every write while the portfolio's daily total is above it, a write never
// creates a live object, and an applied write is undone from Recently applied. A cap that is not
// set is said as not set, never as passed.

import type { CycleItemRow, PortfolioListItem } from '@continuum/contracts';
import { formatCurrency } from '../../../format';
import { minorToMajor } from '../../actionRows';
import { portfolioPlatforms } from '../../platforms/platformTabsModel';
import { isStale } from '../../portfolioStaleness';

export type WriteDirection = 'up' | 'down' | 'flat';

/** One entity's before → after, with both bars on the preview's one scale. */
export type WriteBar = {
  key: string;
  /** The ad set or campaign by name; the raw id only when nothing names it. */
  name: string;
  entityId: string;
  before: number;
  after: number;
  delta: number;
  /** Whole percent of the before; null when the before is zero (a move from nothing has none). */
  deltaPct: number | null;
  direction: WriteDirection;
  /** Bar lengths in percent of the largest figure the preview draws. */
  beforePct: number;
  afterPct: number;
};

export type WriteSide = {
  key: string;
  entityId: string;
  name: string | null;
  before: number | null;
  after: number | null;
};

/** A drawn bar is never shorter than this, so a small budget still shows its rounded end. */
const MIN_BAR_PCT = 2;
/** Under half a unit of the currency a move reads as flat. */
const FLAT_DELTA = 0.005;

function barPct(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(MIN_BAR_PCT, Math.min(100, (value / max) * 100));
}

/** The moves that carry both sides, largest change first, on one scale. */
export function writeBars(sides: readonly WriteSide[]): WriteBar[] {
  const known = sides.filter(
    (side): side is WriteSide & { before: number; after: number } =>
      side.before != null &&
      side.after != null &&
      Number.isFinite(side.before) &&
      Number.isFinite(side.after),
  );
  const max = Math.max(0, ...known.flatMap((side) => [side.before, side.after]));
  return known
    .map((side): WriteBar => {
      const delta = side.after - side.before;
      return {
        key: side.key,
        name: side.name?.trim() || side.entityId,
        entityId: side.entityId,
        before: side.before,
        after: side.after,
        delta,
        deltaPct: side.before > 0 ? Math.round((delta / side.before) * 100) : null,
        direction: Math.abs(delta) < FLAT_DELTA ? 'flat' : delta > 0 ? 'up' : 'down',
        beforePct: barPct(side.before, max),
        afterPct: barPct(side.after, max),
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** What the moves do to the daily total together. */
export function netDelta(bars: readonly Pick<WriteBar, 'delta'>[]): number {
  return bars.reduce((sum, bar) => sum + bar.delta, 0);
}

export type GuardrailState = 'pass' | 'wait' | 'fail' | 'off';

export type GuardrailCheck = {
  id: 'max_change' | 'daily_cap' | 'created_paused' | 'undo';
  state: GuardrailState;
  label: string;
  detail: string;
};

type GuardrailPortfolio = Pick<
  PortfolioListItem,
  'apply_mode' | 'max_change_pct_per_cycle' | 'max_daily_apply_minor' | 'daily_total'
>;

type MoveForChecks = Pick<CycleItemRow, 'change_pct'>;

const AUTOPILOT_NEEDS_IT = 'Autopilot writes nothing until one is set';

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function maxChangeCheck(
  portfolio: GuardrailPortfolio,
  moves: readonly MoveForChecks[],
): GuardrailCheck {
  const cap = portfolio.max_change_pct_per_cycle;
  const autopilot = portfolio.apply_mode === 'autopilot';
  if (cap == null || cap <= 0) {
    return {
      id: 'max_change',
      state: autopilot ? 'fail' : 'off',
      label: 'No cap per cycle',
      detail: autopilot ? AUTOPILOT_NEEDS_IT : 'A person approves every move here',
    };
  }
  const label = `Max ${Math.round(cap * 100)}% per cycle`;
  if (moves.length === 0) {
    return {
      id: 'max_change',
      state: 'pass',
      label,
      detail: autopilot ? 'A bigger move waits for a person' : 'A person approves every move here',
    };
  }
  const above = moves.filter((move) => Math.abs(move.change_pct ?? 0) > cap + 1e-9).length;
  if (above === 0) {
    return {
      id: 'max_change',
      state: 'pass',
      label,
      detail: `${moves.length === 1 ? 'The move is' : 'Every move is'} inside it`,
    };
  }
  return {
    id: 'max_change',
    state: 'wait',
    label,
    detail: autopilot
      ? `${plural(above, 'move is', 'moves are')} above it and ${above === 1 ? 'waits' : 'wait'} for a person`
      : `${plural(above, 'move is', 'moves are')} above it: autopilot would hold ${above === 1 ? 'it' : 'them'} too`,
  };
}

function dailyCapCheck(portfolio: GuardrailPortfolio, currency: string | null): GuardrailCheck {
  const capMinor = portfolio.max_daily_apply_minor;
  const autopilot = portfolio.apply_mode === 'autopilot';
  if (capMinor == null || capMinor <= 0) {
    return {
      id: 'daily_cap',
      state: autopilot ? 'fail' : 'off',
      label: 'No daily cap',
      detail: autopilot ? AUTOPILOT_NEEDS_IT : 'Nothing caps what one day applies',
    };
  }
  const cap = minorToMajor(capMinor, currency);
  const label = `Max ${formatCurrency(cap, currency)}/day applied`;
  const total = portfolio.daily_total;
  if (total == null || !Number.isFinite(total)) {
    return { id: 'daily_cap', state: 'wait', label, detail: 'The daily total is not read yet' };
  }
  return total > cap
    ? {
        id: 'daily_cap',
        state: 'fail',
        label,
        detail: `The daily total, ${formatCurrency(total, currency)}, is above it: nothing is written`,
      }
    : {
        id: 'daily_cap',
        state: 'pass',
        label,
        detail: `The daily total, ${formatCurrency(total, currency)}, is inside it`,
      };
}

/** The four checks every budget write is held to, in the order the design reads them. */
export function guardrailChecks(input: {
  portfolio: GuardrailPortfolio;
  moves: readonly MoveForChecks[];
  currency: string | null;
}): GuardrailCheck[] {
  return [
    maxChangeCheck(input.portfolio, input.moves),
    dailyCapCheck(input.portfolio, input.currency),
    {
      id: 'created_paused',
      state: 'pass',
      label: 'New objects are created PAUSED',
      detail: 'These moves change budgets and create nothing',
    },
    {
      id: 'undo',
      state: 'pass',
      label: 'Undo the same day',
      detail: 'Recently applied puts the prior budget back in one click',
    },
  ];
}

/** A budget move as the queue holds it: approved means it waits for its write. */
export type QueuedBudgetMove = { key: string; approved: boolean };

/**
 * What a person does next with the cycle's budget moves. Approve while any waits on a person;
 * queued once every one is approved and only its write is left (Apply writes it); nothing when
 * the cycle has no budget move left to decide.
 */
export type WriteState =
  | { kind: 'approve'; keys: string[]; approved: number }
  | { kind: 'queued'; count: number }
  | { kind: 'none' };

export function budgetWriteState(moves: readonly QueuedBudgetMove[]): WriteState {
  const waiting = moves.filter((move) => !move.approved).map((move) => move.key);
  const approved = moves.length - waiting.length;
  if (waiting.length > 0) return { kind: 'approve', keys: waiting, approved };
  if (approved > 0) return { kind: 'queued', count: approved };
  return { kind: 'none' };
}

type SchedulePortfolio = Pick<
  PortfolioListItem,
  | 'apply_mode'
  | 'autopilot_paused'
  | 'autopilot_scopes'
  | 'next_realloc_at'
  | 'stale_for_days'
  | 'level'
  | 'platforms'
>;

/** When autopilot writes on its own again, and whether the portfolio holds moves it leaves to a
 *  person anyway (another platform's). */
export type AutopilotRun = { at: string; othersWait: boolean };

/**
 * When autopilot writes the portfolio's budgets again on its own, or null when it will not. It
 * writes only Meta ad-set budgets today (apply.ts: a Google move and a Meta campaign-level
 * portfolio stay proposals until their sandbox benches pass), and nothing at all when it is not
 * on autopilot, its kill switch is on, budgets are out of its scopes (an unset scope reads as
 * off), a guardrail fails (missing, or the daily total is above its cap), the portfolio has
 * missed cycles, or no next cycle is scheduled.
 */
export function autopilotNextRun(
  portfolio: SchedulePortfolio,
  checks: readonly Pick<GuardrailCheck, 'state'>[],
): AutopilotRun | null {
  if (portfolio.apply_mode !== 'autopilot') return null;
  if (portfolio.autopilot_paused) return null;
  if (portfolio.autopilot_scopes?.budget !== true) return null;
  if (isStale(portfolio)) return null;
  if (checks.some((check) => check.state === 'fail')) return null;
  const platforms = portfolioPlatforms(portfolio.platforms);
  if (!platforms.includes('meta') || portfolio.level === 'campaign') return null;
  const at = portfolio.next_realloc_at;
  if (!at || !Number.isFinite(Date.parse(at))) return null;
  return { at, othersWait: platforms.some((platform) => platform !== 'meta') };
}

const HOUR_MS = 3_600_000;

function zonedParts(at: Date, timeZone: string | undefined) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')) };
}

/**
 * "tonight", "today", "tomorrow" or "on Nov 3": when a scheduled instant lands, in the reader's
 * own day. Tonight is a run inside the next 24 hours that falls between 18:00 and 06:00.
 */
export function runWhenWords(iso: string, now: Date, timeZone?: string): string {
  const at = new Date(iso);
  const ahead = at.getTime() - now.getTime();
  if (ahead <= 0) return 'shortly';
  const run = zonedParts(at, timeZone);
  if (ahead < 24 * HOUR_MS && (run.hour >= 18 || run.hour < 6)) return 'tonight';
  const today = zonedParts(now, timeZone).day;
  if (run.day === today) return 'today';
  const tomorrow = zonedParts(new Date(now.getTime() + 24 * HOUR_MS), timeZone).day;
  if (run.day === tomorrow) return 'tomorrow';
  return `on ${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone })}`;
}
