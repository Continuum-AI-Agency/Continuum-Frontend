// The action a platform card hands to a person (frontend.html §7, feature 09): which button it
// shows, what the approval dialog names, and Google's verdict in plain words. The action is the
// engine's OptimizerAction, unchanged — the card words it and never rebuilds it, so what a
// person approves is exactly what the service runs.

import type {
  ActionRevertResponse,
  ActionRevertResult,
  NativeLevel,
  OptimizerAction,
  PlatformCard,
  RevertRestores,
} from '@continuum/contracts';
import type { ApplyActionResult, ApplyActionsResponse } from '../../useOptimizerData';
import { formatMinorExact } from '../crossPlatformMove/queuedMoveModel';
import { PLATFORM_NAMES } from '../platforms/platformTabsModel';
import { bidTargetLabel, countLabel, isReadOnly, negativesLabel } from './platformCardModel';

/** What a card needs to run its action: the portfolio the service scopes it to, the action, and
 *  the recommendation it came from when there is one. */
export type PlatformCardAction = {
  portfolioId: string;
  action: OptimizerAction;
  recommendationId?: string | null;
};

/** A move between platforms has its own approval (crossPlatformMove); a card runs one write. */
export type CardWrite = Exclude<OptimizerAction, { kind: 'budget_move' }>;

/** 'ready': the control opens the approval flow. 'tiktok_not_connected': the control shows,
 *  disabled, and says why. 'none': the card offers no control of its own. */
export type CardActionAvailability = 'ready' | 'tiktok_not_connected' | 'none';

export function cardWriteOf(target: PlatformCardAction | null | undefined): CardWrite | null {
  if (target == null || target.action.kind === 'budget_move') return null;
  return target.action;
}

export function cardActionAvailability(
  card: PlatformCard,
  target: PlatformCardAction | null | undefined,
): CardActionAvailability {
  const write = cardWriteOf(target);
  if (write == null || isReadOnly(card)) return 'none';
  // The service holds a Google applier only: a TikTok write has no connection to run through.
  if (write.ref.platform === 'tiktok_ads') return 'tiktok_not_connected';
  return write.ref.platform === 'google_ads' ? 'ready' : 'none';
}

export const TIKTOK_NOT_CONNECTED_NOTE =
  'TikTok is not connected for changes yet. Make this change in TikTok Ads Manager.';

const LEVEL_NOUN: Record<NativeLevel, string> = {
  campaign: 'campaign',
  adset: 'ad set',
  ad_group: 'ad group',
  asset_group: 'asset group',
  ad: 'ad',
  asset: 'asset',
  keyword: 'keyword',
};

const SCOPE_NOUN = {
  campaign: 'campaign',
  ad_group: 'ad group',
  shared_set: 'shared negative list',
} as const;

function matchWord(matchType: 'EXACT' | 'PHRASE' | 'BROAD'): string {
  return matchType.toLowerCase();
}

function entityName(write: CardWrite): string {
  return `"${write.ref.name ?? write.ref.id}"`;
}

function bidName(field: 'target_cpa_micros' | 'target_roas'): string {
  return field === 'target_cpa_micros' ? 'target CPA' : 'target ROAS';
}

/** The verb on the card's button. */
export function cardActionLabel(write: CardWrite): string {
  switch (write.kind) {
    case 'set_status':
      return `Pause ${LEVEL_NOUN[write.ref.nativeLevel]}`;
    case 'set_budget':
      return 'Apply new budget';
    case 'set_bid_target':
      return `Apply new ${bidName(write.field)}`;
    case 'add_negatives':
      return negativesLabel(write.terms.length);
    case 'add_keyword':
      return `Add as ${matchWord(write.keyword.matchType)} keyword`;
  }
}

/** The dialog's title: the platform and the exact entity — "campaign budget", never "ad set". */
export function cardActionTitle(write: CardWrite): string {
  const on = `on ${PLATFORM_NAMES[write.ref.platform]}`;
  const noun = LEVEL_NOUN[write.ref.nativeLevel];
  switch (write.kind) {
    case 'set_status':
      return `Pause the ${noun} ${entityName(write)} ${on}`;
    case 'set_budget': {
      const owner = LEVEL_NOUN[write.budget.ownerRef.nativeLevel];
      return `Change the ${owner} budget of ${entityName(write)} ${on}`;
    }
    case 'set_bid_target':
      return `Change the ${bidName(write.field)} of ${entityName(write)} ${on}`;
    case 'add_negatives': {
      const count = write.terms.length;
      return `Add ${countLabel(count)} ${count === 1 ? 'negative' : 'negatives'} to the ${SCOPE_NOUN[write.scope]} ${entityName(write)} ${on}`;
    }
    case 'add_keyword':
      return `Add "${write.keyword.text}" as ${write.keyword.matchType === 'EXACT' ? 'an' : 'a'} ${matchWord(write.keyword.matchType)} keyword in the ${noun} ${entityName(write)} ${on}`;
  }
}

