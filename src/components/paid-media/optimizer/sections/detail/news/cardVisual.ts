// The visual each news card draws in its band, and the figure that sits on top of it.
// Pure — no React, no formatting — so every kind below is pinned against the real bodies.
//
// WHY THIS EXISTS. The cards used to render as text because the card never received the
// evidence: a brief candidate carries money per day and a sentence, nothing to draw. The same
// status body DOES hold the figures — `recommendations[].evidence` (value, threshold, window)
// and `latest_items[].diagnostics` (ci, budgets, rawBudget, velocityCapped, freezeReason). This
// module joins them to the card by the candidate's id (`rec:<uuid>`) and its ad set.
//
// ONE VISUAL PER KIND, each drawn from the figure behind the card's own "why":
//
//   pause · sustained cost    two bars, this ad set vs the reference, with the engine's line
//   pause · zero results      spend as blocks of "one result at target" over a zero baseline
//   creative · fatigue        the 14-day CTR level with the last days stepping down
//   budget · move             from → to columns, with what the solver wanted and the cap
//   interval                  the ad set's own range, its estimate and the target — and the
//                             winning ad on it, when the engine named one (`evidence.winner`)
//   nothing to change         cost per result against the target, the area over it shaded
//   nothing to plot           a neutral strip of what the cycle knows, naming what is missing
//
// THE NO-DATA RULE, in order: the kind's own evidence; else the same ad set's cycle numbers
// (its CI against the target, or its budget from → to); else the strip. Never an empty band,
// never a chart of a different quantity, and never the engine's formula string. Null is
// unknown, never zero — `measureOf` / `boughtAnything` decide what a zero means.

import {
  type BriefCandidate,
  type BriefGrowth,
  type CycleItemRow,
  type ParsedCycleRunReport,
  recommendationWinnerOf,
} from '@continuum/contracts';
import { boughtAnything, costOf, measureOf } from '../heroChart';
import type { RecapDay } from '../recapModel';

export type RecommendationRow = ParsedCycleRunReport['recommendations'][number];

/** The one colour a card's band and visual speak in. */
export type CardTone = 'bad' | 'primary' | 'warn' | 'neutral';

/** An evidence window, in days, as the engine named it. */
export type WindowDays = 3 | 7 | 14;

export type CostPoint = { label: string; cost: number };

export type StripCell =
  | { kind: 'money'; value: number; label: string }
  | { kind: 'count'; value: number; label: string };

/** The winning ad a "make variations of the winner" card places on its ad set's range. */
export type RangeWinner = {
  adId: string;
  adName: string | null;
  /** The ad's OWN cost per result — not the ad set's, which is what the range bounds. */
  costPerResult: number;
};

export type CardVisual =
  | {
      kind: 'cost_vs_reference';
      windowDays: WindowDays;
      /** The ad set's own cost per result over the window. */
      value: number;
      /** The robust reference the engine compared against; null when it did not say. */
      reference: number | null;
      /** The line the value crossed — the engine's threshold. */
      line: number;
      /** line ÷ reference, e.g. 2.5; null without a reference. */
      multiple: number | null;
    }
  | {
      kind: 'spend_blocks';
      windowDays: WindowDays;
      spent: number;
      /** What one result costs at target — the size of a block. */
      perResult: number;
      /** spent ÷ perResult, one decimal. */
      blocks: number;
    }
  | {
      kind: 'ctr_step';
      /** CTR in display percent (0.68 for 0.68%). */
      base: number;
      baseWindowDays: WindowDays;
      recent: number;
      recentWindowDays: WindowDays;
      /** (recent − base) ÷ base, in whole percent. */
      changePct: number;
      /** The cost-per-result move the engine reported beside it, when it reported one. */
      costChangePct: number | null;
    }
  | {
      kind: 'budget_move';
      from: number;
      to: number;
      /** What the solver asked for before the caps; null when it asked for the same. */
      wanted: number | null;
      /** The per-cycle velocity cap, when it is what trimmed the ask. */
      cap: number | null;
    }
  | {
      kind: 'range';
      low: number;
      high: number;
      estimate: number | null;
      target: number | null;
      results: number | null;
      /** From the engine's `evidence.winner` (C2); null when the row carries none. */
      winner: RangeWinner | null;
    }
  | {
      kind: 'cost_line';
      /** 'days' is the daily recap series; 'ad_sets' is the cycle's ad sets, cheapest first. */
      across: 'days' | 'ad_sets';
      points: CostPoint[];
      target: number | null;
      overall: number | null;
    }
  | {
      kind: 'strip';
      /** What is missing, in the engine's own words ("12 of 12 ad sets frozen · kpi_mismatch"). */
      label: string;
      cells: StripCell[];
    };

