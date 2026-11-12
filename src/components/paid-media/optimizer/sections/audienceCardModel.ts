import type { AudienceProposalErrorCode } from '@continuum/contracts';
import type { useTranslations as ScaleTranslationHook } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

// Pure reads for the audience recommendation card. No React, no fetch: what to show for a
// proposal row, the before → after comparison an open proposal leads with, the rail of
// small reads under it (why, new to the portfolio, launch plan, ads), what went wrong when
// the row failed and which button fixes it, and what the executed result lists as
// implemented. Every string a person reads is English and is written here, once.

import type {
  AudienceExpansionOption,
  AudienceProposalBlock,
  AudienceProposalCardState,
  AudienceProposalPlan,
  AudienceProposalResult,
  AudienceProposalRow,
  AudienceSizeEstimate,
  MetaTargetingRef,
  MetaTargetingSpec,
  RecommendationRow,
} from '@continuum/contracts';
import {
  audienceProposalCardState,
  behaviorRefsOf,
  interestRefsOf,
  metaTargetingSpecSchema,
  proposalForRecommendation,
  readProposalBlock,
  readProposalPlan,
  readProposalResult,
  summarizeTargetingSpec,
} from '@continuum/contracts';
import { formatDecimal } from '@/lib/format/decimal';
import { formatCurrency } from '../format';

export const AUDIENCE_TRIGGERS = new Set(['F2_audience_saturation', 'F3_audience_exhausted']);

export function isAudienceRecommendation(
  rec: Pick<RecommendationRow, 'kind' | 'trigger'>,
): boolean {
  return rec.kind === 'audience_expand' && AUDIENCE_TRIGGERS.has(rec.trigger);
}

export type AudienceCardView = {
  row: AudienceProposalRow | null;
  state: ReturnType<typeof audienceProposalCardState>;
  plan: AudienceProposalPlan | null;
  block: ReturnType<typeof readProposalBlock>;
  result: AudienceProposalResult | null;
  errorMessage: string | null;
  /** What failed and which button fixes it; null unless the row is failed. */
  failure: ProposalFailure | null;
};

/** What the card's action callbacks report back, so the card can answer a press in place
 *  (a throttled re-ask, a refused RPC) instead of leaving it to a toast. */
export type AudienceActionHandlers = {
  /** The proposal id the RPC returned (the request RPC) or acted on (retry). */
  onDone?: (proposalId: string) => void;
  onError?: (message: string) => void;
};

/**
 * The card's state for a row. `audienceProposalCardState` reads a superseded row as `none`
 * — the terminal states no longer own a decision — but a proposal that was BLOCKED and then
 * superseded still holds the one fact the person came for: why nothing could be built. The
 * reason outlives the signal, so that row keeps its blocked face (reason shown, create
 * disabled) instead of offering a fresh analysis as if nothing had been tried.
 */
export function audienceCardStateFor(
  row: AudienceProposalRow | null,
): ReturnType<typeof audienceProposalCardState> {
  const state = audienceProposalCardState(row);
  if (state !== 'none' || !row || row.status !== 'superseded') return state;
  if (readProposalPlan(row) || !readProposalBlock(row)) return state;
  return readProposalBlock(row)?.code === 'cbo_campaign' ? 'blocked_cbo' : 'blocked';
}

/** The recommendation's status once its proposal reached the given status: the cycle expires
 *  the recommendation when it supersedes the proposal (public.optimizer_supersede_
 *  recommendations), a cancelled proposal rejects it, an executed one is applied, and every
 *  state before a decision leaves it pending. Documented consequences, never guesses. */
function recommendationStatusFor(status: AudienceProposalRow['status']): string {
  switch (status) {
    case 'superseded':
      return 'expired';
    case 'cancelled':
      return 'rejected';
    case 'executed':
    case 'activate_requested':
    case 'activating':
    case 'undo_requested':
    case 'undoing':
    case 'undone':
      return 'applied';
    default:
      return 'pending';
  }
}

/**
 * A recommendation row rebuilt from the proposal it opened, for a recommendation the cycle
 * report does not carry.
 *
 * The report lists PENDING recommendations, and it is a cached read: the recommendation a
 * press just minted is not in it until the next fetch, and one a later cycle expired never
 * comes back (public.optimizer_supersede_recommendations sets the proposal to `superseded`
 * and, in the same pass, the recommendation to `expired`). Every field here is the proposal's
 * own (id, ad set, kind, trigger, run, dates) or a documented consequence of its status; the
 * severity the engine scored is not on the proposal and is left null rather than guessed.
 * Only proposals an asked-for handoff points at are carried this way, so the row someone's
 * own press created always has somewhere to land.
 */
export function carriedRecommendation(
  proposal: AudienceProposalRow,
  adsetName: string | null = null,
): RecommendationRow | null {
  if (!proposal.recommendation_id) return null;
  const block = readProposalBlock(proposal);
  return {
    id: proposal.recommendation_id,
    adset_id: proposal.adset_id,
    adset_name: adsetName,
    ad_id: null,
    kind: proposal.kind,
    trigger: proposal.trigger,
    severity: null,
    reason: block?.message ?? null,
    status: recommendationStatusFor(proposal.status),
    run_id: proposal.cycle_run_id,
    created_at: proposal.created_at,
  };
}

/** What each proposal state is called on screen — on the asked-for row that opened it, on
 *  the inline panel, and on the card. One table, so the three cannot drift. */
export const AUDIENCE_PROPOSAL_STATE_LABEL: Record<AudienceProposalCardState, string> = {
  none: 'No proposal',
  queued: 'Queued',
  proposing: 'Jaina is reading',
  ready: 'Ready',
  blocked: 'Blocked',
  blocked_cbo: 'Blocked',
  failed: 'Failed',
  approved: 'Approved',
  executing: 'Creating the ad set',
  executed: 'Created in Meta',
  switching: 'Activating',
  undoing: 'Undoing',
  undone: 'Undone',
};

/** The one-line reason an error code stands for, when the stored message is not a sentence
 *  written for a person. */
