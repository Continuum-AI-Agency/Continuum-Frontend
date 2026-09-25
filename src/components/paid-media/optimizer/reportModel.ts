// Narrows the LOOSE CycleRunReport (DB jsonb read model) into the typed rows the
// OptimizerTab renders. The report envelope stays loose per the "wire DTOs stay
// loose" contracts rule; this parses each row ONCE with the contracts row schemas
// instead of probing fields ad hoc. Every schema is `.loose()`, so unknown DB
// columns pass through untouched.

import {
  type AutopilotScopes,
  buildCreativeRequestBrief,
  type ConfidenceActionable,
  type CreativeRequestBrief,
  type CreativeVariationSeedInput,
  type CycleItemRow,
  type CycleRunReport,
  type ParsedCycleRunReport,
  ParsedCycleRunReportSchema,
  type PortfolioListItem,
  type RunConfidence,
} from '@continuum/contracts';
import type { z } from 'zod';

/** What the Performance tab should say about a portfolio with no cycle on screen.
 *
 *  This used to be one expression — `!latestRun && run.data?.status !== 'skipped'` — and it
 *  conflated four different situations into one spinner. A null report is what the FE sees
 *  when the read FAILED, when it TIMED OUT (8s x retry: 1), when the payload failed its
 *  schema, and when the portfolio genuinely has not scored yet. Only the last one is a wait.
 *  ALEIRA / FORMULARIOS sat on "Scoring your first cycle…" with five days of persisted runs
 *  behind it because the read never landed and nothing distinguished that from a new
 *  portfolio.
 *
 *  'stalled' exists because the poll is finite: it stops at two minutes, after which an
 *  animated spinner claims work that nothing is doing. */
export type FirstCycleState = 'error' | 'waiting' | 'stalled' | 'none';

export function firstCycleState(input: {
  /** The performance read resolved successfully — the ONLY case where a null report is
   *  evidence about the portfolio rather than about the request. */
  isSuccess: boolean;
  isError: boolean;
  hasRun: boolean;
  /** The Run-now outcome, when one has come back. A SKIPPED cycle ends the wait: nothing
   *  is enrolled, so no cycle can ever arrive to end it otherwise. */
  runStatus?: string;
  /** The 120s poll window has lapsed. */
  pollExpired: boolean;
}): FirstCycleState {
  if (input.isError) return 'error';
  if (!input.isSuccess) return 'none';
  if (input.hasRun) return 'none';
  if (input.runStatus === 'skipped') return 'none';
  return input.pollExpired ? 'stalled' : 'waiting';
}

/** A parsed report, plus how many rows failed their schema and were left out. */
export type ParsedReport = ParsedCycleRunReport & { droppedRows: number };

/** Narrow the loose report ROW BY ROW.
 *
 *  It used to be one safeParse over the whole report, with an all-empty fallback. That made
 *  one bad row cost everything: when the engine started writing `ci.hi: null` for
 *  zero-conversion ad sets, a single such item emptied latest_items, nulled latest_run and
 *  dropped the stored brief — and the page rendered portfolios with a ready brief and pending
 *  recommendations as "Scoring your first cycle" / "Nothing worth changing today".
 *
 *  Now a row that fails is left out ALONE, counted in `droppedRows`, and logged with its path
 *  and the portfolio, so the drift is loud without being a blank page. */
export function parseReport(report: CycleRunReport | null | undefined): ParsedReport | null {
  if (!report) return null;
  const whole = ParsedCycleRunReportSchema.safeParse(report);
  if (whole.success) return { ...whole.data, droppedRows: 0 };

  const shape = ParsedCycleRunReportSchema.shape;
  const portfolioRef = portfolioLabel(report.portfolio);
  let droppedRows = 0;
  const drop = (path: string, issues: unknown): void => {
    droppedRows += 1;
    console.warn('optimizer report: dropped a row that failed its schema', {
      portfolio: portfolioRef,
      path,
      issues,
    });
  };
  function one<T>(path: string, raw: unknown, schema: z.ZodType<T>): T | null {
    const parsed = schema.safeParse(raw ?? null);
    if (parsed.success) return parsed.data;
    drop(path, parsed.error.issues);
    return null;
  }
  function many<T>(path: string, raw: unknown, schema: z.ZodType<T>): T[] {
    if (!Array.isArray(raw)) {
      if (raw != null) drop(path, 'not an array');
      return [];
    }
    const kept: T[] = [];
    raw.forEach((row: unknown, index) => {
      const parsed = schema.safeParse(row);
      if (parsed.success) kept.push(parsed.data);
      else drop(`${path}[${index}]`, parsed.error.issues);
    });
    return kept;
  }

  return {
    portfolio: one('portfolio', report.portfolio, shape.portfolio),
    latest_run: one('latest_run', report.latest_run, shape.latest_run),
    latest_items: many('latest_items', report.latest_items, shape.latest_items.element),
    recommendations: many('recommendations', report.recommendations, shape.recommendations.element),
    history: many('history', report.history, shape.history.element),
    hero_brief: one('hero_brief', report.hero_brief, shape.hero_brief),
    droppedRows,
  };
}

