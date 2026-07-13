// ---------------------------------------------------------------------------
// Decision-outcome attribution — the learning loop's math. The legacy DCO
// planned but never built this ("Feedback Loop", CURRENT_STATE.md); its render
// mapping (DCO_RENDER_MAPPING.md) showed why it matters: without joining each
// decision to subsequent-window performance, nothing can be scored or tuned.
//
// Two pure halves, both clock-free (the caller supplies `decidedAt`):
//   extractDecisions()       — turn one CycleResult into decision drafts, each
//                              frozen with its at-decision baseline (the future
//                              optimizer.decision_outcomes insert).
//   computeDecisionOutcome() — mature a draft against a LATER snapshot's daily
//                              series: realized post-window cost-per-event,
//                              difference-in-differences vs the portfolio trend.
//
// Score convention: POSITIVE = the decision was right.
//   grow kinds (budget_increase / creative_refresh / audience_expand):
//     right when the ad set's CPP improved MORE than the portfolio's.
//   cut kinds (budget_decrease / starve / pause_recommended / freeze):
//     right when the ad set kept deteriorating RELATIVE to the portfolio.
// DiD against the portfolio trend absorbs seasonality/auction shifts, but
// budgets move every cycle so windows overlap decisions — outcomes are
// directional evidence for rule tuning, NOT causal proof. Surfacing copy
// must say so.
//
// STATUS: UNWIRED STUB (see rules/types.ts). Nothing calls this yet.
// ---------------------------------------------------------------------------

import type { EngineConfig } from './config';
import type { RuleFinding } from './rules/types';
import { kpiEvents } from './scoring';
import type { AdSetSnapshot, CycleResult, DailyMetrics } from './types';

export type DecisionKind =
  | 'budget_increase'
  | 'budget_decrease'
  | 'starve'
  | 'freeze'
  | 'pause_recommended'
  | 'creative_refresh'
  | 'audience_expand'
  // Creative-level decisions. The ledger grades these like any other: it asks whether the
  // ad set got cheaper afterwards. That is the honest test of "we told you to make more of
  // this creative" — and the only way we will ever learn whether the variation loop works.
  | 'pause_ad'
  | 'variate_creative'
  | 'seed_experiment';

/** Decisions whose thesis is "this should produce MORE / cheaper results". A cut is graded
 *  the opposite way, so mislabelling one grades it backwards — a good pause would score as
 *  a failure. `pause_ad` is a CUT (we removed a creative); the two creative-experiment
 *  kinds are grows (we added creatives, betting the ad set gets cheaper). */
const GROW_KINDS: ReadonlySet<DecisionKind> = new Set([
  'budget_increase',
  'creative_refresh',
  'audience_expand',
  'variate_creative',
  'seed_experiment',
]);

/** At-decision metrics frozen onto the decision row (jsonb `baseline`). */
export type DecisionBaseline = {
  cppD7: number; // 0 = no KPI signal at decision time
  spendD7: number;
  kpiEventsD7: number;
  portfolioCppD7: number;
  compositeScore?: number;
};

export type DecisionDraft = {
  adSetId: string;
  kind: DecisionKind;
  /** 'solver' | built-in trigger id | 'rule:<templateId>' | 'abstain'. */
  source: string;
  ruleId?: string;
  decidedAt: string; // ISO, caller-supplied — the engine never reads a clock
  horizonDays: number;
  baseline: DecisionBaseline;
};

export type ExtractOptions = {
  decidedAt: string;
  /** Days of post-decision performance before the decision matures. */
  horizonDays?: number; // default 7
  /** Budget moves smaller than this fraction are noise, not decisions. */
  materialChangePct?: number; // default 0.10
};

const spendWeightedPortfolioCpp = (snapshots: AdSetSnapshot[], cfg: EngineConfig): number => {
  const evaluable = snapshots.filter((s) => s.status !== 'frozen' && s.status !== 'flagged');
  const spend = evaluable.reduce((a, s) => a + s.windows.d7.spend, 0);
  const events = evaluable.reduce((a, s) => a + kpiEvents(s.windows.d7, cfg), 0);
  return events > 0 ? spend / events : 0;
};

