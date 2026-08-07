// Narrows the LOOSE CycleRunReport (DB jsonb read model) into the typed rows the
// OptimizerTab renders. The report envelope stays loose per the "wire DTOs stay
// loose" contracts rule; this parses each row ONCE with the contracts row schemas
// instead of probing fields ad hoc. Every schema is `.loose()`, so unknown DB
// columns pass through untouched.

import {
  buildCreativeRequestBrief,
  type CreativeRequestBrief,
  type CreativeVariationSeedInput,
  type CycleItemRow,
  type CycleRunReport,
  type ParsedCycleRunReport,
  ParsedCycleRunReportSchema,
  type RunConfidence,
} from '@continuum/contracts';

export function parseReport(
  report: CycleRunReport | null | undefined,
): ParsedCycleRunReport | null {
  if (!report) return null;
  const parsed = ParsedCycleRunReportSchema.safeParse(report);
  if (parsed.success) return parsed.data;
  // A single malformed row must not blank the whole surface: fall back to an
  // empty-but-valid shape so the tab still renders its portfolio header.
  return {
    portfolio: null,
    latest_run: null,
    latest_items: [],
    recommendations: [],
    history: [],
  };
}

// ── Why the confidence score is what it is ───────────────────────────────────
// score = predictiveness × sampleSize × consistency, so the SMALLEST term is the
// answer to "why isn't this higher" — naming it is the whole point of the hover.
//
// predictiveness is NOT measured from the account: it is a static per-objective
// constant in the engine config (cfg.predictiveness ?? 0.75). The copy says so,
// because a number presented as evidence when it is a prior is a lie of omission.

export type ConfidenceTerm = {
  key: 'sampleSize' | 'consistency' | 'predictiveness';
  label: string;
  pct: number;
  note: string;
};

export type ConfidenceExplanation = {
  /** Weakest term first — the limiter leads. */
  terms: ConfidenceTerm[];
  limiter: ConfidenceTerm | null;
  scorePct: number | null;
};

const asPct = (value: number | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) : null;

export function explainConfidence(
  confidence: RunConfidence | null | undefined,
): ConfidenceExplanation | null {
  if (!confidence) return null;

  const events = confidence.events;
  const eventLabel =
    typeof events === 'number' && Number.isFinite(events)
      ? `${Math.round(events)} conversion${Math.round(events) === 1 ? '' : 's'} in the last 14 days`
      : 'how many conversions the trailing window carries';

  const candidates: ConfidenceTerm[] = [];
  const sample = asPct(confidence.sampleSize);
  if (sample != null) {
    candidates.push({ key: 'sampleSize', label: 'Sample', pct: sample, note: eventLabel });
  }
  const consistency = asPct(confidence.consistency);
  if (consistency != null) {
    candidates.push({
      key: 'consistency',
      label: 'Consistency',
      pct: consistency,
      note:
        consistency >= 70
          ? 'the 3d, 7d and 14d scores agree'
          : 'the 3d, 7d and 14d scores disagree',
    });
  }
  const predictive = asPct(confidence.predictiveness);
  if (predictive != null) {
    candidates.push({
      key: 'predictiveness',
      label: 'Predictive',
      pct: predictive,
      note: 'a calibrated prior for this objective — not measured on your account',
    });
  }

  if (candidates.length === 0) return null;
  const terms = [...candidates].sort((a, b) => a.pct - b.pct);
  return { terms, limiter: terms[0] ?? null, scorePct: asPct(confidence.score) };
}

// ── Why one budget move happened ─────────────────────────────────────────────
// Assembled entirely from what cycle_items already persists, so it works on rows
// scored before this shipped. Numbers stay raw — the caller owns currency.

export type BudgetMoveWhy = {
  lead: string;
  windows: { d3: number | null; d7: number | null; d14: number | null } | null;
  windowsAgree: boolean | null;
  cost: { cpa: number; lo: number | null; hi: number | null; events: number | null } | null;
  capped: boolean;
};

const finite = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Null when the row is HELD — freezeLabel already explains those, and a held ad set
 *  was left unchanged on purpose rather than scored into a move. */
export function budgetMoveWhy(item: CycleItemRow): BudgetMoveWhy | null {
  const diag = item.diagnostics ?? null;
  if (diag?.freezeReason) return null;

  const change = finite(item.change_abs) ?? 0;
  if (change === 0) return null;

  // The solver water-fills in proportion to each ad set's shrunk composite score, so a
  // raise means exactly this: its score earned a bigger slice of the pool than the
  // budget it currently holds. Not "it beat the average".
  const lead =
    change > 0
      ? 'Earned a larger share of the pool than its current budget.'
      : 'Earned a smaller share of the pool than its current budget.';

  const d3 = finite(diag?.score3d);
  const d7 = finite(diag?.score7d);
  const d14 = finite(diag?.score14d);
  const present = [d3, d7, d14].filter((value): value is number => value != null && value > 0);
  // ponytail: max/min ratio, not the engine's coefficient of variation. Good enough to
  // say "agree"/"disagree" in a sentence; use the engine's consistency term if this ever
  // needs to be the same number the score was computed from.
  const windowsAgree =
    present.length >= 2 ? Math.max(...present) / Math.min(...present) <= 1.35 : null;

  const ci = diag?.ci ?? null;
  const cpa = finite(ci?.cpa);

  return {
    lead,
    windows: d3 == null && d7 == null && d14 == null ? null : { d3, d7, d14 },
    windowsAgree,
    cost:
      cpa == null
        ? null
        : { cpa, lo: finite(ci?.lo), hi: finite(ci?.hi), events: finite(ci?.events) },
    capped: diag?.velocityCapped === true,
  };
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
    case 'pause_ad':
      return { label: 'Pause this ad', glyph: '⏸' };
    case 'variate_creative':
      return { label: 'Make variations of the winner', glyph: '✦' };
    case 'seed_experiment':
      return { label: 'Nothing to learn from — add variants', glyph: '⚗' };
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
export function actionRoute(kind: string): 'budget' | 'pause' | 'creative' | 'fatigue' | 'hidden' {
  if (NOT_YET_EXECUTABLE_KINDS.has(kind)) return 'hidden';
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
export function applyModeExplainer(applyMode: string | null | undefined): string {
  // Written for a media buyer, not for us. "Soak tier" and "human-in-the-loop"
  // are our words for our rollout; what the reader needs is whether their money
  // can move, and what they do about it.
  const mode = (applyMode ?? '').toLowerCase();
  if (mode === 'observe') {
    return 'Observe — the optimizer scores every night but never changes a budget. Switch to Recommend to start approving its moves.';
  }
  if (mode === 'autopilot') {
    return 'Autopilot — budgets change automatically, within your guardrails. Stop halts every write without leaving this mode.';
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