// ── The engine's cost interval, read honestly ────────────────────────────────
// costInterval (packages/optimization-engine/src/significance.ts) returns
// { cpa: 0, lo: 0, hi: null, events: 0 } for an ad set with no conversions in the window:
// spend ÷ 0 has no upper bound, and the 0s beside it are placeholders, not a measured cost.
// Every surface that reads `diagnostics.ci` goes through these two, so none of them prints
// that row as "$0.00" or draws a bar to nowhere.

type LooseCostInterval =
  | { cpa?: number | null; lo?: number | null; hi?: number | null; events?: number | null }
  | null
  | undefined;

/** The interval's point estimate, or null when it measured nothing (zero events). */
export function measuredCpa(ci: LooseCostInterval): number | null {
  if (!ci || typeof ci.cpa !== 'number' || !Number.isFinite(ci.cpa)) return null;
  if (ci.events === 0 || ci.hi === null) return null;
  return ci.cpa;
}

/** What to print where the upper bound would go, or null when there is one. The wording
 *  carries the same reason as the engine's upperBoundMissingBecause. */
export function upperBoundNote(ci: LooseCostInterval): string | null {
  if (!ci || ci.hi !== null) return null;
  const events = typeof ci.events === 'number' && ci.events > 0 ? ci.events : 0;
  return `no upper bound yet (${events} conversion${events === 1 ? '' : 's'})`;
}

function portfolioLabel(portfolio: Record<string, unknown> | null | undefined): string | null {
  if (!portfolio) return null;
  const id = typeof portfolio.id === 'string' ? portfolio.id : null;
  const name = typeof portfolio.name === 'string' ? portfolio.name : null;
  return [name, id].filter(Boolean).join(' · ') || null;
}

// ── Conversion volume: the one confidence read that survives ──────────────────
// The portfolio-wide "confidence score" is gone from the surface. What stays is the term
// the account controls and can read at a glance: how many conversions the portfolio is
// tracking, and how many ad sets sit under the floor the engine needs to score them. The
// engine still computes its full Confidence; this reads only the volume half.

export type ConversionVolume = {
  /** KPI events in the trailing 14 days, summed over ad sets. */
  events: number;
  /** Events an ad set needs before its score is read as measured rather than guessed. */
  floorEvents: number;
  /** Ad sets under that floor. */
  underFloorIds: string[];
  band: 'thin' | 'building' | 'strong';
  /** One line for the badge's hover / the panel's headline. */
  note: string;
  /** The engine's own suggestions about the floor and tracking, when it wrote them. */
  actionables: ConfidenceActionable[];
};

const asPct = (value: number | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) : null;

export function conversionVolume(
  confidence: RunConfidence | null | undefined,
): ConversionVolume | null {
  if (!confidence) return null;
  const events =
    typeof confidence.events === 'number' && Number.isFinite(confidence.events)
      ? Math.round(confidence.events)
      : null;
  if (events == null) return null;
  const floorEvents = confidence.underFloor?.floorEvents ?? 20;
  const underFloorIds = confidence.underFloor?.adsetIds ?? [];
  const sample = asPct(confidence.sampleSize);
  // Sample is the spend-weighted events/(events+floor) across ad sets: 80%+ means the money
  // sits on ad sets that clear the floor comfortably; under 50% most of it does not.
  const band: ConversionVolume['band'] =
    sample != null && sample >= 80
      ? 'strong'
      : sample != null && sample >= 50
        ? 'building'
        : 'thin';
  const under = underFloorIds.length;
  const note =
    under > 0
      ? `${events} conversion${events === 1 ? '' : 's'} in 14 days · ${under} ad set${under === 1 ? '' : 's'} under the ${floorEvents}-event floor`
      : `${events} conversion${events === 1 ? '' : 's'} in 14 days · every ad set clears the ${floorEvents}-event floor`;
  const actionables = (confidence.actionables ?? []).filter(
    (action) => action.code === 'under_event_floor' || action.code === 'tracking_gap',
  );
  return { events, floorEvents, underFloorIds, band, note, actionables };
}