/**
 * Extract the material decisions from one cycle:
 *   - budget moves >= materialChangePct (solver)
 *   - every recommendation (pause -> pause_recommended)
 *   - rule findings (carry ruleId lineage for per-rule scoring)
 *   - starves without a pause recommendation (rule-starve kind)
 *   - ingest-side abstains (freeze on no_conversions)
 * One decision per (adSetId, kind) — the DB uniqueness this stages for.
 */
export function extractDecisions(
  result: CycleResult,
  snapshots: AdSetSnapshot[],
  cfg: EngineConfig,
  opts: ExtractOptions,
  ruleFindings: RuleFinding[] = [],
): DecisionDraft[] {
  const horizonDays = opts.horizonDays ?? 7;
  const materialChangePct = opts.materialChangePct ?? 0.1;
  const portfolioCppD7 = spendWeightedPortfolioCpp(snapshots, cfg);
  const byId = new Map(snapshots.map((s) => [s.id, s]));

  const baselineFor = (adSetId: string, compositeScore?: number): DecisionBaseline => {
    const s = byId.get(adSetId);
    const d7 = s?.windows.d7;
    const events = d7 ? kpiEvents(d7, cfg) : 0;
    return {
      cppD7: d7 && events > 0 ? d7.spend / events : 0,
      spendD7: d7?.spend ?? 0,
      kpiEventsD7: events,
      portfolioCppD7,
      compositeScore,
    };
  };

  const drafts = new Map<string, DecisionDraft>();
  const add = (d: DecisionDraft) => {
    const key = `${d.adSetId}:${d.kind}`;
    if (!drafts.has(key)) drafts.set(key, d);
  };

  // Budget moves (the solver's continuous decisions).
  for (const item of result.reallocation.items) {
    if (!Number.isFinite(item.finalBudget)) continue;
    if (Math.abs(item.changePct) < materialChangePct) continue;
    if (item.status === 'frozen' || item.status === 'flagged') continue;
    add({
      adSetId: item.id,
      kind: item.changeAbs > 0 ? 'budget_increase' : 'budget_decrease',
      source: 'solver',
      decidedAt: opts.decidedAt,
      horizonDays,
      baseline: baselineFor(item.id, item.compositeScore),
    });
  }

  // Recommendations (built-in triggers + fatigue).
  for (const rec of result.recommendations) {
    add({
      adSetId: rec.adSetId,
      kind: rec.kind === 'pause' ? 'pause_recommended' : rec.kind,
      source: rec.trigger,
      decidedAt: opts.decidedAt,
      horizonDays,
      baseline: baselineFor(rec.adSetId),
    });
  }

  // Rule findings — same kinds, with rule lineage for per-rule win-rates.
  for (const f of ruleFindings) {
    add({
      adSetId: f.adSetId,
      kind: f.kind === 'pause' ? 'pause_recommended' : f.kind,
      source: f.trigger,
      ruleId: f.ruleId,
      decidedAt: opts.decidedAt,
      horizonDays,
      baseline: baselineFor(f.adSetId),
    });
  }

  // Starves not already covered by a pause recommendation, and abstain-freezes.
  for (const item of result.reallocation.items) {
    if (item.status === 'starved' && !drafts.has(`${item.id}:pause_recommended`)) {
      add({
        adSetId: item.id,
        kind: 'starve',
        source: 'engine',
        decidedAt: opts.decidedAt,
        horizonDays,
        baseline: baselineFor(item.id, item.compositeScore),
      });
    }
    if (item.freezeReason === 'no_conversions') {
      add({
        adSetId: item.id,
        kind: 'freeze',
        source: 'abstain',
        decidedAt: opts.decidedAt,
        horizonDays,
        baseline: baselineFor(item.id, item.compositeScore),
      });
    }
  }

  return [...drafts.values()];
}

