// Suggestions a person asks for, inside one portfolio, in one of the three categories the
// product already has: audiences, budget movement, creative iteration.
//
// WHY A TABLE OF ITS OWN. The two existing request RPCs both start from a recommendation
// that already exists (`optimizer_request_audience_proposal(p_rec_id)`,
// `optimizer_request_flash_creatives(p_rec_id, …)`), and `optimizer.recommendations.run_id`
// is NOT NULL against `optimizer.cycle_runs`, which is uniquely keyed `(portfolio_id,
// utc_day)` with `optimizer_record_cycle` ending in `on conflict do nothing`. A second
// same-day scoring is deliberately a no-op, so an on-demand suggestion cannot be a
// recommendation or a cycle item without fighting that key. `/cycle/preview` is the only
// rec-free generator and it is non-persistent by contract.
//
// ONE INBOX, NOT A FOURTH ONE. A ready suggestion is a `QueueRow` like any other: the
// portfolio's Activity queue builds it beside the budget moves and the recommendations,
// ranked by the same money-per-day key. And when the suggestion's conclusion is work the
// cycle ALREADY scored, its `cta` points at that row (`briefCtaSchema`, the same vocabulary
// the daily brief uses to land someone on a queue row) instead of minting a duplicate.
//
// NOTHING IS BORN SWITCHED ON. Adopting a suggestion writes nothing to Meta. It is a
// decision stamp, gated by a single-use token bound to the exact plan that was on screen;
// the Meta write for each category stays the existing approved path (the audience
// proposal's execute phase, the creative swap's publish, the budget apply), every one of
// which goes through `metaScaffoldGateway` — `createAd` always sends `status: 'PAUSED'` and
// `assertPaused` reads the object back. No second write path is added here.

import { z } from 'zod';
import { briefCtaSchema } from './portfolio-brief';

export const adhocSuggestionCategorySchema = z.enum(['audience', 'budget', 'creative']);
export type AdhocSuggestionCategory = z.infer<typeof adhocSuggestionCategorySchema>;

export const ADHOC_SUGGESTION_CATEGORIES: readonly AdhocSuggestionCategory[] = [
  'audience',
  'budget',
  'creative',
];

/** What each category is called on screen, and the one line that says what asking buys. */
export const ADHOC_SUGGESTION_CATEGORY_COPY: Record<
  AdhocSuggestionCategory,
  { label: string; blurb: string }
> = {
  audience: {
    label: 'Audiences',
    blurb: 'Who else this portfolio could be reaching, and what it would cost to find out.',
  },
  budget: {
    label: 'Budget movement',
    blurb: 'Where the money would do more, read off the same windows the cycle scores.',
  },
  creative: {
    label: 'Creative iteration',
    blurb: 'Which ad has stopped earning its spend, and what to put beside it.',
  },
};

export const adhocSuggestionStatusSchema = z.enum([
  'queued',
  'proposing',
  /** A plan is on the table. */
  'ready',
  /** Ran, looked, and had nothing worth saying. Not a failure — the honest empty. */
  'empty',
  'failed',
  'adopted',
  'dismissed',
  'superseded',
]);
export type AdhocSuggestionStatus = z.infer<typeof adhocSuggestionStatusSchema>;

/** Statuses during which the row still owns its (portfolio, category) ask — a second
 *  request must join one of these rather than open a rival. */
export const ADHOC_SUGGESTION_LIVE_STATUSES: readonly AdhocSuggestionStatus[] = [
  'queued',
  'proposing',
];

/** Statuses a person is still looking at, so the queue keeps the row. */
export const ADHOC_SUGGESTION_OPEN_STATUSES: readonly AdhocSuggestionStatus[] = [
  'queued',
  'proposing',
  'ready',
];

/** One figure the plan is allowed to lean on, carried so the card can print it without the
 *  renderer re-deriving anything. `unit` decides the formatter; money is MAJOR units, the
 *  way every optimizer read surface already carries it. */
export const adhocSuggestionFigureSchema = z.object({
  label: z.string().min(1).max(60),
  value: z.number(),
  unit: z.enum(['currency', 'percent', 'number', 'multiple', 'days']),
});
export type AdhocSuggestionFigure = z.infer<typeof adhocSuggestionFigureSchema>;