const MICROS = 1_000_000;

/** What changes, in the action's own figures. Null when the title already says it all. */
export function cardActionChange(write: CardWrite, currency: string | null): string | null {
  switch (write.kind) {
    case 'set_status':
      return `${write.expected === 'active' ? 'Active' : 'Paused'} → paused. It stops spending until someone turns it back on in ${PLATFORM_NAMES[write.ref.platform]}.`;
    case 'set_budget': {
      const per = write.budget.kind === 'daily' ? '/day' : '';
      const money = (minor: number) => `${formatMinorExact(minor, write.budget.currency)}${per}`;
      return `${money(write.expectedMinor)} → ${money(write.targetMinor)}`;
    }
    case 'set_bid_target': {
      const label = (value: number) =>
        write.field === 'target_cpa_micros'
          ? bidTargetLabel(value / MICROS, 'target_cpa', currency)
          : bidTargetLabel(value, 'target_roas', currency);
      return `${label(write.expected)} → ${label(write.target)}`;
    }
    case 'add_negatives':
      return write.terms.map((term) => `"${term.text}" (${matchWord(term.matchType)})`).join(', ');
    case 'add_keyword':
      return null;
  }
}

/** Narrows a negatives action to the terms a person kept; the rest of it is unchanged. */
export function withTerms(write: CardWrite, kept: readonly string[]): CardWrite {
  if (write.kind !== 'add_negatives') return write;
  const keep = new Set(kept);
  return { ...write, terms: write.terms.filter((term) => keep.has(term.text)) };
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

export type CardActionVerdict = {
  tone: 'ok' | 'refused' | 'failed';
  text: string;
};

const NOTHING_WRITTEN = 'Nothing was written.';

/** Why the service refused, in a person's words (contracts ACTION_REFUSALS plus the executor's
 *  own reasons). A reason it adds later still reads, lower-cased, rather than disappearing. */
const REFUSAL_WORDS: Readonly<Record<string, string>> = {
  drifted: 'the live value changed since this was proposed, so it needs a fresh look',
  validate_only_error: 'Google refused it in its check',
  guardrail: "it goes past one of this portfolio's limits",
  shared_budget: 'other campaigns spend this budget too, so changing it would move them as well',
  platform_readonly: 'the platform does not accept this change through its API',
  budget_below_spend_floor: "TikTok refuses a budget under 105% of today's spend",
  below_platform_minimum: "it is under the platform's minimum budget",
  allowlist_required: 'TikTok needs this account on an allowlist for this change',
  read_failed: 'we could not read the live value to check it',
  human_approval_required: 'a person has to approve it',
  auto_apply_enabled:
    "Google's auto-apply recommendations are on for this account, so we do not write to it",
};

/** Google's error codes a refusal carries ("google:CODE"), in a person's words. */
const GOOGLE_CODE_WORDS: Readonly<Record<string, string>> = {
  BUDGET_BELOW_PER_DAY_MINIMUM: "the budget is under Google's daily minimum",
  KEYWORD_HAS_INVALID_CHARS: 'a keyword has characters Google does not allow',
  KEYWORD_TEXT_TOO_LONG: 'a keyword is longer than Google allows',
  KEYWORD_HAS_TOO_MANY_WORDS: 'a keyword has more words than Google allows',
  DUPLICATE_KEYWORD: 'that keyword is already there',
  DUPLICATE_NEGATIVE_KEYWORD: 'that negative is already there',
  OPERATION_NOT_PERMITTED_FOR_CONTEXT: 'Google does not allow this change on this campaign',
  CANNOT_MODIFY_FOR_CAMPAIGN_TYPE: 'Google does not allow this change on this campaign type',
  USER_PERMISSION_DENIED: 'the connected Google account may not change this account',
  CUSTOMER_NOT_ENABLED: 'the Google Ads account is not active',
};

function codeInWords(code: string): string {
  return code.toLowerCase().replace(/_+/g, ' ').trim();
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The service reason without its leg prefix: "preflight_failed:0:guardrail" → "guardrail". */
function bareReason(reason: string | undefined): string | null {
  if (!reason) return null;
  const parts = reason.split(':');
  return parts[parts.length - 1] || null;
}

/** Google's verdict, decoded from the applier's detail: its codes in words, its own message,
 *  and the minimum it names. The request id stays out; it means nothing to a person. */
function googleDetailInWords(detail: string, currency: string | null): string | null {
  const codes = /google:([A-Z0-9_,]+)/.exec(detail)?.[1]?.split(',').filter(Boolean) ?? [];
  const words = codes
    .filter((code) => !code.startsWith('HTTP_'))
    .map((code) => GOOGLE_CODE_WORDS[code] ?? codeInWords(code));
  const minimum = /minimumBudgetMinor=(\d+)/.exec(detail)?.[1];
  if (minimum && currency)
    words.push(`the lowest it accepts is ${formatMinorExact(Number(minimum), currency)}/day`);
  const message = /"([^"]+)"\s+request-id/.exec(detail)?.[1];
  if (message) words.push(`Google says: "${message}"`);
  return words.length > 0 ? words.join('; ') : null;
}