export type RealizedWindow = {
  spend: number;
  kpiEvents: number;
  cpp: number; // 0 when no events
  days: number; // daily rows actually found inside the horizon
};

export type DecisionOutcome =
  | { status: 'insufficient_data'; reason: string }
  | {
      status: 'matured';
      realized: RealizedWindow;
      adsetRelDelta?: number; // (realizedCpp - baselineCpp) / baselineCpp
      portfolioRelDelta?: number;
      /** Signed DiD score, positive = the decision was right. Undefined when
       *  only the coarse stayed-dead label applied. */
      score?: number;
      /** Coarse label for cut decisions on signal-less ad sets: spend continued
       *  with zero events inside the horizon => the cut was right. */
      stayedDead?: boolean;
    };

const dateKey = (iso: string): string => iso.slice(0, 10);

/** Sum a snapshot's daily series over (decidedAt, decidedAt + horizon]. */
export function realizedWindow(
  daily: DailyMetrics[] | undefined,
  decidedAt: string,
  horizonDays: number,
  cfg: EngineConfig,
): RealizedWindow | undefined {
  if (!daily || daily.length === 0) return undefined;
  const start = dateKey(decidedAt);
  const end = dateKey(
    new Date(new Date(`${start}T00:00:00Z`).getTime() + horizonDays * 86_400_000).toISOString(),
  );
  const rows = daily.filter((d) => d.date > start && d.date <= end);
  if (rows.length === 0) return undefined;
  const spend = rows.reduce((a, r) => a + r.spend, 0);
  const events = rows.reduce((a, r) => a + kpiEvents(r, cfg), 0);
  return { spend, kpiEvents: events, cpp: events > 0 ? spend / events : 0, days: rows.length };
}

/**
 * Mature one decision against a later snapshot of the same ad set (whose daily
 * series must now cover the horizon) plus the later portfolio for the DiD leg.
 */
export function computeDecisionOutcome(
  decision: DecisionDraft,
  laterSnapshot: AdSetSnapshot | undefined,
  laterPortfolioSnapshots: AdSetSnapshot[],
  cfg: EngineConfig,
): DecisionOutcome {
  if (!laterSnapshot) {
    return { status: 'insufficient_data', reason: 'ad set absent from later cycle' };
  }
  const realized = realizedWindow(
    laterSnapshot.daily,
    decision.decidedAt,
    decision.horizonDays,
    cfg,
  );
  if (!realized) {
    return { status: 'insufficient_data', reason: 'no daily rows inside the horizon' };
  }
  if (realized.days < decision.horizonDays) {
    return {
      status: 'insufficient_data',
      reason: `horizon not yet covered (${realized.days}/${decision.horizonDays} days)`,
    };
  }

  const grow = GROW_KINDS.has(decision.kind);
  const { cppD7: baselineCpp, portfolioCppD7 } = decision.baseline;
  const portfolioRealizedCpp = spendWeightedPortfolioCpp(laterPortfolioSnapshots, cfg);

  if (baselineCpp > 0 && realized.cpp > 0 && portfolioCppD7 > 0 && portfolioRealizedCpp > 0) {
    const adsetRelDelta = (realized.cpp - baselineCpp) / baselineCpp;
    const portfolioRelDelta = (portfolioRealizedCpp - portfolioCppD7) / portfolioCppD7;
    // CPP: lower is better. Grow decisions are right when the ad set improved
    // more than the portfolio; cut decisions when it deteriorated relative.
    const score = grow ? portfolioRelDelta - adsetRelDelta : adsetRelDelta - portfolioRelDelta;
    return { status: 'matured', realized, adsetRelDelta, portfolioRelDelta, score };
  }

  // Signal-less paths. For cut decisions, "still spending, still zero events"
  // is itself the validation; anything else is uncomparable.
  if (!grow && realized.kpiEvents === 0 && realized.spend > 0) {
    return { status: 'matured', realized, stayedDead: true };
  }
  return {
    status: 'insufficient_data',
    reason: 'no comparable cost-per-event on one side of the window',
  };
}