/** The single-use grant that lets a person adopt the plan they were actually shown. Minted
 *  when the worker completes the row, burned by `optimizer_adopt_adhoc_suggestion`. A
 *  recomposed suggestion mints a new one, so an adopt against a stale card is refused. */
export const adhocSuggestionAdoptGrantSchema = z.object({
  token: z.string().min(16),
  expires_at: z.string(),
});
export type AdhocSuggestionAdoptGrant = z.infer<typeof adhocSuggestionAdoptGrantSchema>;

export const adhocSuggestionPlanSchema = z.object({
  version: z.literal(1),
  category: adhocSuggestionCategorySchema,
  /** The suggestion in one line. Same 90-char budget as the brief's hero. */
  headline: z.string().min(1).max(90),
  /** Why, in the portfolio's own figures. Same 240-char budget as the brief's `why`. */
  why: z.string().max(240),
  adset_id: z.string().nullable().default(null),
  adset_name: z.string().nullable().default(null),
  /** Money per day, so the card sorts against budget moves and recommendations on one
   *  scale. Null when the category genuinely has no money figure behind it — an audience
   *  idea with no spend attached is worth saying and worth NOT pricing. */
  impact_per_day: z.number().nonnegative().nullable().default(null),
  impact_unit: z.literal('currency').default('currency'),
  /** The formula, code-authored, never the model's: "spend/day on an ad set with 0
   *  conversions in 7d". */
  impact_basis: z.string().max(200).nullable().default(null),
  /** How sure, and why not surer. */
  confidence_note: z.string().max(120).nullable().default(null),
  /** What doing it looks like. At most four, because a fifth step means the suggestion is
   *  really two suggestions. */
  steps: z.array(z.string().min(1).max(160)).max(4).default([]),
  figures: z.array(adhocSuggestionFigureSchema).max(6).default([]),
  /** Where the decision is actually taken. `queue_row` when the cycle already scored this
   *  exact work — the card hands off rather than duplicating it. */
  cta: briefCtaSchema.nullable().default(null),
  adopt: adhocSuggestionAdoptGrantSchema.nullable().default(null),
});
export type AdhocSuggestionPlan = z.infer<typeof adhocSuggestionPlanSchema>;

