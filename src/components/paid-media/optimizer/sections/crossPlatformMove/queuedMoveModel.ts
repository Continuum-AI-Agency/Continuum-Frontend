// A cross-platform budget move as the Actions queue shows it (decision 17): platform against
// platform, every leg of the platform that gives goes down by the same percentage and every leg
// of the one that receives goes up by the same percentage, decreases first.
//
// The recommendation row carries the move as the contract's BudgetMoveAction under `action`
// (RecommendationRowSchema is loose, so the key survives the parse). It is read through
// BudgetMoveActionSchema, so a move that would create money, mix currencies or raise before it
// lowers never reaches the screen — the contract refuses it here exactly as the executor does.

import {
  type BudgetMoveAction,
  BudgetMoveActionSchema,
  currencyMinorOffset,
  type RecommendationRow,
} from '@continuum/contracts';
import { formatCurrencyExact } from '../../format';
import { minorToMajor } from '../actionRows';
import type { AdPlatform } from '../platforms/platformTabsModel';

export const BUDGET_MOVE_KIND = 'budget_move';

/** Decision 18: autopilot may move budget between platforms, and the interface still says a
 *  person should. One sentence, shared by the queue row and the autopilot scopes field. */
export const MOVE_APPROVAL_RECOMMENDATION =
  'We recommend a person approves moves between platforms.';

export type QueuedMoveLeg = {
  index: number;
  direction: 'decrease' | 'increase';
  platform: AdPlatform;
  entityId: string;
  entityName: string | null;
  beforeMinor: number;
  afterMinor: number;
  /** The SIDE's percentage (the same on every leg of that side), not this leg's own rounding. */
  pct: number;
};

export type QueuedMove = {
  moveId: string;
  currency: string;
  /** What comes off the donors, which is what goes on the receivers, to the minor unit. */
  amountMinor: number;
  /** Platforms that give and platforms that receive, in leg order. */
  from: AdPlatform[];
  to: AdPlatform[];
  decreasePct: number;
  increasePct: number;
  legs: QueuedMoveLeg[];
};

export function isBudgetMoveRecommendation(rec: RecommendationRow): boolean {
  return rec.kind === BUDGET_MOVE_KIND;
}

function sidePct(legs: BudgetMoveAction['legs']): number {
  const before = legs.reduce((sum, leg) => sum + leg.expectedMinor, 0);
  const after = legs.reduce((sum, leg) => sum + leg.targetMinor, 0);
  return before === 0 ? 0 : ((after - before) / before) * 100;
}

function distinct<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function readQueuedMove(rec: RecommendationRow): QueuedMove | null {
  if (!isBudgetMoveRecommendation(rec)) return null;
  const parsed = BudgetMoveActionSchema.safeParse(rec.action);
  if (!parsed.success) return null;
  const move = parsed.data;
  const decreases = move.legs.filter((leg) => leg.targetMinor < leg.expectedMinor);
  const increases = move.legs.filter((leg) => leg.targetMinor > leg.expectedMinor);
  const decreasePct = sidePct(decreases);
  const increasePct = sidePct(increases);
  return {
    moveId: move.moveId,
    currency: move.currency,
    amountMinor: decreases.reduce((sum, leg) => sum + leg.expectedMinor - leg.targetMinor, 0),
    from: distinct(decreases.map((leg) => leg.ref.platform)),
    to: distinct(increases.map((leg) => leg.ref.platform)),
    decreasePct,
    increasePct,
    legs: move.legs.map((leg, index) => {
      const direction = leg.targetMinor < leg.expectedMinor ? 'decrease' : 'increase';
      return {
        index,
        direction,
        platform: leg.ref.platform,
        entityId: leg.ref.id,
        entityName: leg.ref.name?.trim() || null,
        beforeMinor: leg.expectedMinor,
        afterMinor: leg.targetMinor,
        pct: direction === 'decrease' ? decreasePct : increasePct,
      };
    }),
  };
}

function minorDigits(currency: string | null): number {
  if (!currency) return 2;
  try {
    return Math.round(Math.log10(currencyMinorOffset(currency)));
  } catch {
    return 2;
  }
}

/** Every minor digit the currency has: a move is exact to the minor unit (decision 17), so
 *  957.68 never prints as 958. A null currency prints the bare figure, never "$". */
export function formatMinorExact(minor: number, currency: string | null): string {
  return formatCurrencyExact(minorToMajor(minor, currency), currency, minorDigits(currency));
}

/** "−4.23%" / "+25.00%": two decimals, because the side's percentage is the whole promise. */
export function formatSidePct(pct: number): string {
  const rounded = Math.round(pct * 100) / 100;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return `${sign}${Math.abs(rounded).toFixed(2)}%`;
}