const FAILURE_COPY_BY_CODE: Record<AudienceProposalErrorCode, string> = {
  propose_failed: 'Jaina ran into an error while reading the audience, catalogue and creatives.',
  execute_failed: 'Meta returned an error while the new ad set was being created.',
  activate_failed: 'Meta returned an error while the new ad set was being switched on.',
  undo_failed: 'Meta returned an error while the new ad set was being paused.',
  signal_stopped: 'The signal stopped firing, so the proposal was closed.',
  cbo_campaign:
    'The campaign holds the budget, so an ad set with a budget of its own cannot be added.',
  targeting_changed: "The ad set's targeting changed in Meta after Jaina read it.",
  meta_permission: "Continuum's Meta connection can read this ad account but cannot write to it.",
};
const FAILURE_COPY_DEFAULT = 'The proposal could not be built.';
/** Past this a message is a dump, not a sentence a person is meant to read. */
const HUMAN_MESSAGE_MAX = 240;
/** Meta's own text is shown verbatim but never as a wall. */
const META_MESSAGE_MAX = 200;

/** Whether an error message was written for a person: one line, not a JSON dump, short. */
function isHumanMessage(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > HUMAN_MESSAGE_MAX) return false;
  if (/[\n\r]/.test(trimmed)) return false;
  return !/^[[{]/.test(trimmed);
}

const stringField = (error: Record<string, unknown>, key: string): string =>
  typeof error[key] === 'string' ? (error[key] as string) : '';

/** The Backend's gateway wraps a Graph refusal as "Meta rejected <what> with HTTP <n>: <Meta's
 *  own text>". That text is in the connected user's Meta language, so it is Meta's words to
 *  quote, never the reason this card states. */
const META_REJECTED = /^Meta rejected [\s\S]+? with HTTP \d+(?::\s*([\s\S]*))?$/;

function metaRejection(message: string): { metaText: string | null } | null {
  const match = META_REJECTED.exec(message.trim());
  return match ? { metaText: match[1]?.trim() || null } : null;
}

/**
 * Why a proposal failed, in one line a person can read.
 *
 * The worker stores whatever the failing step threw in `error.message` — for MENSAJES //
 * TODOS on 2026-09-29 that was a 40-line Zod issue list. A row must never print that. A
 * message written as a sentence is used as is; anything else is replaced by the sentence the
 * error code stands for.
 */
export function proposalFailureReason(
  error: AudienceProposalRow['error'],
  uiTranslate?: ScaleCopy,
): string | null {
  if (!error) return null;
  if (uiTranslate)
    return uiTranslate('audienceFailureReason', {
      code: stringField(error, 'code'),
    });
  const message = stringField(error, 'message');
  if (isHumanMessage(message) && !metaRejection(message)) return message.trim();
  return (
    FAILURE_COPY_BY_CODE[stringField(error, 'code') as AudienceProposalErrorCode] ??
    FAILURE_COPY_DEFAULT
  );
}

// ── A failed row: what failed, and the button that fixes it ────────────────────────────

export type FailurePhase = 'propose' | 'execute' | 'activate' | 'undo';

export type ProposalFailure = {
  phase: FailurePhase;
  /** What failed, bold: "Meta refused the new ad set." */
  headline: string;
  /** Why, in one sentence. Never a raw dump. */
  reason: string;
  /** Meta's own words, verbatim and clipped — shown small, as "Meta said: …". */
  metaSaid: string | null;
  /** What exists in Meta now: nothing, or the partial result a retry picks up from. */
  outcome: string;
  /** `retry` re-runs the failed Meta write on the same plan; `reask` asks Jaina for a new
   *  proposal (the plan itself is missing or no longer valid). */
  action: 'retry' | 'reask';
  /** Meta refused for lack of write access: the fix is the connection, not a retry alone. */
  checkConnection: boolean;
};

const PHASE_BY_CODE: Record<string, FailurePhase> = {
  propose_failed: 'propose',
  execute_failed: 'execute',
  activate_failed: 'activate',
  undo_failed: 'undo',
  meta_permission: 'execute',
  cbo_campaign: 'propose',
  signal_stopped: 'propose',
  targeting_changed: 'execute',
};

const HEADLINE_BY_PHASE: Record<FailurePhase, string> = {
  propose: "Jaina couldn't build the proposal.",
  execute: 'Meta refused the new ad set.',
  activate: "Couldn't activate the new ad set.",
  undo: "Couldn't undo the new ad set.",
};

/** Codes whose plan cannot simply be re-sent: the world moved under it, so Jaina has to read
 *  it again. */
const REASK_CODES = new Set(['targeting_changed', 'signal_stopped', 'cbo_campaign']);

function failurePhase(error: Record<string, unknown>, hasPlan: boolean): FailurePhase {
  const phase = stringField(error, 'phase');
  if (phase === 'propose' || phase === 'execute' || phase === 'activate' || phase === 'undo') {
    return phase;
  }
  return PHASE_BY_CODE[stringField(error, 'code')] ?? (hasPlan ? 'execute' : 'propose');
}

function clip(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1).trimEnd()}…` : oneLine;
}

/**
 * A failed row read for the failure block: what failed, why, what Meta said, what exists in
 * Meta now, and the one button that fixes it. The plan being fine and a Meta write failing
 * (execute / activate / undo) is a retry of that write; a failure while proposing — or with
 * no plan to send — is a fresh ask to Jaina.
 */
export function proposalFailure(
  row: Pick<AudienceProposalRow, 'status' | 'error'> | null,
  plan: AudienceProposalPlan | null,
  result: AudienceProposalResult | null,
  uiTranslate?: ScaleCopy,
): ProposalFailure | null {
  if (!row || row.status !== 'failed') return null;
  const error = row.error ?? {};
  const code = stringField(error, 'code');
  const phase = failurePhase(error, plan != null);
  const message = stringField(error, 'message').trim();
  const metaRaw =
    stringField(error, 'meta_message').trim() || metaRejection(message)?.metaText || '';
  const adsetId = result?.adset?.id ?? null;
  const outcome =
    phase === 'activate' || phase === 'undo'
      ? adsetId
        ? `The new ad set (${adsetId}) is still in Meta, unchanged.`
        : 'Nothing changed in Meta.'
      : adsetId
        ? `A partial result is left in Meta (ad set ${adsetId}); retrying picks up from there.`
        : 'Nothing was created in Meta.';
  const writePhase = phase !== 'propose';
  return {
    phase,
    headline: uiTranslate
      ? uiTranslate('audienceFailureHeadline', { phase })
      : HEADLINE_BY_PHASE[phase],
    reason: proposalFailureReason(error, uiTranslate) ?? FAILURE_COPY_DEFAULT,
    metaSaid: metaRaw && metaRaw !== message ? clip(metaRaw, META_MESSAGE_MAX) : null,
    outcome: uiTranslate
      ? uiTranslate('audienceFailureOutcome', {
          write: phase === 'activate' || phase === 'undo' ? 'existing' : 'new',
          hasId: adsetId ? 'yes' : 'no',
          id: adsetId ?? '',
        })
      : outcome,
    action: writePhase && plan != null && !REASK_CODES.has(code) ? 'retry' : 'reask',
    checkConnection: code === 'meta_permission',
  };
}

/** The request RPC hands back the SAME row when a person already re-asked within the hour
 *  (optimizer_request_audience_proposal: "One human re-ask per hour per ad set"). Pressing
 *  "Ask Jaina again" must not then look like it did nothing. */
const REASK_WINDOW_MS = 60 * 60 * 1000;
const THROTTLED_STATUSES = new Set<AudienceProposalRow['status']>(['failed', 'blocked', 'ready']);

/** The note for a re-ask the RPC throttled, or null when the press opened a new proposal. */
export function reaskThrottledNote(
  returnedId: string,
  row: Pick<AudienceProposalRow, 'id' | 'status' | 'created_at'> | null,
  formatTime: ((at: Date) => string) | undefined = undefined,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string | null {
  const displayTime =
    formatTime ??
    ((at: Date) => at.toLocaleTimeString(uiLocale, { hour: '2-digit', minute: '2-digit' }));
  if (!row || returnedId !== row.id || !THROTTLED_STATUSES.has(row.status)) return null;
  const createdAt = Date.parse(row.created_at);
  if (Number.isNaN(createdAt)) {
    return uiTranslate
      ? uiTranslate('audienceReaskLater')
      : 'Jaina already re-analysed this in the last hour. Try again later.';
  }
  return uiTranslate
    ? uiTranslate('helper_51e9e9027da2', {
        v0: displayTime(new Date(createdAt + REASK_WINDOW_MS)),
      })
    : `Jaina already re-analysed this in the last hour. Try again after ${displayTime(
        new Date(createdAt + REASK_WINDOW_MS),
      )}.`;
}

export function audienceCardView(
  rows: readonly AudienceProposalRow[],
  rec: Pick<RecommendationRow, 'id' | 'adset_id' | 'trigger'>,
  uiTranslate?: ScaleCopy,
): AudienceCardView {
  const row = proposalForRecommendation(rows, rec);
  const plan = row ? readProposalPlan(row) : null;
  const result = row ? readProposalResult(row) : null;
  return {
    row,
    state: audienceCardStateFor(row),
    plan,
    block: row
      ? (() => {
          const block = readProposalBlock(row);
          return block && uiTranslate
            ? {
                ...block,
                message: uiTranslate('audienceBlockReason', {
                  code: block.code,
                }),
              }
            : block;
        })()
      : null,
    result,
    errorMessage: row ? proposalFailureReason(row.error, uiTranslate) : null,
    failure: proposalFailure(row, plan, result, uiTranslate),
  };
}

// ── The portfolio's other ad sets ──────────────────────────────────────────────────────

/** One enrolled ad set's live targeting, for the "new to the portfolio" comparison. */
export type PortfolioAdsetSpec = {
  adsetId: string;
  adsetName: string | null;
  spec: MetaTargetingSpec;
};

/** The specs the snapshot envelope carries beside the fleet, parsed at the boundary. A spec
 *  that does not parse is left out rather than compared as an empty audience — an empty
 *  audience would make every option look new. */
export function portfolioSpecsFrom(
  targeting: readonly { adsetId: string; spec: Record<string, unknown> }[],
  nameOf: (adsetId: string) => string | null,
): PortfolioAdsetSpec[] {
  const specs: PortfolioAdsetSpec[] = [];
  for (const entry of targeting) {
    const parsed = metaTargetingSpecSchema.safeParse(entry.spec);
    if (!parsed.success) continue;
    specs.push({
      adsetId: entry.adsetId,
      adsetName: nameOf(entry.adsetId),
      spec: parsed.data,
    });
  }
  return specs;
}

// ── Reading a spec in words ────────────────────────────────────────────────────────────

const GENDER_WORD: Record<'all' | 'women' | 'men', string> = {
  all: 'all',
  women: 'women',
  men: 'men',
};

type Facets = {
  age: string | null;
  gender: 'all' | 'women' | 'men' | null;
  geo: string[];
  interests: string[];
  behaviors: string[];
  seeds: string[];
  excludedSeeds: string[];
  advantage: boolean | null;
};

const refNames = (refs: readonly MetaTargetingRef[] | undefined): string[] =>
  (refs ?? []).map((ref) => ref.name ?? ref.id);

/** A radius around a named place (geo_locations.places / custom_locations): the shared
 *  summary reads countries, regions, cities and zips only, so a local business that targets
 *  "4 km around the gym" would otherwise read as no location at all. */
function placeWords(spec: MetaTargetingSpec, uiTranslate?: ScaleCopy): string[] {
  const geo = (spec.geo_locations ?? {}) as Record<string, unknown>;
  const spots = [geo.places, geo.custom_locations].flatMap((list) =>
    Array.isArray(list) ? (list as Array<Record<string, unknown>>) : [],
  );
  return spots.map((spot) => {
    const name =
      typeof spot.name === 'string' && spot.name.trim()
        ? spot.name.trim()
        : typeof spot.address_string === 'string'
          ? spot.address_string
          : uiTranslate
            ? uiTranslate('audiencePinnedLocation')
            : 'a pinned location';
    const unit = spot.distance_unit === 'mile' ? 'mi' : 'km';
    return typeof spot.radius === 'number'
      ? uiTranslate
        ? uiTranslate('audienceRadius', { radius: spot.radius, unit, name })
        : `${spot.radius} ${unit} around ${name}`
      : name;
  });
}

function facetsOf(spec: MetaTargetingSpec, uiTranslate?: ScaleCopy): Facets {
  const summary = summarizeTargetingSpec(spec);
  return {
    age: summary.age,
    gender: spec.genders && spec.genders.length > 0 ? summary.gender : null,
    geo: [...summary.geo, ...placeWords(spec, uiTranslate)],
    interests: summary.interests,
    behaviors: summary.behaviors,
    seeds: refNames(spec.custom_audiences),
    excludedSeeds: refNames(spec.excluded_custom_audiences),
    advantage: summary.advantageAudience,
  };
}

function hasFacets(facets: Facets): boolean {
  return (
    facets.age != null ||
    facets.gender != null ||
    facets.geo.length > 0 ||
    facets.interests.length > 0 ||
    facets.behaviors.length > 0 ||
    facets.seeds.length > 0 ||
    facets.excludedSeeds.length > 0 ||
    facets.advantage != null
  );
}

function wordsOf(facets: Facets, uiTranslate?: ScaleCopy): string | null {
  const parts: string[] = [];
  if (facets.seeds.length > 0) parts.push(facets.seeds.join(', '));
  if (facets.geo.length > 0) parts.push(facets.geo.join(', '));
  if (facets.age) parts.push(facets.age);
  if (facets.gender && facets.gender !== 'all')
    parts.push(
      uiTranslate
        ? uiTranslate('audienceGender', { gender: facets.gender })
        : GENDER_WORD[facets.gender],
    );
  if (facets.interests.length > 0)
    parts.push(
      uiTranslate
        ? uiTranslate('helper_d150c2d27a06', {
            v0: facets.interests.join(', '),
          })
        : `interests: ${facets.interests.join(', ')}`,
    );
  if (facets.behaviors.length > 0)
    parts.push(
      uiTranslate
        ? uiTranslate('helper_a44b589f5358', {
            v0: facets.behaviors.join(', '),
          })
        : `behaviors: ${facets.behaviors.join(', ')}`,
    );
  if (facets.excludedSeeds.length > 0)
    parts.push(
      uiTranslate
        ? uiTranslate('helper_242ad2de4103', {
            v0: facets.excludedSeeds.join(', '),
          })
        : `excludes ${facets.excludedSeeds.join(', ')}`,
    );
  if (facets.advantage === true)
    parts.push(
      uiTranslate
        ? `Advantage+ ${uiTranslate('audienceSwitchValue', { state: 'on' })}`
        : 'Advantage+ on',
    );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** "Lookalike 1% buyers · MX · 25–45 · interests: Gyms" — or null for an empty spec. */
export function audienceWords(spec: MetaTargetingSpec, uiTranslate?: ScaleCopy): string | null {
  return wordsOf(facetsOf(spec, uiTranslate), uiTranslate);
}

const chosenOptions = (plan: AudienceProposalPlan): AudienceExpansionOption[] => {
  const chosen = new Set(plan.chosen_option_ids);
  return plan.options.filter((o) => o.id != null && chosen.has(o.id) && o.blocked_by == null);
};

const SEED_KINDS = new Set<AudienceExpansionOption['kind']>([
  'custom_audience',
  'lookalike',
  'saved_audience',
]);

/** The proposed facets: the proposal's own spec, or — when the builder wrote none — the
 *  current spec with the chosen options folded in by kind. */
function proposedFacets(plan: AudienceProposalPlan, uiTranslate?: ScaleCopy): Facets {
  const own = facetsOf(plan.targeting_spec, uiTranslate);
  if (hasFacets(own)) return own;
  const base = facetsOf(plan.previous_spec, uiTranslate);
  const union = (list: string[], add: string[]) => [...new Set([...list, ...add])];
  const names = (kinds: (kind: AudienceExpansionOption['kind']) => boolean) =>
    chosenOptions(plan)
      .filter((o) => kinds(o.kind))
      .map((o) => o.name);
  return {
    ...base,
    interests: union(
      base.interests,
      names((k) => k === 'interest'),
    ),
    behaviors: union(
      base.behaviors,
      names((k) => k === 'behavior'),
    ),
    seeds: union(
      base.seeds,
      names((k) => SEED_KINDS.has(k)),
    ),
    geo: union(
      base.geo,
      names((k) => k === 'geo'),
    ),
  };
}

export type ProposedAudience = {
  /** The proposed targeting in words; never empty. */
  words: string;
  /** "1.2M" — the delivery estimate for the proposal, or null when none was made. */
  reach: string | null;
};

/** The proposal in words with its estimated reach. */
export function proposedAudience(
  plan: AudienceProposalPlan,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): ProposedAudience {
  return {
    words:
      wordsOf(proposedFacets(plan, uiTranslate), uiTranslate) ??
      (uiTranslate
        ? uiTranslate('audienceUnreadableTargeting')
        : 'The proposal carries no readable targeting.'),
    reach: estimateLabel(plan.reach.proposed, uiLocale),
  };
}

// ── Before → after ─────────────────────────────────────────────────────────────────────

/** added: the proposal adds it; removed: the proposal drops it; kept: on both sides. */
export type ChipTone = 'added' | 'removed' | 'kept';

export type AudienceChip = {
  name: string;
  tone: ChipTone;
  /** No other ad set of the portfolio targets it today (audienceNovelty's `fresh`). */
  isNew: boolean;
};

/** One side of a comparison row: plain words, or chips for a list facet. An empty chip
 *  list reads as `empty` on screen. */
export type ComparisonCell =
  | { kind: 'text'; text: string }
  | { kind: 'chips'; chips: AudienceChip[]; empty: string };

export type ComparisonRow = {
  label: string;
  current: ComparisonCell;
  proposed: ComparisonCell;
};

export type AudienceComparison = {
  /** Whether the row recorded the ad set's targeting before the proposal. Without it the
   *  current side has nothing to show and every proposed chip reads as added. */
  hasPrevious: boolean;
  rows: ComparisonRow[];
  /** "Reach 516K–607K", or null when Meta gave no estimate for the current audience. */
  currentReach: string | null;
  /** "Reach 569K–669K", or null. */
  proposedReach: string | null;
  /** "+10%" / "−35%" / "×2.3" beside the proposed reach, with its direction. */
  reachChange: { label: string; up: boolean } | null;
  /** Said when the proposal lifts an exclusion: the people it kept out can see the ads again. */
  exclusionWarning: string | null;
};

const text = (value: string): ComparisonCell => ({ kind: 'text', text: value });

function listCells(
  before: string[],
  after: string[],
  fresh: ReadonlySet<string>,
  empty: string,
): { current: ComparisonCell; proposed: ComparisonCell } {
  const afterSet = new Set(after);
  const beforeSet = new Set(before);
  return {
    current: {
      kind: 'chips',
      empty,
      chips: before.map((name) => ({
        name,
        tone: afterSet.has(name) ? 'kept' : 'removed',
        isNew: false,
      })),
    },
    proposed: {
      kind: 'chips',
      empty,
      chips: after.map((name) => ({
        name,
        tone: beforeSet.has(name) ? 'kept' : 'added',
        isNew: !beforeSet.has(name) && fresh.has(name),
      })),
    },
  };
}

const ageGender = (facets: Facets, uiTranslate?: ScaleCopy): string =>
  `${facets.age ?? (uiTranslate ? uiTranslate('audienceAnyAge') : 'Any age')} · ${uiTranslate ? uiTranslate('audienceGender', { gender: facets.gender ?? 'all' }) : GENDER_WORD[facets.gender ?? 'all']}`;

const advantageWord = (value: boolean | null, uiTranslate?: ScaleCopy): string =>
  uiTranslate
    ? uiTranslate('audienceSwitchValue', {
        state: value == null ? 'unset' : value ? 'on' : 'off',
      })
    : value == null
      ? 'Not set'
      : value
        ? 'On'
        : 'Off';

/**
 * The before → after the card leads with: the ad set's targeting today beside the proposed
 * one, row by row — age and gender, locations, interests, custom and saved audiences,
 * exclusions, Advantage+ — with every list facet as chips a person can scan for colour:
 * what the proposal adds, what it drops, what stays. A chip no other ad set of the
 * portfolio uses carries NEW (`novelty.fresh`).
 */
export function audienceComparison(
  plan: AudienceProposalPlan,
  novelty: Pick<AudienceNovelty, 'fresh'> | null = null,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): AudienceComparison {
  const before = facetsOf(plan.previous_spec, uiTranslate);
  const after = proposedFacets(plan, uiTranslate);
  const hasPrevious = hasFacets(before);
  const fresh = new Set((novelty?.fresh ?? []).map((item) => item.name));
  const unknown = text(uiTranslate ? uiTranslate('audienceNotRecorded') : 'Not recorded');

  const rows: ComparisonRow[] = [];
  rows.push({
    label: uiTranslate ? uiTranslate('age_gender_413360e') : 'Age · gender',
    current: hasPrevious ? text(ageGender(before, uiTranslate)) : unknown,
    proposed: text(ageGender(after, uiTranslate)),
  });
  rows.push({
    label: uiTranslate ? uiTranslate('audienceLocations') : 'Locations',
    current: hasPrevious
      ? text(before.geo.join(', ') || (uiTranslate ? uiTranslate('audienceAnywhere') : 'Anywhere'))
      : unknown,
    proposed: text(
      after.geo.join(', ') || (uiTranslate ? uiTranslate('audienceAnywhere') : 'Anywhere'),
    ),
  });
  const interests = listCells(
    hasPrevious ? [...before.interests, ...before.behaviors] : [],
    [...after.interests, ...after.behaviors],
    fresh,
    uiTranslate ? uiTranslate('audienceNoItems') : 'None',
  );
  rows.push({
    label: uiTranslate ? uiTranslate('interests_756aaea') : 'Interests',
    current: hasPrevious ? interests.current : unknown,
    proposed: interests.proposed,
  });
  const seeds = listCells(
    hasPrevious ? before.seeds : [],
    after.seeds,
    fresh,
    uiTranslate ? uiTranslate('audienceNoItems') : 'None',
  );
  rows.push({
    label: uiTranslate ? uiTranslate('custom_saved_audiences_0cf0b86') : 'Custom/saved audiences',
    current: hasPrevious ? seeds.current : unknown,
    proposed: seeds.proposed,
  });
  const excludes = listCells(
    hasPrevious ? before.excludedSeeds : [],
    after.excludedSeeds,
    new Set(),
    uiTranslate ? uiTranslate('audienceNothing') : 'Nothing',
  );
  rows.push({
    label: uiTranslate ? uiTranslate('audienceExcludes') : 'Excludes',
    current: hasPrevious ? excludes.current : unknown,
    proposed: excludes.proposed,
  });
  rows.push({
    label: 'Advantage+',
    current: hasPrevious ? text(advantageWord(before.advantage, uiTranslate)) : unknown,
    proposed: text(advantageWord(after.advantage, uiTranslate)),
  });

  // excluded_custom_audiences only ever holds custom audiences and lookalikes, so a lifted
  // exclusion always means people who were kept out (usually existing customers) are back in.
  const lifted = hasPrevious
    ? before.excludedSeeds.filter((name) => !after.excludedSeeds.includes(name))
    : [];
  const currentReach = estimateLabel(plan.reach.current, uiLocale);
  const proposedReach = estimateLabel(plan.reach.proposed, uiLocale);
  return {
    hasPrevious,
    rows,
    currentReach: currentReach
      ? uiTranslate
        ? uiTranslate('audienceReach', { value: currentReach })
        : `Reach ${currentReach}`
      : null,
    proposedReach: proposedReach
      ? uiTranslate
        ? uiTranslate('audienceReach', { value: proposedReach })
        : `Reach ${proposedReach}`
      : null,
    reachChange: reachChange(plan, uiLocale),
    exclusionWarning:
      lifted.length > 0
        ? uiTranslate
          ? uiTranslate('audienceLiftedExclusion', { names: lifted.join(', ') })
          : `People in ${lifted.join(', ')} can see these ads again.`
        : null,
  };
}

// ── New to the portfolio ───────────────────────────────────────────────────────────────

const KIND_LABEL: Record<AudienceExpansionOption['kind'], string> = {
  interest: 'interest',
  behavior: 'behavior',
  demographic: 'demographic',
  geo: 'location',
  custom_audience: 'custom audience',
  lookalike: 'lookalike',
  saved_audience: 'saved audience',
};

export type AudienceNovelty = {
  /** Other enrolled ad sets whose spec was available to compare against. */
  comparedAdsets: number;
  /** Chosen options and seeds no ad set of the portfolio targets today. */
  fresh: Array<{ name: string; kindLabel: string }>;
  /** Chosen options and seeds some other ad set of the portfolio already targets. */
  reused: Array<{ name: string; kindLabel: string; usedIn: string[] }>;
  /** Options the brand rules crossed out, with the rule. */
  excludedByRule: Array<{ name: string; rule: string }>;
};

/** Every platform id a spec targets: interests, behaviours and custom audiences. */
function targetedIds(spec: MetaTargetingSpec): Set<string> {
  const ids = new Set<string>();
  for (const ref of interestRefsOf(spec)) ids.add(ref.id);
  for (const ref of behaviorRefsOf(spec)) ids.add(ref.id);
  for (const ref of spec.custom_audiences ?? []) ids.add(ref.id);
  return ids;
}

/** What the proposal adds that no ad set of the portfolio targets today — the chosen
 *  options and the seeds of the proposed spec, each checked against previous_spec and every
 *  OTHER enrolled ad set's spec. An option the current ad set already targets is neither new
 *  nor reused, so it is not listed. */
export function audienceNovelty(
  plan: AudienceProposalPlan,
  portfolioSpecs: readonly PortfolioAdsetSpec[],
): AudienceNovelty {
  const others = portfolioSpecs
    .filter((entry) => entry.adsetId !== plan.source.adset_id)
    .map((entry) => ({
      name: entry.adsetName ?? entry.adsetId,
      ids: targetedIds(entry.spec),
    }));
  const live = targetedIds(plan.previous_spec);
  const fresh: AudienceNovelty['fresh'] = [];
  const reused: AudienceNovelty['reused'] = [];
  const seen = new Set<string>();
  const place = (id: string, name: string, kindLabel: string) => {
    if (seen.has(id) || live.has(id)) return;
    seen.add(id);
    const usedIn = others.filter((other) => other.ids.has(id)).map((other) => other.name);
    if (usedIn.length > 0) reused.push({ name, kindLabel, usedIn });
    else fresh.push({ name, kindLabel });
  };
  for (const option of chosenOptions(plan)) {
    if (option.id) place(option.id, option.name, KIND_LABEL[option.kind]);
  }
  for (const seed of plan.targeting_spec.custom_audiences ?? []) {
    place(seed.id, seed.name ?? seed.id, KIND_LABEL.custom_audience);
  }
  return {
    comparedAdsets: others.length,
    fresh,
    reused,
    excludedByRule: plan.options
      .filter((option) => option.blocked_by != null)
      .map((option) => ({
        name: option.name,
        rule: option.blocked_by as string,
      })),
  };
}

export type NoveltySummary = {
  /** "2 of 3 new" — the tile's figure. */
  headline: string;
  /** "Not used by the other ad set of the portfolio." / "…any of the other 62 ad sets…" */
  basis: string;
  /** "1 reused in 1 ad set · 1 filtered by brand rules" — or null when both are zero. */
  counts: string | null;
};

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The "New to the portfolio" tile in three short lines; the long lists stay behind the
 *  tile's collapsible. */
export function noveltySummary(novelty: AudienceNovelty, uiTranslate?: ScaleCopy): NoveltySummary {
  const total = novelty.fresh.length + novelty.reused.length;
  const adsetsReusing = new Set(novelty.reused.flatMap((item) => item.usedIn)).size;
  if (uiTranslate)
    return {
      headline: uiTranslate('audienceNoveltyHeadline', {
        hasItems: total === 0 ? 'no' : 'yes',
        fresh: novelty.fresh.length,
        total,
      }),
      basis: uiTranslate('audienceNoveltyBasis', {
        count: novelty.comparedAdsets,
      }),
      counts:
        [
          novelty.reused.length
            ? uiTranslate('audienceNoveltyReused', {
                count: novelty.reused.length,
                adsets: adsetsReusing,
              })
            : null,
          novelty.excludedByRule.length
            ? uiTranslate('audienceNoveltyFiltered', {
                count: novelty.excludedByRule.length,
              })
            : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
    };
  const counts = [
    novelty.reused.length > 0
      ? `${novelty.reused.length} reused in ${plural(adsetsReusing, 'ad set')}`
      : null,
    novelty.excludedByRule.length > 0
      ? `${novelty.excludedByRule.length} filtered by brand rules`
      : null,
  ].filter((part): part is string => part != null);
  return {
    headline: total === 0 ? 'Nothing new' : `${novelty.fresh.length} of ${total} new`,
    basis:
      novelty.comparedAdsets === 0
        ? "Compared with this ad set only: the portfolio didn't bring the others' targeting."
        : novelty.comparedAdsets === 1
          ? 'Compared with the other ad set of the portfolio.'
          : `Compared with the other ${novelty.comparedAdsets} ad sets of the portfolio.`,
    counts: counts.length > 0 ? counts.join(' · ') : null,
  };
}

// ── Why / launch plan ──────────────────────────────────────────────────────────────────

const TRIGGER_LABEL: Record<string, string> = {
  F2_audience_saturation: 'Frequency saturated',
  F3_audience_exhausted: 'Reach exhausted',
};

export function triggerLabel(trigger: string, uiTranslate?: ScaleCopy): string {
  return uiTranslate && Object.hasOwn(TRIGGER_LABEL, trigger)
    ? uiTranslate('audienceTriggerLabel', { trigger })
    : (TRIGGER_LABEL[trigger] ?? trigger);
}

export type ImplementationLine = { label: string; value: string };

/** The launch plan: the new ad set, how it starts beside the current one (paused unless the
 *  person flips "Start active"), the campaign it lands in and its budget — from the plan, before anything is written. The ads and the
 *  audience have tiles of their own. */
export function implementationLines(
  plan: AudienceProposalPlan,
  currency: string | null,
  startActive = false,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): ImplementationLine[] {
  const code = currency ?? plan.budget.currency;
  const source = plan.source.adset_name ?? plan.source.adset_id;
  const lines: ImplementationLine[] = [
    {
      label: uiTranslate ? uiTranslate('new_ad_set_36c72f1') : 'New ad set',
      value: plan.adset_name,
    },
    {
      label: uiTranslate ? uiTranslate('audienceStarts') : 'Starts',
      value: uiTranslate
        ? uiTranslate('helper_35c0cbdd08ec', {
            v0: startActive ? uiTranslate('entityActive') : uiTranslate('entityPaused'),
            v1: source,
            v2: plan.mode,
          })
        : `${startActive ? 'Active' : 'Paused'}, next to "${source}"${
            plan.mode === 'add'
              ? '; both keep running'
              : '; the current one pauses once the new one is live'
          }`,
    },
  ];
  if (plan.source.campaign_name) {
    lines.push({
      label: uiTranslate ? uiTranslate('campaign_268286d') : 'Campaign',
      value: plan.source.campaign_name,
    });
  }
  lines.push({
    label: uiTranslate ? uiTranslate('budget_1c6225e') : 'Budget',
    value: uiTranslate
      ? uiTranslate('helper_14a40b02b39f', {
          v0: formatCurrency(majorUnits(plan.budget.suggested_minor_units), code, uiLocale),
          v1: formatCurrency(majorUnits(plan.budget.bounds.min_minor_units), code, uiLocale),
          v2: formatCurrency(majorUnits(plan.budget.bounds.max_minor_units), code, uiLocale),
          v3: plan.budget.note ? ` · ${plan.budget.note}` : '',
        })
      : `${formatCurrency(majorUnits(plan.budget.suggested_minor_units), code, uiLocale)}/day · between ${formatCurrency(majorUnits(plan.budget.bounds.min_minor_units), code, uiLocale)} and ${formatCurrency(majorUnits(plan.budget.bounds.max_minor_units), code, uiLocale)}${
          plan.budget.note ? ` · ${plan.budget.note}` : ''
        }`,
  });
  return lines;
}

// ── Figures ────────────────────────────────────────────────────────────────────────────

const compactUnits = new Map<string, string>();
function compact(n: number, locale: UiLocale = 'en'): string {
  const divisor = n >= 1_000_000 ? 1_000_000 : n >= 1_000 ? 1_000 : 1;
  const digits = divisor === 1_000_000 ? 1 : 0;
  const value = divisor === 1_000_000 ? n / divisor : Math.round(n / divisor);
  if (divisor === 1)
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
      useGrouping: false,
    }).format(value);
  const key = `${locale}:${divisor}`;
  let unit = compactUnits.get(key);
  if (!unit) {
    unit =
      new Intl.NumberFormat(locale, { notation: 'compact' })
        .formatToParts(divisor)
        .find((part) => part.type === 'compact')?.value ?? '';
    compactUnits.set(key, unit);
  }
  return `${formatDecimal(value, digits, locale)}${locale === 'en' ? '' : ' '}${unit}`;
}

export function estimateLabel(
  estimate: AudienceSizeEstimate | null | undefined,
  uiLocale: UiLocale = 'en',
): string | null {
  if (!estimate) return null;
  if (estimate.lower === estimate.upper) return compact(estimate.lower, uiLocale);
  return `${compact(estimate.lower, uiLocale)}–${compact(estimate.upper, uiLocale)}`;
}

/** "+10%", "−65%" or "×2.3" from the midpoints of the two estimates; null when either side
 *  is missing or the current one is zero. */
export function reachChange(
  plan: AudienceProposalPlan,
  uiLocale: UiLocale = 'en',
): { label: string; up: boolean } | null {
  const current = plan.reach.current;
  const proposed = plan.reach.proposed;
  if (!current || !proposed) return null;
  const from = (current.lower + current.upper) / 2;
  const to = (proposed.lower + proposed.upper) / 2;
  if (from <= 0) return null;
  const ratio = to / from;
  if (ratio >= 2) return { label: `×${formatDecimal(ratio, 1, uiLocale)}`, up: true };
  const pct = Math.round((ratio - 1) * 100);
  const percent = new Intl.NumberFormat(uiLocale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(Math.abs(pct) / 100);
  return { label: `${pct >= 0 ? '+' : '−'}${percent}`, up: pct >= 0 };
}

export function majorUnits(minor: number): number {
  return Math.round(minor) / 100;
}
export function minorUnits(major: number): number {
  return Math.round(major * 100);
}

export type ImplementedRow = { label: string; value: string };

/** "What was implemented" — from the read-back, never from the intent. */
export function implementedRows(
  result: AudienceProposalResult,
  plan: AudienceProposalPlan | null,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): ImplementedRow[] {
  const rows: ImplementedRow[] = [];
  if (result.campaign)
    rows.push({
      label: uiTranslate ? uiTranslate('campaign_268286d') : 'Campaign',
      value: `${result.campaign.name ?? ''} (${result.campaign.id})`.trim(),
    });
  if (result.adset) {
    const a = result.adset;
    rows.push({
      label: uiTranslate ? uiTranslate('ad_set_639a64f') : 'Ad set',
      value: `${a.name ?? ''} (${a.id})`.trim(),
    });
    rows.push({
      label: uiTranslate ? uiTranslate('status_920e413') : 'Status',
      value: a.effective_status ?? a.status ?? '—',
    });
    if (a.daily_budget)
      rows.push({
        label: uiTranslate ? uiTranslate('daily_budget_7b0a1f0') : 'Daily budget',
        value: uiTranslate
          ? uiTranslate('audienceImplementedBudget', {
              amount: new Intl.NumberFormat(uiLocale, {
                maximumFractionDigits: 2,
                useGrouping: false,
              }).format(majorUnits(Number(a.daily_budget))),
              raw: a.daily_budget,
            })
          : `${majorUnits(Number(a.daily_budget))} (minor units ${a.daily_budget})`,
      });
    if (a.optimization_goal)
      rows.push({
        label: uiTranslate ? uiTranslate('optimization_goal_b5f886f') : 'Optimization goal',
        value: a.optimization_goal,
      });
    if (a.billing_event)
      rows.push({
        label: uiTranslate ? uiTranslate('billing_event_574dbe6') : 'Billing event',
        value: a.billing_event,
      });
    if (a.bid_strategy)
      rows.push({
        label: uiTranslate ? uiTranslate('bid_strategy_43f45e0') : 'Bid strategy',
        value: a.bid_strategy,
      });
    if (a.targeting) {
      const spec = a.targeting as MetaTargetingSpec;
      rows.push({
        label: uiTranslate ? uiTranslate('targeting_dfa4ae5') : 'Targeting',
        value: audienceWords(spec, uiTranslate) ?? '—',
      });
      const s = summarizeTargetingSpec(spec);
      if (s.interests.length)
        rows.push({
          label: uiTranslate ? uiTranslate('interests_756aaea') : 'Interests',
          value: s.interests.join(', '),
        });
      if (s.behaviors.length)
        rows.push({
          label: uiTranslate ? uiTranslate('behaviors_5066deb') : 'Behaviors',
          value: s.behaviors.join(', '),
        });
      if (s.customAudienceCount)
        rows.push({
          label: uiTranslate ? uiTranslate('custom_audiences_563723a') : 'Custom audiences',
          value: new Intl.NumberFormat(uiLocale, {
            maximumFractionDigits: 0,
            useGrouping: false,
          }).format(s.customAudienceCount),
        });
      rows.push({
        label: 'Advantage+',
        value: uiTranslate
          ? uiTranslate('audienceSwitchValue', {
              state: s.advantageAudience == null ? 'unset' : s.advantageAudience ? 'on' : 'off',
            })
          : s.advantageAudience == null
            ? 'not set'
            : s.advantageAudience
              ? 'on'
              : 'off',
      });
    }
    if (a.promoted_object)
      rows.push({
        label: uiTranslate ? uiTranslate('promoted_object_d28829a') : 'Promoted object',
        value: JSON.stringify(a.promoted_object),
      });
  }
  for (const ad of result.ads) {
    const source = ad.source_adset_name ?? ad.source_adset_id;
    rows.push({
      label: uiTranslate ? uiTranslate('ad_1d97c9f') : 'Ad',
      value: uiTranslate
        ? uiTranslate('audienceImplementedAd', {
            name: ad.name ?? ad.id,
            id: ad.id,
            status: ad.effective_status ?? ad.status ?? '—',
            creative: ad.creative_id ?? '?',
            hasSource: source ? 'yes' : 'no',
            source: source ?? '',
          })
        : `${ad.name ?? ad.id} (${ad.id}) · ${ad.effective_status ?? ad.status ?? '—'} · creative ${ad.creative_id ?? '?'}${source ? ` · from ${source}` : ''}`,
    });
  }
  if (result.source_adset) {
    rows.push({
      label: uiTranslate ? uiTranslate('source_ad_set_ba3bd6a') : 'Source ad set',
      value: uiTranslate
        ? uiTranslate('audienceImplementedSource', {
            name: result.source_adset.name ?? result.source_adset.id,
            state: result.source_adset.paused ? 'paused' : 'kept',
            prior: result.source_adset.prior_status ?? '?',
            status: result.source_adset.status_after ?? result.source_adset.prior_status ?? '—',
            hasNote: result.source_adset.note ? 'yes' : 'no',
            note: result.source_adset.note ?? '',
          })
        : `${result.source_adset.name ?? result.source_adset.id} · ${result.source_adset.paused ? `paused (was ${result.source_adset.prior_status ?? '?'})` : `still ${result.source_adset.status_after ?? result.source_adset.prior_status ?? 'as it was'}`}${result.source_adset.note ? ` · ${result.source_adset.note}` : ''}`,
    });
  }
  if (result.activation) {
    rows.push({
      label: uiTranslate ? uiTranslate('audienceActivation') : 'Activation',
      value: uiTranslate
        ? uiTranslate('audienceImplementedActivation', {
            state: result.activation.requested ? 'requested' : 'paused',
            adset: result.activation.adset_status_after ?? '?',
            ads: result.activation.ads_status_after.join(', ') || '—',
          })
        : result.activation.requested
          ? `requested · ad set ${result.activation.adset_status_after ?? '?'} · ads ${result.activation.ads_status_after.join(', ') || '—'}`
          : 'not requested (created paused)',
    });
  }
  if (plan)
    rows.push({
      label: uiTranslate ? uiTranslate('mode_5e23ec6') : 'Mode',
      value: uiTranslate
        ? uiTranslate('audienceLaunchMode', { mode: plan.mode })
        : plan.mode === 'replace'
          ? 'Replaces the current audience'
          : 'Adds a new audience',
    });
  return rows;
}

export function audienceProposalStateLabel(
  state: AudienceProposalCardState | 'closed',
  t: ScaleCopy,
): string {
  return t('audienceStateLabel', { state });
}
export function audienceBlockReason(
  block: AudienceProposalBlock | null,
  t: ScaleCopy,
): string | null {
  return block ? t('audienceBlockReason', { code: block.code }) : null;
}
