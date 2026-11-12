
import type {UiLocale} from '@/i18n/config';
import type { useTranslations as ScaleTranslationHook } from 'next-intl';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

// The action a platform card hands to a person (frontend.html §7, feature 09): which button it
// shows, what the approval dialog names, and Google's verdict in plain words. The action is the
// engine's OptimizerAction, unchanged — the card words it and never rebuilds it, so what a
// person approves is exactly what the service runs.

import type {
  AccountCandidate,
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
  /** The portfolio's write switch for the card's account (card_action.apply_enabled). False:
   *  the service refuses the write (apply_disabled). Absent from an older server: unknown. */
  applyEnabled?: boolean;
};

/** Candidate id → the action its platform card hands a person, exactly as the read carries it
 *  (`card_action`: the pending recommendation, its portfolio, the engine's action and the
 *  portfolio's write switch). A card without one shows no control of its own. */
export function cardActionsOf(
  candidates: readonly AccountCandidate[],
): ReadonlyMap<string, PlatformCardAction> {
  const actions = new Map<string, PlatformCardAction>();
  for (const candidate of candidates) {
    const target = candidate.card_action;
    if (!target) continue;
    actions.set(candidate.id, {
      portfolioId: target.portfolio_id,
      action: target.action,
      recommendationId: target.recommendation_id,
      applyEnabled: target.apply_enabled,
    });
  }
  return actions;
}

/** The recommendation a platform card stands for. optimizer_get_platform_cards ids each card
 *  'platform_signal:<recommendation id>'; a card with an action also names it outright. */
export function cardRecommendationId(candidate: AccountCandidate): string {
  return candidate.card_action?.recommendation_id ?? candidate.id.replace(/^platform_signal:/, '');
}

/** A move between platforms has its own approval (crossPlatformMove); a card runs one write. */
export type CardWrite = Exclude<OptimizerAction, { kind: 'budget_move' }>;

/** 'ready': the control opens the approval flow. 'tiktok_not_connected' and 'apply_disabled':
 *  the control shows, disabled, and says why. 'none': the card offers no control of its own. */
export type CardActionAvailability = 'ready' | 'tiktok_not_connected' | 'apply_disabled' | 'none';

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
  if (write.ref.platform !== 'google_ads') return 'none';
  // Offering a write the service will refuse is a button that only ever fails.
  return target?.applyEnabled === false ? 'apply_disabled' : 'ready';
}

export const TIKTOK_NOT_CONNECTED_NOTE =
  'TikTok is not connected for changes yet. Make this change in TikTok Ads Manager.';

/** Why a disabled control is disabled, in one line. Null when the control is not disabled. */
export function cardActionUnavailableNote(
  availability: CardActionAvailability,
  write: CardWrite,
  uiTranslate?: ScaleCopy,
): string | null {
  if (availability === 'tiktok_not_connected') return uiTranslate?uiTranslate('platformTikTokChangesUnavailable'):TIKTOK_NOT_CONNECTED_NOTE;
  if (availability === 'apply_disabled') {
    return uiTranslate
      ? uiTranslate('helper_44cea9b7b34f', { v0: PLATFORM_NAMES[write.ref.platform] })
      : `Writes to ${PLATFORM_NAMES[write.ref.platform]} are switched off for this portfolio.`;
  }
  return null;
}

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

function matchWord(matchType: 'EXACT' | 'PHRASE' | 'BROAD',uiTranslate?:ScaleCopy): string {
  return uiTranslate?uiTranslate('platformMatch',{match:matchType}):matchType.toLowerCase();
}

function entityName(write: CardWrite): string {
  return `"${write.ref.name ?? write.ref.id}"`;
}

// The platform's bid setting, named so it is never read as the portfolio's CPA goal.
function bidName(field: 'target_cpa_micros' | 'target_roas',uiTranslate?:ScaleCopy): string {
  if(uiTranslate)return uiTranslate('platformBidName',{name:field==='target_cpa_micros'?'tCPA':'tROAS'});
  return field === 'target_cpa_micros' ? 'bid target (tCPA)' : 'bid target (tROAS)';
}

