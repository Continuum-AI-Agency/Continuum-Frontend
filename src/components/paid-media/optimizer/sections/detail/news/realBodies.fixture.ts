// The real optimizer-status bodies (anonymised), read the way the screen reads them: report →
// hero view → news. Shared by the news model and render tests so both assert on one path.
//
// PRUEBA_CYCLE is the one derived body. The repo's anonymised Prueba fixture was captured
// before that portfolio's 25 Sep cycle carried its budget move and its vary-the-winner
// recommendation, so it holds a single creative card. The figures patched in below are that
// cycle's own (AV CAMACHO // AGOSTO - LKL: CTR 0.86% → 0.62% with CPA up 36%; budget 33.75 →
// 39.15, solver 52.42, velocity cap 42.19; engine CI 13.15–30.53 around 19.56 on 24 leads),
// as quoted on the approved news-cards design page. Everything else is the fixture as stored.

import {
  type CycleRunReport,
  getOptimizationMetricDefinition,
  type ParsedCycleRunReport,
} from '@continuum/contracts';
import mensajes from '../../../../../../../packages/contracts/src/optimization/fixtures/optimizer-status-mensajes.json';
import formularios from '../../../__fixtures__/optimizer-status-formularios.json';
import prueba from '../../../__fixtures__/optimizer-status-prueba.json';
import tours from '../../../__fixtures__/optimizer-status-tours.json';
import { parseReport } from '../../../reportModel';
import { buildHeroView, type HeroView } from '../heroModel';

type Body = Record<string, unknown>;

const LKL = '900000000000000011';
const REFRESH = '00000000-0000-4000-8000-000000000010';
const VARY = '00000000-0000-4000-8000-000000000011';

function pruebaCycle(): Body {
  const body = structuredClone(prueba) as unknown as {
    hero_brief: { brief: Record<string, unknown> };
    latest_items: Array<Record<string, unknown>>;
    recommendations: Array<Record<string, unknown>>;
  };
  const refresh = body.recommendations.find((rec) => rec.id === REFRESH);
  if (!refresh) throw new Error('prueba fixture lost its creative recommendation');
  Object.assign(refresh, {
    adset_id: LKL,
    adset_name: 'AV CAMACHO // AGOSTO - LKL',
    reason: 'CTR down 28% (3d 0.62% vs 14d 0.86%) with CPA up 36%: creative worn out — refresh.',
    evidence: {
      ...(refresh.evidence as object),
      value: 0.0062,
      threshold: 0.0086,
      comparator: 'down 28% vs 14d, CPA up 36%',
      estImpactPerDay: 9.52,
    },
  });
  body.recommendations = [
    refresh,
    {
      ...refresh,
      id: VARY,
      kind: 'variate_creative',
      trigger: 'V1_vary_winner',
      reason: 'One ad gets leads at 29.10; the rest of the ad set at 164. Make variants of it.',
      evidence: null,
    },
  ];
  const lkl = body.latest_items.find((item) => item.adset_id === LKL);
  if (!lkl) throw new Error('prueba fixture lost its LKL ad set');
  Object.assign(lkl, {
    current_budget: 33.75,
    final_budget: 39.15,
    change_abs: 5.4,
    diagnostics: {
      ...(lkl.diagnostics as object),
      ci: { cpa: 19.56, lo: 13.15, hi: 30.53, events: 24 },
      rawBudget: 52.42,
      velocityCapped: 42.19,
    },
  });
  const brief = body.hero_brief.brief as {
    hero: Record<string, unknown>;
    candidates: Array<Record<string, unknown>>;
    secondary: string[];
  };
  const creative = {
    ...(brief.candidates[0] as object),
    adset_id: LKL,
    adset_name: 'AV CAMACHO // AGOSTO - LKL',
  };
  brief.hero = {
    ...brief.hero,
    headline: 'Refresh creative on AV CAMACHO // AGOSTO - LKL to save 9.52/day',
  };
  brief.candidates = [
    creative,
    {
      id: 'budget:portfolio',
      module: 'budget',
      kind: 'budget_move',
      trigger: null,
      adset_id: LKL,
      adset_name: 'AV CAMACHO // AGOSTO - LKL',
      impact_per_day: 1.2,
      impact_unit: 'currency',
      results_per_day: 0.06,
      impact_basis: '3 budget moves this cycle, valued at each ad set’s own cost per result',
      reason:
        'Earned a larger share of the pool than its current budget. Truncated by the per-cycle velocity cap.',
      cta: { kind: 'queue_row', target_id: `budget:${LKL}` },
    },
    {
      id: `rec:${VARY}`,
      module: 'creative',
      kind: 'variate_creative',
      trigger: 'V1_vary_winner',
      adset_id: LKL,
      adset_name: 'AV CAMACHO // AGOSTO - LKL',
      impact_per_day: 0,
      impact_unit: 'currency',
      results_per_day: null,
      impact_basis: 'no sized impact yet',
      reason: 'One ad gets leads at 29.10; the rest of the ad set at 164. Make variants of it.',
      cta: { kind: 'queue_row', target_id: `rec:${VARY}` },
    },
  ];
  brief.secondary = ['budget:portfolio', `rec:${VARY}`];
  return body as unknown as Body;
}