/** A bid target held by the per-cycle bound: the service's detail names the bound it read
 *  ("over max_change_pct_per_cycle 0.2"), the portfolio's own or the 20% default. */
function boundedMovePct(detail: string | undefined): number | null {
  if (!detail?.startsWith('bid_target_change:')) return null;
  const cap = /max_change_pct_per_cycle (\d+(?:\.\d+)?)/.exec(detail)?.[1];
  return cap ? Math.round(Number(cap) * 100) : null;
}

function boundedMoveInWords(detail: string | undefined): string | null {
  const pct = boundedMovePct(detail);
  return pct == null
    ? null
    : `Moves the Google Ads bid target more than ${pct}% in a day — not applied.`;
}

function refusalInWords(result: ApplyActionResult, currency: string | null): string {
  const reason = bareReason(result.reason);
  const bounded = reason === 'guardrail' ? boundedMoveInWords(result.detail) : null;
  if (bounded) return bounded;
  const why = reason ? (REFUSAL_WORDS[reason] ?? codeInWords(reason)) : 'it was not accepted';
  const google =
    reason === 'validate_only_error' && result.detail
      ? googleDetailInWords(result.detail, currency)
      : null;
  return google ? `${capitalized(why)}: ${google}.` : `${capitalized(why)}.`;
}

/** What the dry run found, before anyone confirms. */
export function previewVerdict(
  response: ApplyActionsResponse | null,
  currency: string | null,
): CardActionVerdict {
  const result = response?.results[0];
  if (!result) {
    return { tone: 'failed', text: `We could not read the platform's answer. ${NOTHING_WRITTEN}` };
  }
  if (result.status === 'would_apply') {
    return {
      tone: 'ok',
      text: 'Google checked it (validate_only ok) and would accept it. Nothing changes until you confirm.',
    };
  }
  if (result.status === 'deduped') {
    return { tone: 'ok', text: 'This change is already done. There is nothing to apply.' };
  }
  const tone = result.status === 'refused' ? 'refused' : 'failed';
  return { tone, text: `${refusalInWords(result, currency)} ${NOTHING_WRITTEN}` };
}

/** What the real write did. */
export function resultVerdict(
  response: ApplyActionsResponse | null,
  currency: string | null,
): CardActionVerdict {
  const result = response?.results[0];
  if (!result) {
    return {
      tone: 'failed',
      text: "We could not read the platform's answer. Check the Activity feed before trying again.",
    };
  }
  switch (result.status) {
    case 'applied':
      return { tone: 'ok', text: 'Done. The change is live and recorded in Activity.' };
    case 'scheduled':
      return {
        tone: 'ok',
        text: 'Scheduled. The platform applies it at its next midnight; Activity shows when it lands.',
      };
    case 'deduped':
      return { tone: 'ok', text: 'This change was already done. Nothing new was written.' };
    case 'would_apply':
      return {
        tone: 'refused',
        text: `The service only checked it and wrote nothing. ${NOTHING_WRITTEN}`,
      };
    case 'refused':
      return { tone: 'refused', text: `${refusalInWords(result, currency)} ${NOTHING_WRITTEN}` };
    case 'compensated':
      return {
        tone: 'failed',
        text: 'It failed partway and was put back as it was. Nothing is left changed.',
      };
    case 'stranded':
      return {
        tone: 'failed',
        text: 'It failed partway and could not be put back. Autopilot is paused for this portfolio; check Activity.',
      };
    default:
      return {
        tone: 'failed',
        text: `${result.detail ? `It failed: ${result.detail}.` : 'It failed.'} Check Activity before trying again.`,
      };
  }
}

// ---------------------------------------------------------------------------
// The undo (same-day undo of an applied Google write, optimizer-apply-action-revert)
// ---------------------------------------------------------------------------

/** The apply_audits row an undo names: the first leg of a write that landed. */
export function undoAuditIdOf(response: ApplyActionsResponse | null): string | null {
  const result = response?.results[0];
  if (result?.status !== 'applied') return null;
  return result.legs?.[0]?.auditId ?? null;
}