/** The verb on the card's button. */
export function cardActionLabel(write: CardWrite, uiTranslate?: ScaleCopy): string {
  switch (write.kind) {
    case 'set_status':
      return uiTranslate
        ? uiTranslate('helper_e0d4fe212d85', { v0: (uiTranslate('platformEntityNoun',{level:write.ref.nativeLevel})) })
        : `Pause ${(LEVEL_NOUN[write.ref.nativeLevel])}`;
    case 'set_budget':
      return uiTranslate ? uiTranslate('apply_new_budget_ddf6162') : 'Apply new budget';
    case 'set_bid_target':
      return uiTranslate
        ? uiTranslate('helper_c900174f683d', { v0: bidName(write.field,uiTranslate) })
        : `Apply new ${bidName(write.field,uiTranslate)}`;
    case 'add_negatives':
      return negativesLabel(write.terms.length, uiTranslate);
    case 'add_keyword':
      return uiTranslate
        ? uiTranslate('helper_ee76d8462e1b', { v0: matchWord(write.keyword.matchType,uiTranslate) })
        : `Add as ${matchWord(write.keyword.matchType,uiTranslate)} keyword`;
  }
}

/** The dialog's title: the platform and the exact entity — "campaign budget", never "ad set". */
export function cardActionTitle(write: CardWrite, uiTranslate?: ScaleCopy, uiLocale:UiLocale='en'): string {
  const on = uiTranslate
    ? uiTranslate('helper_961d172ff2f7', { v0: PLATFORM_NAMES[write.ref.platform] })
    : `on ${PLATFORM_NAMES[write.ref.platform]}`;
  const noun = (uiTranslate?uiTranslate('platformEntityNoun',{level:write.ref.nativeLevel}):LEVEL_NOUN[write.ref.nativeLevel]);
  switch (write.kind) {
    case 'set_status':
      return uiTranslate
        ? uiTranslate('helper_33b05e910325', { v0: noun, v1: entityName(write), v2: on })
        : `Pause the ${noun} ${entityName(write)} ${on}`;
    case 'set_budget': {
      const owner = (uiTranslate?uiTranslate('platformEntityNoun',{level:write.budget.ownerRef.nativeLevel}):LEVEL_NOUN[write.budget.ownerRef.nativeLevel]);
      return uiTranslate
        ? uiTranslate('helper_aef3ed7d7ffd', { v0: owner, v1: entityName(write), v2: on })
        : `Change the ${owner} budget of ${entityName(write)} ${on}`;
    }
    case 'set_bid_target':
      return uiTranslate
        ? uiTranslate('helper_19c3c64a4a84', {
            v0: bidName(write.field,uiTranslate),
            v1: entityName(write),
            v2: on,
          })
        : `Change the ${bidName(write.field,uiTranslate)} of ${entityName(write)} ${on}`;
    case 'add_negatives': {
      const count = write.terms.length;
      if(uiTranslate)return uiTranslate('platformNegativeTitle',{count,scope:uiTranslate('platformEntityNoun',{level:write.scope}),name:entityName(write),platform:PLATFORM_NAMES[write.ref.platform]});
      return `Add ${countLabel(count, uiLocale)} ${count === 1 ? 'negative' : 'negatives'} to the ${SCOPE_NOUN[write.scope]} ${entityName(write)} ${on}`;
    }
    case 'add_keyword':
      if(uiTranslate)return uiTranslate('platformKeywordTitle',{text:write.keyword.text,match:matchWord(write.keyword.matchType,uiTranslate),level:noun,name:entityName(write),platform:PLATFORM_NAMES[write.ref.platform]});
      return `Add "${write.keyword.text}" as ${write.keyword.matchType === 'EXACT' ? 'an' : 'a'} ${matchWord(write.keyword.matchType,uiTranslate)} keyword in the ${noun} ${entityName(write)} ${on}`;
  }
}

const MICROS = 1_000_000;