export type CardVisualKind = CardVisual['kind'];

/** The figure on the band's top-left corner. */
export type CardFigure = {
  value: number;
  unit: 'currency_per_day' | 'currency';
  /** Words after the figure: "a day", "a day moved", "per lead". */
  label: string;
  signed: boolean;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Evidence metrics whose value IS the ad set's cost per result. */
const COST_PER_RESULT_METRICS = new Set(['cpp', 'cpa']);

const WINDOW_DAYS: Record<string, WindowDays> = { d3: 3, d7: 7, d14: 14 };

/** "leads" → "lead"; the objective's own word, never "result" on a conversations account. */
export function resultNoun(resultLabel: string): string {
  const word = resultLabel.toLowerCase();
  return word.endsWith('s') ? word.slice(0, -1) : word;
}

/** The recommendation behind a candidate, joined by the brief's own id (`rec:<uuid>`). */
export function recommendationFor(
  candidate: Pick<BriefCandidate, 'id'> | null,
  recommendations: readonly RecommendationRow[],
): RecommendationRow | null {
  if (!candidate) return null;
  return recommendations.find((rec) => `rec:${rec.id}` === candidate.id) ?? null;
}

/** The engine's reference, which rides on the evidence's own headline as its `to`. */
function referenceOf(evidence: NonNullable<RecommendationRow['evidence']>): number | null {
  const headline = (evidence as { headline?: unknown }).headline;
  if (!headline || typeof headline !== 'object') return null;
  const to = (headline as { to?: unknown }).to;
  return finite(to) && to > 0 ? to : null;
}

/** "CPA up 120%" in the engine's comparator — the one figure F1 carries only in words. */
function costChangeOf(evidence: NonNullable<RecommendationRow['evidence']>): number | null {
  const match = /\b(?:CPA|CPP|cost per result)\s+(up|down)\s+(\d+(?:\.\d+)?)%/i.exec(
    evidence.comparator,
  );
  if (!match) return null;
  const pct = Number(match[2]);
  return match[1]?.toLowerCase() === 'down' ? -pct : pct;
}

/** Step 1: the kind's own evidence, when the recommendation carries it. */
function ownEvidence(
  candidate: BriefCandidate,
  rec: RecommendationRow | null,
  item: CycleItemRow | null,
): CardVisual | null {
  const evidence = rec?.evidence;
  if (!evidence) return null;
  const windowDays = WINDOW_DAYS[evidence.window] ?? 14;
  const threshold = evidence.threshold;
  if (candidate.module === 'pause' && COST_PER_RESULT_METRICS.has(evidence.metric)) {
    if (!(evidence.value > 0) || !finite(threshold) || !(threshold > 0)) return null;
    const reference = referenceOf(evidence);
    return {
      kind: 'cost_vs_reference',
      windowDays,
      value: round2(evidence.value),
      reference: reference != null ? round2(reference) : null,
      line: round2(threshold),
      multiple: reference != null ? round1(threshold / reference) : null,
    };
  }
  if (candidate.module === 'pause' && evidence.metric === 'spend') {
    if (!(evidence.value > 0) || !finite(threshold) || !(threshold > 0)) return null;
    // "Not one result" is drawn only when it was MEASURED. A null count is unknown.
    if (boughtAnything(candidate, measureOf(item?.diagnostics?.ci)) !== false) return null;
    return {
      kind: 'spend_blocks',
      windowDays,
      spent: round2(evidence.value),
      perResult: round2(threshold),
      blocks: round1(evidence.value / threshold),
    };
  }
  if (evidence.metric === 'ctr') {
    if (!finite(threshold) || !(threshold > 0) || !(evidence.value >= 0)) return null;
    return {
      kind: 'ctr_step',
      base: round2(threshold * 100),
      baseWindowDays: 14,
      recent: round2(evidence.value * 100),
      recentWindowDays: windowDays,
      changePct: Math.round(((evidence.value - threshold) / threshold) * 100),
      costChangePct: costChangeOf(evidence),
    };
  }
  return null;
}

/** The ad set's budget move, with the solver's ask and the cap when they differ from it. */
function budgetMoveOf(item: CycleItemRow | null): CardVisual | null {
  if (!item) return null;
  const from = item.current_budget;
  const to = item.final_budget;
  const moved = item.change_abs;
  if (!finite(from) || !finite(to) || !finite(moved) || moved === 0) return null;
  const raw = item.diagnostics?.rawBudget;
  const capped = item.diagnostics?.velocityCapped;
  const wanted = finite(raw) && raw > 0 && Math.abs(raw - to) >= 0.01 ? round2(raw) : null;
  const cap = finite(raw) && finite(capped) && capped < raw && capped > 0 ? round2(capped) : null;
  return { kind: 'budget_move', from: round2(from), to: round2(to), wanted, cap };
}

/** The winning ad the engine named in structured evidence — never read out of the prose. */
function winnerOf(rec: RecommendationRow | null): RangeWinner | null {
  const winner = recommendationWinnerOf(rec?.evidence);
  if (!winner) return null;
  return {
    adId: winner.ad_id,
    adName: winner.ad_name,
    costPerResult: round2(winner.cost_per_result),
  };
}

/** The engine's own interval on the ad set's cost per result, when it bounded one. */
function rangeOf(
  item: CycleItemRow | null,
  target: number | null,
  winner: RangeWinner | null,
): CardVisual | null {
  const measured = measureOf(item?.diagnostics?.ci);
  if (!measured || measured.low == null || measured.high == null) return null;
  return {
    kind: 'range',
    low: round2(measured.low),
    high: round2(measured.high),
    estimate: measured.costPerResult != null ? round2(measured.costPerResult) : null,
    target,
    results: measured.results,
    winner,
  };
}

/** Step 2: the same ad set's cycle numbers — never the portfolio's dressed up as the card's. */
function cycleRow(
  module: BriefCandidate['module'],
  item: CycleItemRow | null,
  target: number | null,
  rec: RecommendationRow | null,
): CardVisual | null {
  const winner = winnerOf(rec);
  return module === 'budget'
    ? (budgetMoveOf(item) ?? rangeOf(item, target, winner))
    : (rangeOf(item, target, winner) ?? budgetMoveOf(item));
}

/** Step 3: what the cycle holds, named by what is missing. */
function strip(args: {
  item: CycleItemRow | null;
  items: readonly CycleItemRow[];
  growth: BriefGrowth;
  resultLabel: string;
}): CardVisual {
  const { item, items, growth, resultLabel } = args;
  const reasons = new Map<string, number>();
  let held = 0;
  for (const row of items) {
    const reason = row.diagnostics?.freezeReason ?? null;
    if (row.diagnostics?.status !== 'frozen' && !reason) continue;
    held += 1;
    if (reason) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  let heldReason: string | null = null;
  for (const [reason, count] of reasons) {
    if (heldReason === null || count > (reasons.get(heldReason) ?? 0)) heldReason = reason;
  }
  const words = resultLabel.toLowerCase();
  const ownReason = item?.diagnostics?.freezeReason ?? null;
  const label = ownReason
    ? `ad set frozen · ${ownReason}`
    : held > 0
      ? `${held} of ${items.length} ad sets frozen${heldReason ? ` · ${heldReason}` : ''}`
      : growth.results === 0
        ? `0 ${words} in ${WINDOW_DAYS[growth.window] ?? 14} days`
        : `no cost per ${resultNoun(resultLabel)} measured`;
  const cells: StripCell[] = [];
  if (finite(growth.spend)) cells.push({ kind: 'money', value: growth.spend, label: 'spent' });
  if (finite(growth.results)) cells.push({ kind: 'count', value: growth.results, label: words });
  if (items.length > 0) cells.push({ kind: 'count', value: items.length, label: 'ad sets' });
  return { kind: 'strip', label, cells };
}

/** The calm card: cost per result against the target, from days if priced, else ad sets. */
function calmLine(args: {
  series: readonly RecapDay[];
  items: readonly CycleItemRow[];
  growth: BriefGrowth;
  target: number | null;
}): CardVisual | null {
  const { series, items, growth, target } = args;
  const days = series
    .map((day) => ({ label: day.date, cost: costOf(day) }))
    .filter((point): point is CostPoint => point.cost != null);
  const overall = finite(growth.cost_per_result) ? round2(growth.cost_per_result) : null;
  if (days.length >= 2) return { kind: 'cost_line', across: 'days', points: days, target, overall };
  const adSets = items
    .map((row) => ({
      label: row.adset_name ?? row.adset_id,
      cost: measureOf(row.diagnostics?.ci)?.costPerResult ?? null,
    }))
    .filter((point): point is CostPoint => point.cost != null)
    .map((point) => ({ ...point, cost: round2(point.cost) }))
    .sort((a, b) => a.cost - b.cost);
  if (adSets.length >= 2) {
    return { kind: 'cost_line', across: 'ad_sets', points: adSets, target, overall };
  }
  return null;
}

export type CardVisualArgs = {
  /** Null for the calm card — "nothing worth changing today" has no candidate behind it. */
  candidate: BriefCandidate | null;
  recommendations: readonly RecommendationRow[];
  items: readonly CycleItemRow[];
  growth: BriefGrowth;
  series: readonly RecapDay[];
  target: number | null;
  resultLabel: string;
};

/** The visual a card draws. Always one — the strip is the floor, never an empty band. */
export function visualForCard(args: CardVisualArgs): CardVisual {
  const { candidate, recommendations, items, growth, series, target, resultLabel } = args;
  if (!candidate) {
    return (
      calmLine({ series, items, growth, target }) ??
      strip({ item: null, items, growth, resultLabel })
    );
  }
  const item = items.find((row) => row.adset_id === candidate.adset_id) ?? null;
  const rec = recommendationFor(candidate, recommendations);
  return (
    (candidate.module === 'budget' ? budgetMoveOf(item) : ownEvidence(candidate, rec, item)) ??
    cycleRow(candidate.module, item, target, rec) ??
    strip({ item, items, growth, resultLabel })
  );
}

/** The figure on the band: the money at stake, the budget that moved, or the cost read. */
export function figureForCard(args: {
  candidate: BriefCandidate | null;
  impactPerDay: number | null;
  visual: CardVisual;
  resultLabel: string;
}): CardFigure | null {
  const { candidate, impactPerDay, visual, resultLabel } = args;
  const per = `per ${resultNoun(resultLabel)}`;
  if (candidate?.module === 'budget' && visual.kind === 'budget_move') {
    return {
      value: round2(visual.to - visual.from),
      unit: 'currency_per_day',
      label: 'a day moved',
      signed: true,
    };
  }
  if (impactPerDay != null && impactPerDay > 0) {
    return { value: round2(impactPerDay), unit: 'currency_per_day', label: 'a day', signed: false };
  }
  if (visual.kind === 'range' && visual.estimate != null) {
    return { value: visual.estimate, unit: 'currency', label: `${per} · est.`, signed: false };
  }
  if (visual.kind === 'cost_line' && visual.overall != null) {
    return { value: visual.overall, unit: 'currency', label: per, signed: false };
  }
  return null;
}

/** The tone the band and its visual speak in. */
export function toneForVisual(visual: CardVisual): CardTone {
  switch (visual.kind) {
    case 'cost_vs_reference':
    case 'spend_blocks':
    case 'ctr_step':
      return 'bad';
    case 'budget_move':
      return 'primary';
    case 'range':
      return visual.target != null && visual.estimate != null && visual.estimate > visual.target
        ? 'warn'
        : 'primary';
    case 'cost_line':
      return visual.target != null && visual.overall != null && visual.overall > visual.target
        ? 'warn'
        : 'neutral';
    case 'strip':
      return 'neutral';
  }
}
