// Pure readers for the optimizer ACTION feed (public.optimizer_list_actions).
//
// One normalized row shape carries three families and four unit systems, because before/after
// are jsonb: budget {"minor": 5000}, status {"status": "ACTIVE"}, setting {"value": "autopilot"},
// decision {"status": "pending"}. These readers are the single place that knows which key to
// look in for which op — the renderers just print what comes back.
//
// Kept pure (no React) so the mapping is unit-tested directly, and deliberately tolerant:
// this is a DB-derived read model, so an op the contract has not caught up with (today,
// 'convert') must still render as something honest rather than crash the page.

import { currencyMinorOffset } from '@continuum/contracts';
import type { OptimizerActionFeedRow } from '../useOptimizerData';
import {
  type AdPlatform,
  OPTIMIZER_MANAGED_PLATFORM,
  readAdPlatform,
} from './platforms/platformTabsModel';
import { settingLabel, settingMoneyUnit, settingSentence, settingValue } from './settingChange';

/** How one action's before/after should be printed. `unit` decides the formatter: 'money'
 *  values are MINOR units and 'money_major' MAJOR units (a portfolio setting such as its daily
 *  total), both printed in the caller's currency; 'text' is printed verbatim. */
export type ActionChange = {
  label: string;
  unit: 'money' | 'money_major' | 'text';
  before: string | number | null;
  after: string | number | null;
  /** The whole change as one sentence, when it reads better that way than before → after:
   *  a switch flipped ("Creative analysis turned on", "Autopilot resumed"). */
  sentence?: string;
};

/** MINOR → MAJOR by the currency's ISO 4217 exponent: 100 for MXN and USD, 1 for JPY, 1000
 *  for KWD. A hard-coded /100 printed a yen budget a hundred times too small. A currency
 *  nobody recorded (or a malformed code) keeps the two-decimal reading the ledger was written
 *  in for every account this app has served. */
export function minorToMajor(minor: number, currency: string | null): number {
  if (!currency) return minor / 100;
  try {
    return minor / currencyMinorOffset(currency);
  } catch {
    return minor / 100;
  }
}

