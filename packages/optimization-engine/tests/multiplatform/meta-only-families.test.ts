// G8 F2 and F3 (P16). F2: the P-family pause triggers fired on Google campaigns, and an Approve
// on one drained into the Meta ad-set writer with a Google campaign id. F3: a PMax inside its
// 14-day protection was starved by a pause/cut trigger and the solver cut it 35%.
import { describe, expect, test } from 'bun:test';
import type { MultiPlatformSnapshot } from '@continuum/contracts';
import {
  type AdSetSnapshot,
  DCO_ADAPTED_TEMPLATES,
  evaluateRules,
  evaluateTriggers,
  instantiateTemplate,
  mapMultiPlatformSnapshotToAdSet,
  resolveConfig,
  runCycle,
  seedParityRules,
} from '../../src';

const window = (spend: number, leads: number) => ({
  spend,
  purchases: 0,
  addToCarts: 0,
  clicks: 100,
  impressions: 5000,
  leads,
});

/** Easy Fit's Google shape: Search campaigns on a lead goal, in MXN. */
function google(
  id: string,
  windows: MultiPlatformSnapshot['windows'],
  over: Partial<MultiPlatformSnapshot> = {},
): MultiPlatformSnapshot {
  const ref = {
    platform: 'google_ads' as const,
    level: 'campaign' as const,
    nativeLevel: 'campaign' as const,
    id,
    accountId: '5251780631',
  };
  return {
    platform: 'google_ads',
    level: 'campaign',
    native_level: 'campaign',
    id,
    accountId: '5251780631',
    name: `Campaign ${id}`,
    automation: 'manual',
    budget: { kind: 'daily', minor: 70_000, currency: 'MXN', shared: false, ownerRef: ref },
    bidding: { strategyType: 'MAXIMIZE_CONVERSIONS', systemStatus: 'ENABLED' },
    windows,
    ...over,
  };
}

const mapped = (s: MultiPlatformSnapshot, ageDays = 30, channelType = 'SEARCH'): AdSetSnapshot =>
  mapMultiPlatformSnapshotToAdSet(s, { ageDays, kpiField: 'leads', channelType });

// A healthy campaign that sets the reference, one 4× its cost per lead (P2), and one that spent
// 700 MXN over 14 days with no lead at all (P1 over 3 days, P3 over 14).
const healthy = mapped(
  google('24331887298', { d3: window(300, 12), d7: window(700, 28), d14: window(1400, 56) }),
);
const poor = mapped(
  google('24321097869', { d3: window(300, 3), d7: window(700, 7), d14: window(1400, 14) }),
);
const dead = mapped(
  google('20249528111', { d3: window(150, 0), d7: window(350, 0), d14: window(700, 0) }),
);
const roster = [healthy, poor, dead];
const isPFamily = (trigger: string | undefined) => /^(rule:)?P[123]_/.test(trigger ?? '');

describe('F2 — the pause family judges Meta entities only', () => {
  test('a Google-only cycle proposes no pause on a Google campaign', () => {
    const cycle = runCycle(roster, {
      objective: 'lead',
      config: { currency: 'MXN', cpaTarget: 50 },
    });
    expect(cycle.recommendations.filter((r) => r.kind === 'pause')).toEqual([]);
    expect(cycle.recommendations.some((r) => isPFamily(r.trigger))).toBe(false);
    // Skipped by name, like every other family a Google entity cannot be judged by.
    expect(
      cycle.ruleSkips?.filter((s) => s.family === 'pause').map((s) => `${s.adSetId}:${s.reason}`),
    ).toEqual(roster.map((s) => `${s.id}:not_applicable:google_ads`));
  });

  test('evaluateTriggers itself refuses a Google entity, whoever calls it', () => {
    const out = evaluateTriggers(roster, resolveConfig({ objective: 'lead', cpaTarget: 50 }));
    expect(out.recommendations).toEqual([]);
    expect(out.starveIds.size).toBe(0);
  });

  test('the rules layer: P-family and fatigue-kind rules skip Google, budget levers do not', () => {
    const cfg = resolveConfig({ objective: 'lead', cpaTarget: 50 });
    const rules = [
      ...seedParityRules(cfg),
      ...DCO_ADAPTED_TEMPLATES.map((t) => instantiateTemplate(t, cfg)),
    ];
    const out = evaluateRules(roster, rules, cfg);
    expect(out.findings).toEqual([]);
    // dco_starve_dead_spend is a budget lever with no Meta write behind it: it still applies.
    expect(out.starveIds.has(dead.id)).toBe(true);
  });

  test('a Meta ad set beside them is still paused', () => {
    const meta: AdSetSnapshot = {
      id: 'meta-dead',
      status: 'active',
      currentBudget: 100,
      ageDays: 30,
      kpiField: 'leads',
      windows: { d3: window(150, 0), d7: window(350, 0), d14: window(700, 0) },
    };
    const cycle = runCycle([meta, ...roster], {
      objective: 'lead',
      config: { currency: 'MXN', cpaTarget: 50 },
    });
    const pauses = cycle.recommendations.filter((r) => r.kind === 'pause');
    expect(pauses.map((r) => r.adSetId)).toEqual(['meta-dead']);
  });
});

