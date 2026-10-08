// The hero view: what the portfolio opens on. Growth from the recap (the same arithmetic the
// recap tiles use), the hero from the daily brief when it belongs to the
// latest cycle — else the deterministic brief composed here from the report, so the screen
// reads the same whether Jaina has written today's words yet or not.

import type {
  BriefCandidate,
  BriefCta,
  BriefGrowth,
  CycleRunPacing,
  OptimizationMetricDefinition,
  ParsedCycleRunReport,
  PortfolioBrief,
  PortfolioListItem,
} from '@continuum/contracts';
import { deterministicBrief, growthSentence, readPortfolioBrief } from '@continuum/contracts';
import type { FlightPacingModel } from '../../charts/flightPacingModel';
import { impactPerDay } from '../recQueueModel';
import { stripPaceClaim } from './paceClaim';
import type { RecapDay, RecapModel } from './recapModel';

export type HeroCta = {
  /** `build` belongs to an ADOPTED asked-for suggestion that proposed something new: the
   *  press turns it into work the existing approved path can run (see askedForModel.ts).
   *  Nothing else in the optimizer emits it, and it never reaches `onHeroCta`. */
  kind: 'queue_row' | 'audience_card' | 'manage' | 'build';
  /** The queue row key to focus (rec:<id> / budget:<adset>) — null for manage and build. */
  rowKey: string | null;
  label: string;
};

/** The only two shapes `buildActionQueue` keys a row by. A CTA that names anything else —
 *  a bare audience-proposal id, a candidate id like `audience:<uuid>` — has nothing to land on. */
const QUEUE_ROW_KEY = /^(rec|budget):.+/;

export function isQueueRowKey(key: string | null | undefined): key is string {
  return typeof key === 'string' && QUEUE_ROW_KEY.test(key);
}

/**
 * The ONE resolver for where a CTA lands, shared by the hero card and the asked-for rows.
 *
 * A brief or an ad-hoc plan may point at a queue row directly (`queue_row`) or at an
 * audience proposal (`audience_card`, whose `target_id` is the PROPOSAL id — the audience card
 * renders nested inside its recommendation's row, so the proposal id itself is never a row
 * key). The row is found in this order, and only a real key is ever returned:
 *
 *   1. the CTA's own `target_id`, when it already is a row key;
 *   2. the candidate's id (`rec:<id>` on every candidate the deterministic brief mints);
 *   3. the recommendation a handoff says the plan became (`rec:<recommendation_id>`).
 *
 * Null means the CTA cannot land anywhere the queue knows — the caller then offers a
 * different door instead of a button that focuses nothing. Two resolvers used to disagree
 * here (heroModel used the candidate id, askedForModel the bare proposal id); this is the
 * function both call now.
 */
export function queueRowKeyFor(
  cta: Pick<BriefCta, 'kind' | 'target_id'> | null | undefined,
  fallback: { candidateId?: string | null; recommendationId?: string | null } = {},
): string | null {
  if (!cta || cta.kind === 'manage') return null;
  if (isQueueRowKey(cta.target_id)) return cta.target_id;
  if (isQueueRowKey(fallback.candidateId)) return fallback.candidateId;
  if (fallback.recommendationId) return `rec:${fallback.recommendationId}`;
  return null;
}