// ── Why one budget move happened ─────────────────────────────────────────────
// It is NOT computed here any more. The engine composes the sentence at cycle time
// (packages/optimization-engine/src/explain.ts — moveReasonText) and persists it to
// optimizer.cycle_items.reason, which the apply then copies into
// optimizer.apply_audits.justification. So the "why" a human reads in the Actions queue is
// byte-for-byte the "why" recorded in the money ledger.
//
// The local budgetMoveWhy that used to live here computed a second, parallel explanation
// from the same diagnostics. Two implementations of one sentence is a drift waiting to
// happen — and the one in the audit trail is the one that has to be true. Render
// `item.reason`; when it is absent (a row scored before the engine persisted it) say
// nothing rather than manufacture a reason the ledger does not carry.

// ── What counts as work waiting on a human ───────────────────────────────────
// ONE definition, because the proxy drifted once already. The Actions queue used
// `pending_recommendations > 0`, but a budget move is a cycle_items row and never
// produces a recommendation — so a portfolio whose cycle wanted to move money but
// fired no trigger was filtered out of the queue and its moves were unreachable.
// The tab badge and the prefetch warmer read the same proxy, so all three have to
// agree; they now all call this.
//
// Deliberately derived from the LIST row, never from the performance report: queue
// visibility must not depend on a per-portfolio edge read having succeeded.

export function pendingWorkCount(portfolio: {
  pending_recommendations: number;
  pending_budget_moves?: number;
}): number {
  return portfolio.pending_recommendations + (portfolio.pending_budget_moves ?? 0);
}

export function hasPendingWork(portfolio: {
  pending_recommendations: number;
  pending_budget_moves?: number;
}): boolean {
  return pendingWorkCount(portfolio) > 0;
}

/** Confidence band → badge variant + label, tolerant of loose DB strings. */
export function confidenceBand(band: string | null | undefined): {
  variant: 'success' | 'secondary' | 'destructive';
  label: string;
} {
  const normalized = (band ?? '').toLowerCase();
  if (normalized === 'high') return { variant: 'success', label: 'High' };
  if (normalized === 'low') return { variant: 'destructive', label: 'Low' };
  return { variant: 'secondary', label: 'Medium' };
}

/** A cycle item's freeze reason → a labeled "Held" state. Returns null when the
 *  item was NOT held (budget was actually reallocated). Rendering this instead of
 *  a $0.00 change is the point: a held ad set was left unchanged ON PURPOSE, not
 *  scored to no-change. Tolerant of loose DB strings. */
export function freezeLabel(
  reason: string | null | undefined,
): { label: string; hint: string } | null {
  switch (reason) {
    case 'no_conversions':
      return {
        label: 'Held · no conversion signal',
        hint: 'Spending but no tracked conversions yet — budget left unchanged until signal arrives.',
      };
    case 'missing_window':
      return {
        label: 'Held · incomplete data',
        hint: 'Not enough trailing-window history to score reliably — held this cycle.',
      };
    case 'unsupported_budget':
      return {
        label: 'Held · CBO/lifetime',
        hint: 'Budget is managed at the campaign level (CBO or lifetime) — the optimizer does not touch it. Convert the campaign to ad-set budgets to optimize its ad sets.',
      };
    case 'lifetime_budget':
      return {
        label: 'Held · lifetime budget',
        hint: 'This campaign has a whole-flight lifetime budget, not a daily one. The optimizer paces and scores in daily terms, so it will not resize a flight it cannot reason about.',
      };
    case 'no_own_budget':
      return {
        label: 'Held · no budget of its own',
        hint: 'This ad set has no ad-set budget for the optimizer to move — boosted posts and promoted posts usually look like this. It is left alone rather than handed a share of the pool it never had. Give it an ad-set daily budget in Meta if you want the optimizer to manage it.',
      };
    case 'no_declared_objective':
      return {
        label: 'Held · no declared goal',
        hint: 'This ad set does not tell Meta what result it is buying, and it has produced none of the results this portfolio measures. Scoring it would rank it on events it never claimed to buy, so it is held instead. Set an optimization goal on the ad set in Meta.',
      };
    case 'kpi_mismatch':
      return {
        label: 'Held · different goal',
        hint: 'This ad set is bidding for a different result than the portfolio prices (for example messaging conversations in a portfolio measured on leads). Ranking them together would compare a cheap event against an expensive one and hand the budget to whichever is cheaper, so it is held instead. Move it to a portfolio that measures what it actually buys.',
      };
    default:
      if (reason) return { label: 'Held', hint: 'Budget left unchanged on purpose this cycle.' };
      return null;
  }
}