/** The value the undo puts back: "Back to …", or for a bid target "Google Ads bid target back to …". */
export function undoRestoresText(
  restores: RevertRestores | null,
  kind: ActionRevertResult['kind'],
  currency: string | null,
): string | null {
  if (restores == null) return null;
  if ('minor' in restores) return `Back to ${formatMinorExact(restores.minor, restores.currency)}`;
  if ('status' in restores) return `Back to ${restores.status}`;
  // Google's bid setting, never the portfolio's CPA goal: the copy names it as Google's.
  if ('field' in restores) {
    return restores.field === 'target_cpa_micros'
      ? `Google Ads bid target back to ${bidTargetLabel(restores.value / MICROS, 'target_cpa', currency)}`
      : `Google Ads target ROAS (bid setting) back to ${bidTargetLabel(restores.value, 'target_roas', currency)}`;
  }
  const count = restores.removes.length;
  const noun = kind === 'add_negatives' ? 'negative keyword' : 'keyword';
  return `Removes ${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Why the service would not undo it, in a person's words (contracts ACTION_REVERT_REFUSALS
 *  plus the platform's own refusals). */
const UNDO_REFUSAL_WORDS: Readonly<Record<string, string>> = {
  already_reverted: 'This change was already undone.',
  not_applied: 'This change never landed, so there is nothing to undo.',
  move_leg:
    'This change is one side of a budget move between platforms, which is undone as a whole, never alone.',
  auto_apply_enabled: `${REFUSAL_WORDS.auto_apply_enabled}.`,
  guardrail: "Undoing it goes past one of this portfolio's limits — not undone.",
  audit_not_found: 'We could not find this change on this portfolio.',
  unsupported_platform: 'This change is undone from its own platform, not here.',
  is_a_revert: 'This change is itself an undo.',
  no_receipt: 'The platform kept no receipt for this change, so it cannot be undone here.',
  unreadable_action: 'We could not read what this change did, so it cannot be undone here.',
};

function undoRefusalInWords(reason: string | undefined, detail: string | undefined): string {
  const bare = bareReason(reason);
  if (bare == null) return 'It was not accepted.';
  const pct = bare === 'guardrail' ? boundedMovePct(detail) : null;
  if (pct != null) {
    return `Undoing it moves the Google Ads bid target more than ${pct}% in a day — not undone.`;
  }
  return UNDO_REFUSAL_WORDS[bare] ?? `${capitalized(codeInWords(bare))}.`;
}

function withPeriod(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function undoConflictInWords(detail: string | undefined): string {
  const lead = 'Changed in Google Ads since — not undone.';
  return detail ? `${lead} ${withPeriod(detail)}` : lead;
}

const UNREADABLE_UNDO = "We could not read the platform's answer.";

/** What the undo's dry run found, before anyone confirms. */
export function undoPreviewVerdict(response: ActionRevertResponse | null): CardActionVerdict {
  const result = response?.result;
  if (!result) return { tone: 'failed', text: `${UNREADABLE_UNDO} ${NOTHING_WRITTEN}` };
  switch (result.status) {
    case 'would_revert':
      return {
        tone: 'ok',
        text: 'Google checked the undo (validate_only ok). Nothing changes until you confirm.',
      };
    case 'reverted':
      return { tone: 'ok', text: 'This change was already undone.' };
    case 'conflict':
      return { tone: 'refused', text: undoConflictInWords(result.detail) };
    case 'refused':
      return {
        tone: 'refused',
        text: `${undoRefusalInWords(result.reason, result.detail)} ${NOTHING_WRITTEN}`,
      };
    case 'failed':
      return {
        tone: 'failed',
        text: `${result.detail ? `The check failed: ${result.detail}.` : 'The check failed.'} ${NOTHING_WRITTEN}`,
      };
  }
}

/** What the real undo did. */
export function undoResultVerdict(response: ActionRevertResponse | null): CardActionVerdict {
  const result = response?.result;
  if (!result) {
    return { tone: 'failed', text: `${UNREADABLE_UNDO} Check Activity before trying again.` };
  }
  switch (result.status) {
    case 'reverted':
      return { tone: 'ok', text: 'Undone. The previous value is back and recorded in Activity.' };
    case 'would_revert':
      return {
        tone: 'refused',
        text: `The service only checked the undo and wrote nothing. ${NOTHING_WRITTEN}`,
      };
    case 'conflict':
      return { tone: 'refused', text: undoConflictInWords(result.detail) };
    case 'refused':
      return {
        tone: 'refused',
        text: `${undoRefusalInWords(result.reason, result.detail)} ${NOTHING_WRITTEN}`,
      };
    case 'failed':
      return {
        tone: 'failed',
        text: `${result.detail ? `The undo did not land: ${result.detail}.` : 'The undo did not land.'} Check Activity before trying again.`,
      };
  }
}