/** What changes, in the action's own figures. Null when the title already says it all. */
export function cardActionChange(
  write: CardWrite,
  currency: string | null,
  uiTranslate?: ScaleCopy, uiLocale:UiLocale='en',
): string | null {
  switch (write.kind) {
    case 'set_status':
      return uiTranslate
        ? uiTranslate('helper_7ed4fc1a3c09', {
            v0: write.expected === 'active' ? 'Active' : 'Paused',
            v1: PLATFORM_NAMES[write.ref.platform],
          })
        : `${write.expected === 'active' ? 'Active' : 'Paused'} → paused. It stops spending until someone turns it back on in ${PLATFORM_NAMES[write.ref.platform]}.`;
    case 'set_budget': {
      const per = write.budget.kind === 'daily' ? (uiTranslate?uiTranslate('platformPerDay'):'/day') : '';
      const money = (minor: number) => `${formatMinorExact(minor, write.budget.currency, uiLocale)}${per}`;
      return `${money(write.expectedMinor)} → ${money(write.targetMinor)}`;
    }
    case 'set_bid_target': {
      const label = (value: number) =>
        write.field === 'target_cpa_micros'
          ? bidTargetLabel(value / MICROS, 'target_cpa', currency, uiLocale)
          : bidTargetLabel(value, 'target_roas', currency, uiLocale);
      return `${label(write.expected)} → ${label(write.target)}`;
    }
    case 'add_negatives':
      return write.terms.map((term) => `"${term.text}" (${matchWord(term.matchType,uiTranslate)})`).join(', ');
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
  apply_disabled: 'writes to this platform are switched off for this portfolio',
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
function googleDetailInWords(
  detail: string,
  currency: string | null,
  uiTranslate?: ScaleCopy, uiLocale:UiLocale='en',
): string | null {
  const codes = /google:([A-Z0-9_,]+)/.exec(detail)?.[1]?.split(',').filter(Boolean) ?? [];
  const words = codes
    .filter((code) => !code.startsWith('HTTP_'))
    .map((code) => GOOGLE_CODE_WORDS[code] ?? codeInWords(code));
  const minimum = /minimumBudgetMinor=(\d+)/.exec(detail)?.[1];
  if (minimum && currency)
    words.push(
      uiTranslate
        ? uiTranslate('helper_46dce481afe7', { v0: formatMinorExact(Number(minimum), currency, uiLocale) })
        : `the lowest it accepts is ${formatMinorExact(Number(minimum), currency, uiLocale)}/day`,
    );
  const message = /"([^"]+)"\s+request-id/.exec(detail)?.[1];
  if (message)
    words.push(
      uiTranslate
        ? uiTranslate('helper_0601f08dba47', { v0: message })
        : `Google says: "${message}"`,
    );
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

function refusalInWords(
  result: ApplyActionResult,
  currency: string | null,
  uiTranslate?: ScaleCopy, uiLocale:UiLocale='en',
): string {
  const reason = bareReason(result.reason);
  const bounded = reason === 'guardrail' ? boundedMoveInWords(result.detail) : null;
  if (bounded) return bounded;
  const why = reason ? (REFUSAL_WORDS[reason] ?? codeInWords(reason)) : 'it was not accepted';
  const google =
    reason === 'validate_only_error' && result.detail
      ? googleDetailInWords(result.detail, currency, uiTranslate, uiLocale)
      : null;
  return google ? `${capitalized(why)}: ${google}.` : `${capitalized(why)}.`;
}

/** What the dry run found, before anyone confirms. */
function previewVerdictEnglish(
  response: ApplyActionsResponse | null,
  currency: string | null,
  uiTranslate?: ScaleCopy, uiLocale:UiLocale='en',
): CardActionVerdict {
  const result = response?.results[0];
  if (!result) {
    return {
      tone: 'failed',
      text: uiTranslate
        ? uiTranslate('helper_a187bf2ac5b0', { v0: NOTHING_WRITTEN })
        : `We could not read the platform's answer. ${NOTHING_WRITTEN}`,
    };
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
  return { tone, text: `${refusalInWords(result, currency, uiTranslate, uiLocale)} ${NOTHING_WRITTEN}` };
}

/** What the real write did. */
function resultVerdictEnglish(
  response: ApplyActionsResponse | null,
  currency: string | null,
  uiTranslate?: ScaleCopy, uiLocale:UiLocale='en',
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
        text: uiTranslate
          ? uiTranslate('helper_9d05cc83446b', { v0: NOTHING_WRITTEN })
          : `The service only checked it and wrote nothing. ${NOTHING_WRITTEN}`,
      };
    case 'refused':
      return {
        tone: 'refused',
        text: `${refusalInWords(result, currency, uiTranslate, uiLocale)} ${NOTHING_WRITTEN}`,
      };
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
        text: uiTranslate
          ? uiTranslate('helper_f042fe99ac1f', {
              v0: result.detail ? `It failed: ${result.detail}.` : 'It failed.',
            })
          : `${result.detail ? `It failed: ${result.detail}.` : 'It failed.'} Check Activity before trying again.`,
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
  uiTranslate?: ScaleCopy, uiLocale:UiLocale='en',
): string | null {
  if (restores == null) return null;
  if ('minor' in restores)
    return uiTranslate
      ? uiTranslate('helper_e10c79fa1bcd', {
          v0: formatMinorExact(restores.minor, restores.currency, uiLocale),
        })
      : `Back to ${formatMinorExact(restores.minor, restores.currency, uiLocale)}`;
  if ('status' in restores)return uiTranslate?uiTranslate('platformUndoStatus',{status:restores.status}):`Back to ${restores.status}`;
  // Google's bid setting, never the portfolio's CPA goal: the copy names it as Google's.
  if ('field' in restores) {
    if(uiTranslate)return uiTranslate('platformUndoBid',{kind:restores.field==='target_cpa_micros'?'cpa':'roas',value:restores.field==='target_cpa_micros'?bidTargetLabel(restores.value/MICROS,'target_cpa',currency,uiLocale):bidTargetLabel(restores.value,'target_roas',currency,uiLocale)});
    return restores.field === 'target_cpa_micros'
      ? `Google Ads bid target back to ${bidTargetLabel(restores.value / MICROS, 'target_cpa', currency, uiLocale)}`
      : `Google Ads target ROAS (bid setting) back to ${bidTargetLabel(restores.value, 'target_roas', currency, uiLocale)}`;
  }
  const count = restores.removes.length;
  const noun = kind === 'add_negatives' ? 'negative keyword' : 'keyword';
  return uiTranslate
    ? uiTranslate('platformUndoRemoves',{count,kind:kind==='add_negatives'?'negative':'keyword'})
    : `Removes ${count} ${noun}${count === 1 ? '' : 's'}`;
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

function undoRefusalInWords(
  reason: string | undefined,
  detail: string | undefined,
  uiTranslate?: ScaleCopy,
): string {
  const bare = bareReason(reason);
  if (bare == null)
    return uiTranslate ? uiTranslate('it_was_not_accepted_39c7697') : 'It was not accepted.';
  const pct = bare === 'guardrail' ? boundedMovePct(detail) : null;
  if (pct != null) {
    return uiTranslate
      ? uiTranslate('helper_846a41c4a565', { v0: pct })
      : `Undoing it moves the Google Ads bid target more than ${pct}% in a day — not undone.`;
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
function undoPreviewVerdictEnglish(
  response: ActionRevertResponse | null,
  uiTranslate?: ScaleCopy,
): CardActionVerdict {
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
        text: `${undoRefusalInWords(result.reason, result.detail, uiTranslate)} ${NOTHING_WRITTEN}`,
      };
    case 'failed':
      return {
        tone: 'failed',
        text: `${result.detail ? `The check failed: ${result.detail}.` : 'The check failed.'} ${NOTHING_WRITTEN}`,
      };
  }
}

/** What the real undo did. */
function undoResultVerdictEnglish(
  response: ActionRevertResponse | null,
  uiTranslate?: ScaleCopy,
): CardActionVerdict {
  const result = response?.result;
  if (!result) {
    return {
      tone: 'failed',
      text: uiTranslate
        ? uiTranslate('helper_f042fe99ac1f', { v0: UNREADABLE_UNDO })
        : `${UNREADABLE_UNDO} Check Activity before trying again.`,
    };
  }
  switch (result.status) {
    case 'reverted':
      return { tone: 'ok', text: 'Undone. The previous value is back and recorded in Activity.' };
    case 'would_revert':
      return {
        tone: 'refused',
        text: uiTranslate
          ? uiTranslate('helper_9a64c8975dea', { v0: NOTHING_WRITTEN })
          : `The service only checked the undo and wrote nothing. ${NOTHING_WRITTEN}`,
      };
    case 'conflict':
      return { tone: 'refused', text: undoConflictInWords(result.detail) };
    case 'refused':
      return {
        tone: 'refused',
        text: `${undoRefusalInWords(result.reason, result.detail, uiTranslate)} ${NOTHING_WRITTEN}`,
      };
    case 'failed':
      return {
        tone: 'failed',
        text: uiTranslate
          ? uiTranslate('helper_f042fe99ac1f', {
              v0: result.detail
                ? `The undo did not land: ${result.detail}.`
                : 'The undo did not land.',
            })
          : `${result.detail ? `The undo did not land: ${result.detail}.` : 'The undo did not land.'} Check Activity before trying again.`,
      };
  }
}

function localizedRefusal(result:ApplyActionResult,currency:string|null,t:ScaleCopy,locale:UiLocale):string{
 const reason=bareReason(result.reason)??'other',bound=reason==='guardrail'?boundedMovePct(result.detail):null;
 if(bound!=null)return t('platformBoundedMove',{undo:'no',percent:bound});
 const parts=[t('platformActionRefusal',{reason})];
 if(reason==='validate_only_error'&&result.detail){
  const codes=/google:([A-Z0-9_,]+)/.exec(result.detail)?.[1]?.split(',').filter(code=>!code.startsWith('HTTP_'))??[];
  for(const code of codes)parts.push(t('platformGoogleRefusal',{code}));
  const minimum=/minimumBudgetMinor=(\d+)/.exec(result.detail)?.[1];
  if(minimum&&currency)parts.push(t('helper_46dce481afe7',{v0:formatMinorExact(Number(minimum),currency,locale)}));
 }
 if(locale==='en'&&parts.length>1)return (parts[0]??'').replace(/\.$/,':')+' '+parts.slice(1).join(' ');
 return parts.join(' ');
}

export function previewVerdict(response:ApplyActionsResponse|null,currency:string|null,t?:ScaleCopy,locale:UiLocale='en'):CardActionVerdict{
 if(!t)return previewVerdictEnglish(response,currency,undefined,locale);
 const result=response?.results[0];
 if(!result)return {tone:'failed',text:t('platformActionVerdict',{status:'unreadable'})};
 if(result.status==='would_apply')return {tone:'ok',text:t('platformActionVerdict',{status:'preview_ok'})};
 if(result.status==='deduped')return {tone:'ok',text:t('platformActionVerdict',{status:'preview_deduped'})};
 return {tone:result.status==='refused'?'refused':'failed',text:localizedRefusal(result,currency,t,locale)+' '+t('platformActionVerdict',{status:'nothing'})};
}

export function resultVerdict(response:ApplyActionsResponse|null,currency:string|null,t?:ScaleCopy,locale:UiLocale='en'):CardActionVerdict{
 if(!t)return resultVerdictEnglish(response,currency,undefined,locale);
 const result=response?.results[0];
 if(!result)return {tone:'failed',text:t('platformActionVerdict',{status:'failed'})};
 if(result.status==='refused')return {tone:'refused',text:localizedRefusal(result,currency,t,locale)+' '+t('platformActionVerdict',{status:'nothing'})};
 const status=result.status==='would_apply'?'checked':result.status;
 const tone=['applied','scheduled','deduped'].includes(result.status)?'ok':result.status==='would_apply'?'refused':'failed';
 return {tone,text:t('platformActionVerdict',{status:['applied','scheduled','deduped','compensated','stranded','checked'].includes(status)?status:'failed'})};
}

function localizedUndoVerdict(response:ActionRevertResponse|null,t:ScaleCopy,preview:boolean):CardActionVerdict{
 const result=response?.result;
 if(!result)return {tone:'failed',text:t('platformActionVerdict',{status:preview?'unreadable':'undo_failed'})};
 switch(result.status){
  case 'would_revert':return {tone:preview?'ok':'refused',text:t('platformActionVerdict',{status:preview?'undo_preview':'undo_checked'})};
  case 'reverted':return {tone:'ok',text:t('platformActionVerdict',{status:preview?'undo_deduped':'undo_ok'})};
  case 'conflict':return {tone:'refused',text:t('platformActionVerdict',{status:'undo_conflict'})};
  case 'refused':{
   const reason=bareReason(result.reason)??'other',bound=reason==='guardrail'?boundedMovePct(result.detail):null;
   return {tone:'refused',text:(bound!=null?t('platformBoundedMove',{undo:'yes',percent:bound}):t('platformUndoRefusal',{reason}))+' '+t('platformActionVerdict',{status:'nothing'})};
  }
  case 'failed':return {tone:'failed',text:t('platformActionVerdict',{status:'undo_failed'})};
 }
}
export function undoPreviewVerdict(response:ActionRevertResponse|null,t?:ScaleCopy):CardActionVerdict{return t?localizedUndoVerdict(response,t,true):undoPreviewVerdictEnglish(response)}
export function undoResultVerdict(response:ActionRevertResponse|null,t?:ScaleCopy):CardActionVerdict{return t?localizedUndoVerdict(response,t,false):undoResultVerdictEnglish(response)}