/** Split a cycle's items into the two guardrail states a human must act on.
 *
 *  'held'            — autopilot scored the change, but it exceeds max_change_pct_per_cycle,
 *                      so it was NOT written. Distinct from an engine freeze (freezeLabel),
 *                      where the item was never scored at all.
 *  'approved_pending'— a human approved it; the service's /apply/approved will execute it.
 *
 *  Everything else (applied / failed / skipped / null) needs no approval affordance. */
export function partitionHeldItems<T extends { apply_status?: string | null }>(
  items: T[],
): { held: T[]; approved: T[] } {
  return {
    held: items.filter((item) => item.apply_status === 'held'),
    approved: items.filter((item) => item.apply_status === 'approved_pending'),
  };
}

/** Delivery state → the chip shown beside an ad set's name, or null when there is nothing
 *  worth saying.
 *
 *  `serving` renders NOTHING — a chip on every healthy row is noise, and the absence of a
 *  chip is the readable default. Unknown renders nothing either, for the opposite reason:
 *  we did not read delivery this cycle, and a green "delivering" chip would be a claim we
 *  cannot support. Only the two states that change what the row's numbers MEAN get a chip. */
export function deliveryLabel(
  state: string | null | undefined,
): { label: string; hint: string; tone: 'error' | 'warning' } | null {
  switch (state) {
    case 'dark':
      return {
        label: 'Not delivering',
        hint: 'Meta shows this ad set as live, and it has served nothing for days. Every cost and rate on this row is computed from the days before it stopped — treat them as history, not as current performance.',
        tone: 'error',
      };
    case 'throttled':
      return {
        label: 'Delivery falling',
        hint: 'Impressions are down by more than half against the previous week at the same budget. Efficiency figures here are drawn from a much smaller sample than they were.',
        tone: 'warning',
      };
    default:
      return null;
  }
}

/** Recommendation kind → a short human label + glyph for the actions queue. */
export function recommendationLabel(kind: string): { label: string; glyph: string } {
  switch (kind) {
    case 'pause':
      // The app pauses the ad set on Meta through the audited adset-status drain, so the
      // label names the write the operator is authorizing — not a manual chore.
      return { label: 'Pause ad set', glyph: '⏸' };
    case 'creative_refresh':
      return { label: 'Refresh creative', glyph: '🎨' };
    case 'audience_expand':
      return { label: 'Expand audience', glyph: '👥' };
    // --- Creative-level kinds. These name ONE AD inside the ad set, not the ad set. ---
    case 'settings':
      return { label: 'Change a setting', glyph: '⚙' };
    case 'pause_ad':
      return { label: 'Pause this ad', glyph: '⏸' };
    case 'variate_creative':
      return { label: 'Make variations of the winner', glyph: '✦' };
    case 'seed_experiment':
      return { label: 'Nothing to learn from — add variants', glyph: '⚗' };
    // --- Delivery. Not a performance finding: nothing is being SERVED, and the answer is
    // never a creative. The queue used to answer this state with "refresh creative", or
    // with silence.
    case 'restore_delivery':
      return { label: 'Not being delivered', glyph: '📡' };
    default:
      return { label: kind.replace(/_/g, ' '), glyph: '•' };
  }
}

/** The creative-level kinds: they are about ONE AD inside the ad set, and the row must show
 *  WHICH. An ad set with five creatives otherwise gives you five suspects and no defendant. */
export const CREATIVE_RECOMMENDATION_KINDS = new Set([
  'pause_ad',
  'variate_creative',
  'seed_experiment',
]);