export const adhocSuggestionRowSchema = z
  .object({
    id: z.string().uuid(),
    portfolio_id: z.string().uuid(),
    brand_id: z.string().uuid(),
    ad_account_id: z.string(),
    category: adhocSuggestionCategorySchema,
    utc_day: z.string(),
    status: adhocSuggestionStatusSchema,
    requested_at: z.string(),
    requested_by: z.string().uuid().nullable().default(null),
    attempts: z.number().int().nonnegative().default(0),
    suggestion: z.record(z.string(), z.unknown()).nullable().default(null),
    model: z.string().nullable().default(null),
    prompt_version: z.string().nullable().default(null),
    ready_at: z.string().nullable().default(null),
    adopted_at: z.string().nullable().default(null),
    dismissed_at: z.string().nullable().default(null),
    error: z.record(z.string(), z.unknown()).nullable().default(null),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .loose();
export type AdhocSuggestionRow = z.infer<typeof adhocSuggestionRowSchema>;

/** Why the server would refuse the next ask, in the words the button prints. */
export const adhocSuggestionGateReasonSchema = z.enum([
  'already_running',
  'too_soon',
  'daily_limit',
  'portfolio_inactive',
]);
export type AdhocSuggestionGateReason = z.infer<typeof adhocSuggestionGateReasonSchema>;

/**
 * Whether this category may be asked again, and if not, why not.
 *
 * The screen reads `can_request` off this rather than guessing, so the control never offers
 * an ask the server then refuses — the same discipline `optimizer_get_account_read`'s
 * `refresh` block landed for the account read. Computed by one SQL helper, so the screen and
 * the RPC cannot disagree about the floor.
 */
export const adhocSuggestionGateSchema = z.object({
  category: adhocSuggestionCategorySchema,
  /** 'none' before the first ask of the day; otherwise the live row's status. */
  state: z.union([adhocSuggestionStatusSchema, z.literal('none')]),
  requests_used: z.number().int().nonnegative(),
  requests_left: z.number().int().nonnegative(),
  can_request: z.boolean(),
  retry_after: z.string().nullable().default(null),
  reason: adhocSuggestionGateReasonSchema.nullable().default(null),
});
export type AdhocSuggestionGate = z.infer<typeof adhocSuggestionGateSchema>;

export const adhocSuggestionsEnvelopeSchema = z.object({
  portfolio_id: z.string().uuid(),
  rows: z.array(adhocSuggestionRowSchema).default([]),
  gates: z.array(adhocSuggestionGateSchema).default([]),
});
export type AdhocSuggestionsEnvelope = z.infer<typeof adhocSuggestionsEnvelopeSchema>;

export const adhocSuggestionAdoptResultSchema = z.object({
  ok: z.boolean(),
  status: adhocSuggestionStatusSchema.nullable().default(null),
  /** Where to take the person next — the plan's own `cta`, echoed so the caller need not
   *  re-read the row to know. */
  cta: briefCtaSchema.nullable().default(null),
  reason: z
    .enum(['not_ready', 'token_expired', 'token_mismatch', 'already_decided'])
    .nullable()
    .default(null),
});
export type AdhocSuggestionAdoptResult = z.infer<typeof adhocSuggestionAdoptResultSchema>;

/** The plan behind a row, or null when the row has none yet or holds something the schema
 *  does not recognise. Never throws: a stored plan is DB-derived data, and a card that
 *  cannot be parsed must read as "no plan", not as a crashed page. */
export function readAdhocSuggestion(
  row: Pick<AdhocSuggestionRow, 'suggestion'> | null | undefined,
): AdhocSuggestionPlan | null {
  if (!row?.suggestion) return null;
  const parsed = adhocSuggestionPlanSchema.safeParse(row.suggestion);
  return parsed.success ? parsed.data : null;
}

/** The gate for one category, or a permissive default when the envelope predates it. A
 *  missing gate must not silently disable the control — the server refuses cheaply and
 *  says why, which is a better failure than a button that is dead for no stated reason. */
export function adhocSuggestionGateFor(
  gates: readonly AdhocSuggestionGate[],
  category: AdhocSuggestionCategory,
): AdhocSuggestionGate {
  const found = gates.find((gate) => gate.category === category);
  if (found) return found;
  return {
    category,
    state: 'none',
    requests_used: 0,
    requests_left: ADHOC_SUGGESTION_DAILY_CAP,
    can_request: true,
    retry_after: null,
    reason: null,
  };
}

/**
 * THE FLOOR, stated once so the Frontend copy and the SQL cannot drift.
 *
 * A suggestion costs one constrained model call over a packet built from persisted rows, so
 * asking is not free. Two limits, and the reasoning for each:
 *
 *   * a 90-second cooldown since the row last settled — the impatient case. The worker
 *     polls every 5s, so a suggestion lands in seconds, not minutes; the account read's
 *     30-minute cooldown would be wrong here because a person legitimately reads a card,
 *     acts, and asks the next category straight away. 90s is long enough that a double-tap
 *     and three open tabs collapse into one ask, short enough that nobody who actually read
 *     the answer is ever held.
 *   * four asks per (portfolio, category, UTC day) — the determined case. Three categories
 *     bound a portfolio at TWELVE model calls a day on top of its nightly brief, whatever
 *     anyone does with the buttons. Four rather than three because, unlike a re-read of one
 *     frozen document, a second and third angle on a category is a real thing to want; the
 *     fourth is where asking again stops being reading and starts being rolling dice.
 *
 * Neither is an env var. AGENTS.md §6.7 reserves ENV for per-environment config, and a
 * number that changes what the product costs is a reviewed code change, not a toggle
 * somebody has to remember to flip.
 */
export const ADHOC_SUGGESTION_DAILY_CAP = 4;
export const ADHOC_SUGGESTION_COOLDOWN_SECONDS = 90;

/** What the control says when it cannot be pressed. Null when it can. */
export function adhocSuggestionGateNote(gate: AdhocSuggestionGate): string | null {
  if (gate.can_request) return null;
  switch (gate.reason) {
    case 'already_running':
      return 'Working on it…';
    case 'too_soon':
      return 'Just asked — a moment.';
    case 'daily_limit':
      return `That is ${ADHOC_SUGGESTION_DAILY_CAP} for today.`;
    case 'portfolio_inactive':
      return 'This portfolio is not running.';
    default:
      return 'Not right now.';
  }
}