/** The same cycle as the engine writes it once C2 carries its winner (`evidence.winner`): the
 *  winning ad's own 29.10 per lead against its sibling's 163.68, the figures the reason quotes. */
function pruebaCycleWinner(): Body {
  const body = pruebaCycle() as { recommendations: Array<Record<string, unknown>> };
  const vary = body.recommendations.find((rec) => rec.id === VARY);
  if (!vary) throw new Error('prueba cycle lost its vary-the-winner recommendation');
  Object.assign(vary, {
    trigger: 'C2_creative_winner',
    ad_id: '120210000000000077',
    evidence: {
      metric: 'cpp',
      value: 29.1,
      comparator: 'vs 164 (5.63x) for a sibling creative, same audience and budget',
      threshold: null,
      window: 'd14',
      estImpactPerDay: null,
      headline: {
        kind: 'efficiency',
        value: 82,
        unit: 'percent',
        label: 'cheaper per result than a peer',
        from: 29.1,
        to: 163.68,
      },
      winner: {
        ad_id: '120210000000000077',
        ad_name: 'AV CAMACHO // AGOSTO - LKL - Copy',
        cost_per_result: 29.1,
        results: 26,
        spend: 756.6,
      },
      source: 'engine',
    },
  });
  return body as unknown as Body;
}

export const REAL_BODIES = {
  formularios: formularios as unknown as Body,
  prueba: prueba as unknown as Body,
  pruebaCycle: pruebaCycle(),
  pruebaCycleWinner: pruebaCycleWinner(),
  mensajes: mensajes as unknown as Body,
  tours: tours as unknown as Body,
} as const;

export type RealBodyName = keyof typeof REAL_BODIES;

/** The body read the way the Performance tab reads it, with an empty daily series — the
 *  saved bodies carry none, so the calm card falls to the cycle's ad sets. */
export function readBody(name: RealBodyName): {
  report: ParsedCycleRunReport;
  view: HeroView;
  dailyTotal: number | null;
} {
  const body = REAL_BODIES[name];
  const report = parseReport(body as unknown as CycleRunReport);
  if (!report) throw new Error(`${name}: body did not parse`);
  const portfolio = body.portfolio as { objective: string; daily_total: number | null };
  const view = buildHeroView({
    report,
    recap: {
      source: 'daily',
      windowUsed: null,
      current: {
        spend: 0,
        results: 0,
        impressions: 0,
        clicks: 0,
        costPerResult: null,
        daysCovered: 14,
      },
      previous: null,
      series: [],
      delta: { spend: null, results: null, costPerResult: null },
      vsTarget: null,
    } as never,
    flightPacing: null,
    metric: getOptimizationMetricDefinition(portfolio.objective as never),
    currency: null,
    portfolio: portfolio as never,
    target: null,
    window: 'd14',
    firstCycle: false,
  });
  return { report, view, dailyTotal: portfolio.daily_total };
}