/** Kinds the optimizer generates but CANNOT yet execute or track.
 *
 *  `pause_ad` is the last one here: pausing ONE ad (not the whole ad set) has no drain yet,
 *  so approving it would set a status, do nothing, and leave a burning ad running while the
 *  queue looked handled — worse than not offering the button.
 *
 *  `variate_creative` and `seed_experiment` graduated: approving one now opens a creative
 *  request (a tracked task, or a generation job when autogen is on), so they route to
 *  'creative' rather than 'hidden'. Delete an entry here in the PR that makes it executable —
 *  not before. */
export const NOT_YET_EXECUTABLE_KINDS = new Set(['pause_ad']);

/** Creative kinds whose approval opens a creative request (task or generation job). These
 *  carry the generation seed the brief is rendered from. */
export const CREATIVE_REQUEST_KINDS = new Set(['variate_creative', 'seed_experiment']);

export function isExecutable(kind: string): boolean {
  return !NOT_YET_EXECUTABLE_KINDS.has(kind);
}

/** Which write path a recommendation kind drains into once approved. Budget moves do NOT
 *  come from recommendations (they are cycle_items), so this covers rec kinds only:
 *    - 'pause'                             → the audited ad-set status drain (real Meta pause)
 *    - 'variate_creative'/'seed_experiment'→ a creative request (task, or a generation job)
 *    - 'creative_refresh' / expand …       → a tracked renewal task (no auto Meta write)
 *    - 'pause_ad'                          → hidden (found, but no single-ad drain yet)
 *  Unknown kinds route to the renewal path — the conservative default that never writes. */
export function actionRoute(
  kind: string,
): 'budget' | 'pause' | 'creative' | 'fatigue' | 'settings' | 'hidden' {
  if (NOT_YET_EXECUTABLE_KINDS.has(kind)) return 'hidden';
  if (kind === 'settings') return 'settings';
  if (kind === 'pause') return 'pause';
  if (CREATIVE_REQUEST_KINDS.has(kind)) return 'creative';
  return 'fatigue';
}

/** The action copy for a recommendation row. A `pause` now EXECUTES: approving it drains
 *  into the audited ad-set status writer that pauses the ad set on Meta, so the primary
 *  button names that write. Fatigue kinds (creative_refresh / audience_expand) open a
 *  tracked renewal task, so "Approve" is honest there. */
export function recommendationActionCopy(kind: string): {
  approveLabel: string;
  advisory: string | null;
} {
  if (kind === 'pause') {
    return { approveLabel: 'Pause ad set', advisory: null };
  }
  if (kind === 'settings') {
    return { approveLabel: 'Apply setting', advisory: null };
  }
  // Generated and stored, not yet actionable. The button says so rather than
  // pretending. One phrasing for this state across the surface — "not built yet",
  // matching notImplementedMessage below. "Not wired up" is our word for our
  // backlog, and it read as a configuration fault the user was expected to fix.
  if (kind === 'pause_ad') {
    return {
      approveLabel: 'Pause ad',
      advisory:
        'Not built yet — the optimizer can find this ad but cannot pause it for you. Pause it in Meta and it stops draining the ad set.',
    };
  }
  if (kind === 'variate_creative' || kind === 'seed_experiment') {
    return {
      approveLabel: 'Request creative',
      advisory:
        'Approving opens a creative request with the brief below — a task your team fills, or a generation job when this portfolio has autogen on.',
    };
  }
  // Deliberately NOT an automatic un-pause. An ad set is usually off Meta because somebody
  // turned it off, and quietly turning it back on is the one autonomy nobody asked for.
  // Approving tracks the task; the reason says which fix it needs.
  if (kind === 'restore_delivery') {
    return {
      approveLabel: 'Track this',
      advisory:
        'The optimizer will not resume an ad set for you — it is usually off because somebody turned it off. Approving keeps it on the list until delivery comes back.',
    };
  }
  return { approveLabel: 'Approve', advisory: null };
}

/** Render the creative brief for a recommendation from its generation seed. Deterministic
 *  and offline — the same builder the request email and the swap worker use, so the brief a
 *  person reads here is the brief the maker gets. Returns null when the rec carries no usable
 *  seed (older rows), so the caller falls back to the plain reason. */
export function creativeBriefForRec(rec: {
  kind: string;
  reason?: string | null;
  seed?: Record<string, unknown> | null;
}): CreativeRequestBrief | null {
  const seed = rec.seed;
  if (!seed || typeof seed.adSetId !== 'string') return null;
  try {
    return buildCreativeRequestBrief(
      seed as unknown as CreativeVariationSeedInput,
      rec.kind,
      rec.reason ?? undefined,
    );
  } catch {
    return null;
  }
}