describe('F3 — a PMax inside its 14-day protection is never cut', () => {
  const pmax = mapped(
    google(
      '22980224558',
      { d3: window(150, 0), d7: window(350, 0), d14: window(700, 0) },
      { automation: 'pmax', name: 'PMax' },
    ),
    10,
    'PERFORMANCE_MAX',
  );

  test('a starve (here the dead-spend rule) does not override its grace', () => {
    const cfg = resolveConfig({ objective: 'lead', cpaTarget: 50 });
    const starve = DCO_ADAPTED_TEMPLATES.find((t) => t.templateId === 'dco_starve_dead_spend')!;
    const cycle = runCycle([healthy, pmax], {
      objective: 'lead',
      config: { currency: 'MXN', cpaTarget: 50 },
      rules: [instantiateTemplate(starve, cfg)],
    });
    // The rule matched — this is the starve that used to win over grace.
    expect(
      cycle.ruleEvaluations.some((e) => e.adSetId === pmax.id && e.matched && !e.deduped),
    ).toBe(true);
    const item = cycle.reallocation.items.find((i) => i.id === pmax.id)!;
    expect(item.status).toBe('grace');
    expect(item.finalBudget).toBeGreaterThanOrEqual(pmax.currentBudget);
  });

  test('G8 F3 shape: 13 days, P2-poor, beside a Meta winner — no cut is possible; day 14 it is', () => {
    // Vivo's SALES-PMAX-OCTUBRE was 13.2 days old (ingest floors it to 13) with a cost per
    // result far over the portfolio's best: P2 used to starve it, and the solver's lower bound
    // was the normal -35% (292.5 of 450).
    const poorPmax = (ageDays: number) =>
      mapped(
        google(
          'pmax-f3',
          { d3: window(150, 0), d7: window(350, 1), d14: window(700, 2) },
          { automation: 'pmax', name: 'SALES-PMAX-OCTUBRE' },
        ),
        ageDays,
        'PERFORMANCE_MAX',
      );
    const metaWinner: AdSetSnapshot = {
      id: 'meta-winner',
      status: 'active',
      currentBudget: 300,
      ageDays: 30,
      kpiField: 'leads',
      windows: { d3: window(300, 12), d7: window(700, 28), d14: window(1400, 56) },
    };
    const cycleAt = (ageDays: number) =>
      runCycle([metaWinner, healthy, poorPmax(ageDays)], {
        objective: 'lead',
        config: { currency: 'MXN', cpaTarget: 50 },
      });

    const graced = cycleAt(13);
    expect(graced.recommendations.filter((r) => r.adSetId === 'pmax-f3')).toEqual([]);
    const held = graced.reallocation.items.find((i) => i.id === 'pmax-f3')!;
    expect(held.status).toBe('grace');
    expect(held.lowerBound).toBeGreaterThanOrEqual(held.currentBudget);

    const ended = cycleAt(14).reallocation.items.find((i) => i.id === 'pmax-f3')!;
    expect(ended.status).not.toBe('grace');
    expect(ended.lowerBound).toBeLessThan(ended.currentBudget);
  });

  test('with the parity rules and the built-in triggers, no pause and no cut', () => {
    const cfg = resolveConfig({ objective: 'lead', cpaTarget: 50 });
    const cycle = runCycle([healthy, pmax], {
      objective: 'lead',
      config: { currency: 'MXN', cpaTarget: 50 },
      rules: seedParityRules(cfg),
    });
    expect(
      cycle.recommendations.filter((r) => r.adSetId === pmax.id && r.kind === 'pause'),
    ).toEqual([]);
    const item = cycle.reallocation.items.find((i) => i.id === pmax.id)!;
    expect(item.finalBudget).toBeGreaterThanOrEqual(pmax.currentBudget);
  });
});