function readMinor(value: Record<string, unknown> | null | undefined): number | null {
  const minor = value?.minor;
  if (typeof minor === 'number') return Number.isFinite(minor) ? minor : null;
  if (typeof minor === 'string' && minor.trim() !== '') {
    const parsed = Number(minor);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** An audited value as a number; null when the audit stored none or not a number. */
function asAmount(raw: string | null): number | null {
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function readKey(value: Record<string, unknown> | null | undefined, key: string): string | null {
  const raw = value?.[key];
  if (typeof raw === 'string') return raw.trim() === '' ? null : raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (typeof raw === 'boolean') return raw ? 'on' : 'off';
  return null;
}

/** '"gym near me" (exact), "gym" (phrase)' from the executor's [{text, matchType}]. */
function termsText(terms: unknown): string | null {
  if (!Array.isArray(terms)) return null;
  const parts = terms.flatMap((term) => {
    const text = (term as { text?: unknown } | null)?.text;
    const match = (term as { matchType?: unknown } | null)?.matchType;
    if (typeof text !== 'string' || text.trim() === '') return [];
    return [`"${text}"${typeof match === 'string' ? ` (${match.toLowerCase()})` : ''}`];
  });
  return parts.length > 0 ? parts.join(', ') : null;
}

/** What this row changed, before → after. Never null: a row with no readable before/after
 *  still says WHICH field moved, because "something changed and we won't say what" is the
 *  failure mode this whole feed exists to end. */
export function readActionChange(row: OptimizerActionFeedRow): ActionChange {
  switch (row.op) {
    case 'budget':
      return {
        label: 'Daily budget',
        unit: 'money',
        before: readMinor(row.before),
        after: readMinor(row.after),
      };
    case 'status':
      return {
        label: 'Status',
        unit: 'text',
        before: readKey(row.before, 'status'),
        after: readKey(row.after, 'status'),
      };
    case 'setting': {
      // `entity_id` is the audited COLUMN here, and the values are the text the audit stored.
      const after = readKey(row.after, 'value');
      // An ad set moved between portfolios is audited on BOTH (old value the ad set id, new
      // value the receiving portfolio's id). Two ids say nothing to a reader; which side of the
      // move this portfolio is on does.
      if (row.entity_id === 'member_moved') {
        return {
          label: 'Ad set moved',
          unit: 'text',
          before: null,
          after: null,
          sentence:
            after !== null && after === row.portfolio_id
              ? 'Ad set moved into this portfolio'
              : 'Ad set moved to another portfolio',
        };
      }
      const money = settingMoneyUnit(row.entity_id);
      if (money) {
        const amount = (value: Record<string, unknown> | null | undefined) =>
          asAmount(readKey(value, 'value'));
        return {
          label: settingLabel(row.entity_id),
          unit: money === 'minor' ? 'money' : 'money_major',
          before: amount(row.before),
          after: amount(row.after),
        };
      }
      const sentence = settingSentence(row.entity_id, after);
      return {
        label: settingLabel(row.entity_id),
        unit: 'text',
        before: settingValue(readKey(row.before, 'value')),
        after: settingValue(after),
        ...(sentence ? { sentence } : {}),
      };
    }
    case 'decision':
      return {
        label: 'Recommendation',
        unit: 'text',
        before: readKey(row.before, 'status'),
        after: readKey(row.after, 'status'),
      };
    // A platform write's own kinds (G4): the audit's prior/target, as the executor stored them.
    case 'bid': {
      const roas = (readKey(row.after, 'field') ?? readKey(row.before, 'field')) === 'target_roas';
      const value = (side: Record<string, unknown> | null | undefined) => {
        const raw = side?.value;
        if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
        // tCPA travels in micros of the account currency; tROAS is a ratio.
        return roas ? `${Math.round(raw * 100)}%` : (raw / 1_000_000).toFixed(2);
      };
      return {
        label: roas ? 'Bid target (tROAS)' : 'Bid target (tCPA)',
        unit: 'text',
        before: value(row.before),
        after: value(row.after),
      };
    }
    case 'negatives':
      return {
        label: 'Negative keywords',
        unit: 'text',
        before: null,
        after: termsText(row.after?.negatives),
      };
    case 'keyword':
      return {
        label: 'Keyword',
        unit: 'text',
        before: null,
        after: termsText([row.after?.keyword]),
      };
    default:
      // 'convert' today (CBO → ABO), and whatever public.optimizer_list_actions emits next.
      return {
        label: row.op.replace(/_/g, ' '),
        unit: 'text',
        before: readKey(row.before, 'status') ?? readKey(row.before, 'value'),
        after: readKey(row.after, 'status') ?? readKey(row.after, 'value'),
      };
  }
}

/** Who authorized it. `actor_kind` comes straight from the RPC — 'autopilot' when the
 *  scheduler wrote it, 'human' when a person did, 'system' when nothing was recorded. */
export function actorLabel(row: OptimizerActionFeedRow): string {
  switch (row.actor_kind) {
    case 'autopilot':
      return 'Autopilot';
    case 'human':
      return 'Human';
    case 'system':
      return 'System';
    default:
      return 'Unknown';
  }
}

/** Which platform the write landed on. The receipt says it first: every Google and TikTok
 *  applier stamps `receipt.platform`, and optimizer_list_actions sends no platform column, so
 *  the receipt is the one place a non-Meta row is told apart without a migration. A row whose
 *  receipt names no known platform falls back to its own `platform` (read the day the RPC adds
 *  it), and only then to Meta — Meta's fbtrace receipt carries no platform key. */
export function actionPlatform(row: OptimizerActionFeedRow): AdPlatform {
  return (
    readAdPlatform(row.receipt?.['platform']) ??
    readAdPlatform(row.platform) ??
    OPTIMIZER_MANAGED_PLATFORM
  );
}

/** Where each platform's applier puts the id its support desk asks for: Meta's fbtrace, the
 *  Google Ads `request-id` header, TikTok's `request_id`. The Optimizer's appliers store both
 *  of the latter as `requestId` (PlatformReceipt). */
const RECEIPT_KEYS: Record<AdPlatform, readonly string[]> = {
  meta: ['fbtrace_id', 'fbtraceId', 'trace_id', 'id'],
  google_ads: ['requestId', 'request_id'],
  tiktok_ads: ['requestId', 'request_id'],
};

/** The write's receipt id, when it carried one. The receipt jsonb is the raw audit receipt,
 *  so the key is whatever that platform's applier stored. */
export function readReceiptTrace(row: OptimizerActionFeedRow): string | null {
  const receipt = row.receipt;
  if (!receipt) return null;
  for (const key of RECEIPT_KEYS[actionPlatform(row)]) {
    const value = receipt[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}

/** Whether this row's revert dialog scope is a status restore ('adset_status', which reads
 *  as "Unpause") rather than a budget restore. */
export function revertScopeOf(row: OptimizerActionFeedRow): string | null {
  return row.op === 'status' ? 'adset_status' : null;
}

/** Can this row be undone in one click, right now?
 *
 *  `reversible` is the SERVER's answer — TRUE only for an ad-account write that recorded a
 *  real prior value to restore. It is never guessed from the row's shape here: a client-side
 *  guess is how a button starts lying about what it can do. A row already undone
 *  (`reverted_by`) is reported as such instead of offering the button a second time, and a
 *  row with no portfolio has nothing for the revert edge to scope against. */
export function revertState(
  row: OptimizerActionFeedRow,
): { kind: 'available'; auditId: string; portfolioId: string } | { kind: 'reverted' | 'none' } {
  if (row.reverted_by) return { kind: 'reverted' };
  if (row.reversible !== true || !row.portfolio_id) return { kind: 'none' };
  return { kind: 'available', auditId: row.id, portfolioId: row.portfolio_id };
}