/** The reason a not-yet-executable action is refused, shown to the user verbatim. */
export function notImplementedMessage(kind: string): string {
  switch (kind) {
    case 'pause_ad':
      return 'Pausing an ad from here is not built yet. The finding is real — pause it in Meta and it will stop draining the ad set.';
    case 'variate_creative':
      return 'Generating variations from here is not built yet. Copy the brief and take it into AI Studio.';
    case 'seed_experiment':
      return 'Seeding an experiment from here is not built yet. Add a second creative to this ad set and the optimizer can start telling you which one works.';
    default:
      return 'This action is not built yet.';
  }
}

/** Recommendation severity → the underline decoration color for the insight anchor.
 *  Tolerant of loose DB strings; a subtle cue, not the primary signal. */
export function severityTone(severity: string | null | undefined): string {
  switch ((severity ?? '').toLowerCase()) {
    case 'high':
      return 'decoration-destructive/60';
    case 'low':
      return 'decoration-muted-foreground/40';
    default:
      return 'decoration-muted-foreground/60';
  }
}

/** Ordinal for sorting the approval queue most-urgent-first (unknown sorts last). */
export function severityRank(severity: string | null | undefined): number {
  switch ((severity ?? '').toLowerCase()) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

/** Recommendation severity → a Badge variant so the queue shows urgency at a glance. */
export function severityBadgeVariant(
  severity: string | null | undefined,
): 'destructive' | 'warning' | 'muted' {
  switch ((severity ?? '').toLowerCase()) {
    case 'high':
      return 'destructive';
    case 'medium':
      return 'warning';
    default:
      return 'muted';
  }
}

/** One-line legend making the observe↔recommend↔autopilot boundary explicit at the
 *  point a user reads a proposed reallocation. */
const SCOPE_WORDS: Record<keyof AutopilotScopes, string> = {
  budget: 'budget moves',
  creative_swap: 'creative rotation',
  audience_change: 'audience replacements',
  new_audience: 'new audiences',
  new_creatives: 'flash creatives',
};

/** "budget moves, creative rotation" — the ON scopes, in the panel's order. */
export function autopilotScopeWords(scopes: AutopilotScopes | null | undefined): string {
  const on = (Object.keys(SCOPE_WORDS) as (keyof AutopilotScopes)[]).filter((k) => scopes?.[k]);
  return on.length > 0 ? on.map((k) => SCOPE_WORDS[k]).join(', ') : 'nothing yet';
}

export function applyModeExplainer(
  applyMode: string | null | undefined,
  scopes?: AutopilotScopes | null,
): string {
  // Written for a media buyer, not for us. "Soak tier" and "human-in-the-loop"
  // are our words for our rollout; what the reader needs is whether their money
  // can move, and what they do about it.
  const mode = (applyMode ?? '').toLowerCase();
  if (mode === 'observe') {
    return 'Observe — the optimizer scores every night but never changes a budget. Switch to Recommend to start approving its moves.';
  }
  if (mode === 'autopilot') {
    return scopes
      ? `Autopilot — approves ${autopilotScopeWords(scopes)} on its own; budget moves stay within your guardrails and anything created is born paused. Stop halts all of it without leaving this mode.`
      : 'Autopilot — budgets change automatically, within your guardrails. Stop halts every write without leaving this mode.';
  }
  if (mode === 'recommend') {
    return 'Recommend — the optimizer proposes moves and nothing changes until you approve them.';
  }
  return 'Unknown apply mode.';
}

/** Dense pill metadata for the portfolio apply-mode identifier (ApplyModePill).
 *  Bottom→top tiers get distinct tones so autonomy is scannable next to mode/level chips. */
export function applyModePill(applyMode: string | null | undefined): {
  label: string;
  variant: 'muted' | 'violet' | 'success';
  indicator: 'info' | 'success' | 'warning';
} | null {
  switch ((applyMode ?? '').toLowerCase()) {
    case 'observe':
      return { label: 'Observe', variant: 'muted', indicator: 'info' };
    case 'recommend':
      return { label: 'Recommend', variant: 'violet', indicator: 'info' };
    case 'autopilot':
      return { label: 'Autopilot', variant: 'success', indicator: 'success' };
    default:
      return null;
  }
}