export type HeroView = {
  state: 'first_cycle' | 'ready';
  /** 'brief' when Jaina wrote today's words; 'fallback' when composed here. */
  source: 'brief' | 'fallback';
  pacingLine: string | null;
  pacingTone: 'success' | 'warning' | 'muted';
  brief: PortfolioBrief;
  cta: HeroCta | null;
  observe: boolean;
  asOf: string | null;
  /**
   * The daily recap series, so the calm card can draw cost per result against the target
   * across the window. Absent reads as no priced days. See ./news/cardVisual.
   */
  series?: readonly RecapDay[];
  /**
   * The cycle's recommendations: where each card's evidence lives (value, threshold, window),
   * joined to its brief candidate by `rec:<id>`. Absent reads as no evidence.
   */
  recommendations?: ParsedCycleRunReport['recommendations'];
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

function pacingLineOf(flight: FlightPacingModel | null): {
  line: string | null;
  tone: HeroView['pacingTone'];
} {
  if (!flight) return { line: null, tone: 'muted' };
  switch (flight.kind) {
    case 'no_flight':
      return { line: null, tone: 'muted' };
    case 'not_started':
      return { line: `Flight starts ${flight.start}`, tone: 'muted' };
    case 'ended':
      return { line: 'Flight ended', tone: 'muted' };
    case 'awaiting_cycle':
      return {
        line: `Flight day ${flight.dayIndex} of ${flight.periodDays} · awaiting the first cycle`,
        tone: 'muted',
      };
    default: {
      const f = flight as { status?: string; dayIndex?: number; periodDays?: number };
      const status = f.status ?? 'on_track';
      const word =
        status === 'on_track' ? 'On pace' : status === 'underpacing' ? 'Under pace' : 'Over pace';
      return {
        line:
          f.dayIndex != null && f.periodDays != null
            ? `${word} · day ${f.dayIndex} of ${f.periodDays}`
            : word,
        tone: status === 'on_track' ? 'success' : 'warning',
      };
    }
  }
}

/**
 * Mirrors `pacingVerdict` in the Backend's portfolio-brief packet: a status is only a verdict
 * when the engine measured it against a real flight window. With no declared flight the engine
 * still writes a row — `status: 'on_track'`, `pacingRatio: 1`, `idealCumulative: 0`,
 * `source: 'observed'` — and that row means there was no plan to be on or off. Rendered
 * verbatim it becomes the literal words "on track" in the growth sentence, beside prose that
 * correctly says the portfolio is over its cost target.
 *
 * Both halves are required: `source === 'pacing'` for a real window, and `idealCumulative > 0`
 * because on day one the plan expects nothing and `pacingRatio` is 1 by construction. Rows
 * written before `source` existed carry neither and read as no verdict. The `note` survives
 * either way — it is the only field that says WHY there is no verdict.
 */
export function pacingVerdict(pacing: CycleRunPacing | null | undefined): BriefGrowth['pacing'] {
  const note = pacing?.note ?? null;
  const status = pacing?.status;
  const measuredAgainstAPlan = pacing?.source === 'pacing' && (pacing.idealCumulative ?? 0) > 0;
  if (
    !measuredAgainstAPlan ||
    (status !== 'on_track' && status !== 'underpacing' && status !== 'overpacing')
  ) {
    return { status: null, ratio: null, note };
  }
  return {
    status,
    ratio: typeof pacing.pacingRatio === 'number' ? round2(pacing.pacingRatio) : null,
    note,
  };
}

/**
 * The stored brief with the verdict the latest run supports, in place of the one it carried.
 *
 * The brief was written from a packet, and a packet from a Backend older than
 * `pacingVerdict` carried the engine's fallback row as a plain `on_track` — Easy Fit's
 * FORMULARIOS // TODOS reads "above the 35 target, and is on track" on a portfolio with no
 * flight at all. The run row on the report is the same fact the Backend reads, so the
 * Frontend reads it too, and when it says there was no plan to be on or off, the brief's
 * verdict goes and so does the clause in the prose that claimed it. A sentence that was
 * nothing but the claim falls back to the deterministic line, which never invents a pace.
 */
function withPacingVerdict(
  stored: PortfolioBrief,
  runPacing: CycleRunPacing | null | undefined,
): PortfolioBrief {
  const growth: BriefGrowth = { ...stored.growth, pacing: pacingVerdict(runPacing) };
  if (growth.pacing.status) return { ...stored, growth };
  const sentence = stripPaceClaim(stored.growth_sentence);
  return {
    ...stored,
    growth,
    growth_sentence: sentence === '' ? growthSentence(growth) : sentence,
  };
}

function growthFromRecap(args: {
  recap: RecapModel;
  metric: OptimizationMetricDefinition;
  currency: string | null;
  target: number | null;
  latestRun: ParsedCycleRunReport['latest_run'];
  window: BriefGrowth['window'];
}): BriefGrowth {
  const { recap } = args;
  return {
    spend: round2(recap.current.spend),
    results: Math.round(recap.current.results),
    cost_per_result:
      recap.current.costPerResult != null ? round2(recap.current.costPerResult) : null,
    target: args.target,
    deltas: {
      spend: recap.delta.spend != null ? round2(recap.delta.spend) : null,
      results: recap.delta.results != null ? round2(recap.delta.results) : null,
      cost_per_result: recap.delta.costPerResult != null ? round2(recap.delta.costPerResult) : null,
    },
    pacing: pacingVerdict(args.latestRun?.pacing),
    scale: null,
    window: args.window,
    as_of: args.latestRun?.cycle_ts ?? new Date().toISOString(),
    currency: args.currency,
    result_label: args.metric.resultLabel.toLowerCase(),
  };
}

/** The Frontend's candidates when no brief exists: pending recommendations priced by the
 *  engine's own estImpactPerDay (what the queue already shows), plus the cycle's moves. */
function candidatesFromReport(
  report: ParsedCycleRunReport,
  costPerResult: number | null,
): BriefCandidate[] {
  const out: BriefCandidate[] = [];
  const moves = report.latest_items.filter((it) => (it.change_abs ?? 0) !== 0);
  if (moves.length > 0 && costPerResult != null) {
    let gained = 0;
    let largest = moves[0] as (typeof moves)[number];
    for (const it of moves) {
      const cpa = it.diagnostics?.ci?.cpa ?? costPerResult;
      if (cpa > 0) gained += (it.change_abs ?? 0) / cpa;
      if (Math.abs(it.change_abs ?? 0) > Math.abs(largest.change_abs ?? 0)) largest = it;
    }
    out.push({
      id: 'budget:portfolio',
      module: 'budget',
      kind: 'budget_move',
      trigger: null,
      adset_id: largest.adset_id,
      adset_name: largest.adset_name ?? null,
      impact_per_day: round2(Math.max(0, gained) * costPerResult),
      impact_unit: 'currency',
      results_per_day: round2(gained),
      impact_basis: `${moves.length} budget move${moves.length === 1 ? '' : 's'} this cycle, valued at each ad set's own cost per result`,
      reason: largest.reason ?? null,
      cta: { kind: 'queue_row', target_id: `budget:${largest.adset_id}` },
    });
  }
  for (const rec of report.recommendations) {
    const module =
      rec.kind === 'pause'
        ? 'pause'
        : rec.kind === 'audience_expand'
          ? 'audience'
          : rec.kind === 'settings' || rec.kind === 'restore_delivery'
            ? null
            : 'creative';
    if (!module) continue;
    const impact = impactPerDay(rec);
    out.push({
      id: `rec:${rec.id}`,
      module,
      kind: rec.kind,
      trigger: rec.trigger,
      adset_id: rec.adset_id,
      adset_name: rec.adset_name ?? null,
      impact_per_day: round2(Math.max(0, impact)),
      impact_unit: 'currency',
      results_per_day: null,
      impact_basis:
        impact > 0 ? 'impact/day the engine sized on this recommendation' : 'no sized impact yet',
      reason: rec.reason ?? null,
      cta: { kind: 'queue_row', target_id: `rec:${rec.id}` },
    });
  }
  return out;
}

/** Where a candidate's call to action lands: the queue row, the audience card, or Manage
 *  when the portfolio only observes (the click then shows what Recommend would do). */
export function ctaForCandidate(
  candidate: Pick<BriefCandidate, 'id' | 'module' | 'cta'>,
  observe: boolean,
): HeroCta {
  if (observe) return { kind: 'manage', rowKey: null, label: 'See what Recommend would do' };
  const rowKey = queueRowKeyFor(candidate.cta, { candidateId: candidate.id });
  // A card whose target the queue cannot hold gets Manage, named as Manage — never a button
  // labelled "Open the audience proposal" that switches tabs and focuses nothing.
  if (candidate.cta.kind !== 'manage' && !rowKey) {
    return { kind: 'manage', rowKey: null, label: 'Open Manage' };
  }
  const label =
    candidate.module === 'pause'
      ? 'Review the pause'
      : candidate.module === 'budget'
        ? 'Review the budget moves'
        : candidate.module === 'creative'
          ? 'Open the creative recommendation'
          : candidate.cta.kind === 'audience_card'
            ? 'Open the audience proposal'
            : 'Open the audience recommendation';
  return { kind: candidate.cta.kind, rowKey, label };
}

function ctaFor(brief: PortfolioBrief, observe: boolean): HeroCta | null {
  const hero = brief.hero;
  if (observe) return { kind: 'manage', rowKey: null, label: 'See what Recommend would do' };
  if (!hero.cta || hero.module === 'none') return null;
  const candidate = brief.candidates.find((c) => c.id === hero.candidate_id) ?? null;
  return ctaForCandidate(
    candidate ?? { id: hero.candidate_id ?? '', module: hero.module, cta: hero.cta },
    observe,
  );
}

export function buildHeroView(args: {
  report: ParsedCycleRunReport | null;
  recap: RecapModel;
  flightPacing: FlightPacingModel | null;
  metric: OptimizationMetricDefinition;
  currency: string | null;
  portfolio: PortfolioListItem;
  target: number | null;
  window: BriefGrowth['window'];
  firstCycle: boolean;
  now?: string;
}): HeroView {
  const { report, recap, metric } = args;
  const observe = args.portfolio.apply_mode === 'observe';
  const growth = growthFromRecap({
    recap,
    metric,
    currency: args.currency,
    target: args.target,
    latestRun: report?.latest_run ?? null,
    window: args.window,
  });
  const pacing = pacingLineOf(args.flightPacing);
  const stored = report?.hero_brief ? readPortfolioBrief(report.hero_brief) : null;
  const latestRunId = report?.latest_run?.id ?? null;
  const briefIsCurrent =
    stored != null &&
    (report?.hero_brief?.cycle_run_id === latestRunId ||
      Date.now() - Date.parse(stored.generated_at) < 24 * 3_600_000);
  const brief =
    briefIsCurrent && stored
      ? withPacingVerdict(stored, report?.latest_run?.pacing)
      : deterministicBrief({
          growth,
          candidates: report
            ? candidatesFromReport(report, growth.cost_per_result ?? args.target)
            : [],
          dailyTotal: args.portfolio.daily_total,
          promptVersion: 'fallback',
          generatedAt: args.now ?? new Date().toISOString(),
        });
  return {
    state: args.firstCycle ? 'first_cycle' : 'ready',
    source: briefIsCurrent ? 'brief' : 'fallback',
    pacingLine: pacing.line,
    pacingTone: pacing.tone,
    brief,
    cta: ctaFor(brief, observe),
    observe,
    asOf: report?.latest_run?.cycle_ts ?? null,
    series: recap.series,
    recommendations: report?.recommendations ?? [],
  };
}
