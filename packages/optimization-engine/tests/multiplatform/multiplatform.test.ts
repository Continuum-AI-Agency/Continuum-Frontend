import { describe, expect, test } from 'bun:test';
import type { MultiPlatformSnapshot } from '@continuum/contracts';
import {
  type AdSetSnapshot,
  type CrossPlatformLeg,
  type CrossPlatformMember,
  classifyStatus,
  crossPlatformMove,
  isPlatformLearning,
  mapMultiPlatformSnapshotToAdSet,
  platformCapabilities,
  platformCaps,
  resolveConfig,
  runCycle,
} from '../../src';

const window = (spend: number, leads: number) => ({
  spend,
  purchases: 0,
  addToCarts: 0,
  clicks: 100,
  impressions: 5000,
  leads,
});

function googleSnapshot(over: Partial<MultiPlatformSnapshot> = {}): MultiPlatformSnapshot {
  const ref = {
    platform: 'google_ads' as const,
    level: 'campaign' as const,
    nativeLevel: 'campaign' as const,
    id: 'g1',
    accountId: '111',
  };
  return {
    platform: 'google_ads',
    level: 'campaign',
    native_level: 'campaign',
    id: 'g1',
    accountId: '111',
    name: 'Search',
    automation: 'manual',
    budget: { kind: 'daily', minor: 70_000, currency: 'MXN', shared: false, ownerRef: ref },
    bidding: { strategyType: 'MAXIMIZE_CONVERSIONS', systemStatus: 'ENABLED' },
    windows: { d3: window(300, 9), d7: window(700, 20), d14: window(1400, 40) },
    ...over,
  };
}

const context = { ageDays: 30, kpiField: 'leads' as const, channelType: 'SEARCH' };

describe('mapMultiPlatformSnapshotToAdSet', () => {
  test('maps budget to major units and leaves Meta-only fields undefined, never zero', () => {
    const s = mapMultiPlatformSnapshotToAdSet(googleSnapshot(), context);
    expect(s.currentBudget).toBe(700);
    expect(s.platform).toBe('google_ads');
    expect(s.windows.d7.leads).toBe(20);
    for (const key of [
      'delivery',
      'creative',
      'creativeSeries',
      'daily',
      'frequency7d',
      'optimization_goal',
      'bid_strategy',
    ] as const) {
      expect(key in s).toBe(false);
    }
    expect('reach' in s.windows.d7).toBe(false);
    expect(s.freeze).toBeUndefined();
  });

  test('null kpiField freezes kpi_mismatch; null age locks the entity as brand new', () => {
    const s = mapMultiPlatformSnapshotToAdSet(googleSnapshot(), {
      ...context,
      kpiField: null,
      ageDays: null,
    });
    expect(s.freeze).toBe(true);
    expect(s.freezeReason).toBe('kpi_mismatch');
    expect(s.ageDays).toBe(0);
    expect(s.ageUnknown).toBe(true);
  });

  test('Video is read-only, Smart and unknown channels are unsupported, shared budgets are held', () => {
    const video = mapMultiPlatformSnapshotToAdSet(googleSnapshot(), {
      ...context,
      channelType: 'VIDEO',
    });
    expect([video.freezeReason, video.platformHold]).toEqual([
      'unsupported_budget',
      'platform_readonly',
    ]);
    const smart = mapMultiPlatformSnapshotToAdSet(googleSnapshot(), {
      ...context,
      channelType: 'SMART',
    });
    expect(smart.platformHold).toBe('unsupported_channel');
    const unknown = mapMultiPlatformSnapshotToAdSet(googleSnapshot(), {
      ...context,
      channelType: null,
    });
    expect(unknown.platformHold).toBe('unsupported_channel');
    const base = googleSnapshot();
    const shared = mapMultiPlatformSnapshotToAdSet(
      { ...base, budget: { ...base.budget, shared: true } },
      context,
    );
    expect([shared.freezeReason, shared.platformHold]).toEqual([
      'unsupported_budget',
      'shared_budget',
    ]);
  });
});

describe('per-platform learning', () => {
  const cfg = resolveConfig({ objective: 'lead' });
  const base: AdSetSnapshot = {
    id: 'x',
    status: 'active',
    currentBudget: 100,
    ageDays: 30,
    windows: { d3: window(30, 1), d7: window(70, 3), d14: window(140, 6) },
  };

  test('Meta keeps the 50-event proxy; Google reads its bid strategy; TikTok infers 25 / 7', () => {
    expect(isPlatformLearning(base, cfg)).toBe(true);
    expect(
      isPlatformLearning(
        {
          ...base,
          platform: 'google_ads',
          bidding: { strategyType: 'X', systemStatus: 'ENABLED' },
        },
        cfg,
      ),
    ).toBe(false);
    expect(
      isPlatformLearning(
        {
          ...base,
          platform: 'google_ads',
          bidding: { strategyType: 'X', systemStatus: 'LEARNING_NEW' },
        },
        cfg,
      ),
    ).toBe(true);
    const tiktok: AdSetSnapshot = { ...base, platform: 'tiktok_ads', kpiField: 'leads' };
    expect(isPlatformLearning(tiktok, cfg, 25)).toBe(false);
    expect(isPlatformLearning(tiktok, cfg, 24)).toBe(true);
    expect(isPlatformLearning({ ...tiktok, ageDays: 6 }, cfg, 100)).toBe(true);
    expect(
      classifyStatus(
        {
          ...base,
          platform: 'google_ads',
          bidding: { strategyType: 'X', systemStatus: 'ENABLED' },
        },
        cfg,
      ),
    ).toBe('active');
  });

  test('PMax is protected 14 days', () => {
    const pmax: AdSetSnapshot = {
      ...base,
      ageDays: 10,
      platform: 'google_ads',
      automation: 'pmax',
    };
    expect(classifyStatus(pmax, cfg)).toBe('grace');
    expect(classifyStatus({ ...pmax, automation: 'manual' }, cfg)).not.toBe('grace');
  });

  test('caps: Meta/Google from the profile with the 8% learning cut, TikTok its own', () => {
    expect(platformCaps('meta', 'lead', false)).toMatchObject({ upPct: 0.25, downPct: 0.35 });
    expect(platformCaps('google_ads', 'lead', true)).toMatchObject({ upPct: 0.25, downPct: 0.08 });
    expect(platformCaps('tiktok_ads', 'lead', false)).toMatchObject({
      upPct: 0.2,
      downPct: 0.5,
      minDaysBetweenChanges: 2,
    });
  });
});

describe('platformCapabilities and the cycle', () => {
  test('Meta keeps every family; Google skips the Meta-only ones by name', () => {
    const meta = platformCapabilities('meta', 'manual');
    expect(Object.values(meta.rules).every((r) => r.applies)).toBe(true);
    const google = platformCapabilities('google_ads', 'pmax');
    expect(google.descendToGroups).toBe(false);
    expect(google.rules.creative).toEqual({ applies: false, reason: 'not_applicable:google_ads' });
    expect(platformCapabilities('tiktok_ads', 'manual').rules.fatigue.applies).toBe(true);
  });

  test('a mixed roster carries ruleSkips; a Meta-only one does not carry the key', () => {
    const meta: AdSetSnapshot = {
      id: 'm',
      status: 'active',
      currentBudget: 100,
      ageDays: 30,
      kpiField: 'leads',
      windows: { d3: window(30, 3), d7: window(70, 7), d14: window(140, 14) },
    };
    const google = mapMultiPlatformSnapshotToAdSet(googleSnapshot(), context);
    const metaOnly = runCycle([meta], { objective: 'lead' });
    expect('ruleSkips' in metaOnly).toBe(false);
    const mixed = runCycle([meta, google], { objective: 'lead' });
    expect(mixed.ruleSkips?.filter((s) => s.adSetId === 'g1').map((s) => s.reason)).toEqual([
      'not_applicable:google_ads',
      'not_applicable:google_ads',
      'not_applicable:google_ads',
    ]);
  });
});

function member(over: Partial<CrossPlatformMember> & { id: string }): CrossPlatformMember {
  return {
    name: over.id,
    currentBudget: 100,
    d7: { spend: 700, results: 20 },
    costPerResult: 35,
    ageDays: 30,
    frozen: false,
    starved: false,
    learning: false,
    learningLimited: false,
    deliveryState: 'serving',
    daysSinceBudgetChange: 10,
    attributionMatches: true,
    spendToday: null,
    ...over,
  };
}

function legs(tiktokCost: number, metaCost = 30): CrossPlatformLeg[] {
  return [
    {
      platform: 'tiktok_ads',
      currency: 'MXN',
      reportedD7: null,
      members: [
        member({
          id: 't1',
          currentBudget: 1000,
          d7: { spend: tiktokCost * 10, results: 10 },
          costPerResult: tiktokCost,
        }),
      ],
    },
    {
      platform: 'meta',
      currency: 'MXN',
      reportedD7: null,
      members: [
        member({
          id: 'm1',
          d7: { spend: metaCost * 10, results: 10 },
          costPerResult: metaCost - 5,
        }),
        member({ id: 'm2', d7: { spend: metaCost * 10, results: 10 }, costPerResult: metaCost }),
      ],
    },
  ];
}

const target = { amount: 35, currency: 'MXN' };

const lead = (
  l: CrossPlatformLeg[],
  autopilot?: Parameters<typeof crossPlatformMove>[0]['autopilot'],
) =>
  crossPlatformMove({
    objective: 'lead',
    portfolioCurrency: 'MXN',
    cpaTarget: target,
    legs: l,
    autopilot,
  });

function proposalOf(r: ReturnType<typeof crossPlatformMove>) {
  if (r.outcome !== 'proposal') throw new Error(`${r.refusal}: ${r.reason}`);
  return r;
}

const minor = (v: number) => Math.round(v * 100);
const decreaseMinor = (r: ReturnType<typeof proposalOf>) =>
  r.legs
    .filter((l) => l.direction === 'decrease')
    .reduce((a, l) => a + minor(l.from) - minor(l.to), 0);
const increaseMinor = (r: ReturnType<typeof proposalOf>) =>
  r.legs
    .filter((l) => l.direction === 'increase')
    .reduce((a, l) => a + minor(l.to) - minor(l.from), 0);

describe('crossPlatformMove (G27)', () => {
  test('fires at 1.5× and not at 1.49× — on each platform’s aggregate d7', () => {
    expect(lead(legs(45)).outcome).toBe('proposal');
    expect(lead(legs(44.7))).toMatchObject({ outcome: 'refusal', refusal: 'below_threshold' });
  });

  test('platform against platform: every eligible entity of each side moves by one percentage, decreases first', () => {
    const l = legs(60);
    l[0]!.members.push(
      member({ id: 't2', currentBudget: 400, d7: { spend: 600, results: 10 }, costPerResult: 60 }),
    );
    // A Meta ad set that buys above its platform's average still receives: the comparison is
    // the platform, never one entity against another.
    l[1]!.members.push(member({ id: 'm3', currentBudget: 60, costPerResult: 100 }));
    const r = proposalOf(lead(l));
    expect(r.legs.map((x) => [x.leg, x.direction, x.entityId, x.from, x.to])).toEqual([
      [1, 'decrease', 't1', 1000, 953.57],
      [2, 'decrease', 't2', 400, 381.43],
      [3, 'increase', 'm1', 100, 125],
      [4, 'increase', 'm2', 100, 125],
      [5, 'increase', 'm3', 60, 75],
    ]);
    expect(r.amountMinor).toBe(6500);
    expect(decreaseMinor(r)).toBe(6500);
    expect(increaseMinor(r)).toBe(6500);
    expect(r.receiverPct).toBe(0.25);
    expect(r.donorPct).toBeCloseTo(6500 / 140_000, 10);
    expect(r.bindingCap).toMatchObject({ side: 'receiver', platform: 'meta', pct: 0.25 });
    expect(r.rounding.donor).toEqual({ remainderMinor: 1, assignedTo: ['t1'] });
    expect(r.rounding.receiver).toEqual({ remainderMinor: 0, assignedTo: [] });
    expect(
      r.legs
        .filter((x) => x.direction === 'increase')
        .every((x) => x.waitsFor === 'decrease_applied'),
    ).toBe(true);
    expect(r.reason).toContain('Every eligible TikTok ad group goes down 4.64% (2 ad groups)');
    expect(r.reason).toContain('every eligible Meta ad set goes up 25.00% (3 ad sets)');
  });

  test('binding cap: a learning Meta ad set holds the WHOLE donor side to 8%, never a percentage per entity', () => {
    const l: CrossPlatformLeg[] = [
      {
        platform: 'meta',
        currency: 'MXN',
        reportedD7: { spend: 1200, results: 20 },
        members: [
          member({ id: 'mLearning', currentBudget: 100, learning: true }),
          member({ id: 'mOut', currentBudget: 300 }),
        ],
      },
      {
        platform: 'google_ads',
        currency: 'MXN',
        reportedD7: { spend: 600, results: 20 },
        members: [member({ id: 'g1', currentBudget: 2000 })],
      },
    ];
    const r = proposalOf(lead(l));
    expect(r.bindingCap).toMatchObject({
      side: 'donor',
      platform: 'meta',
      entityId: 'mLearning',
      pct: 0.08,
    });
    expect(r.donorPct).toBe(0.08);
    expect(r.legs.map((x) => [x.entityId, x.to])).toEqual([
      ['mOut', 276],
      ['mLearning', 92],
      ['g1', 2032],
    ]);
    expect(r.reason).toContain('mLearning holds the decrease to 8.00%');
  });

  test('the remainder: totals equal to the minor unit, the extra units assigned by fraction then id, and stated', () => {
    const l: CrossPlatformLeg[] = [
      {
        platform: 'tiktok_ads',
        currency: 'MXN',
        reportedD7: { spend: 1800, results: 30 },
        members: ['t3', 't1', 't2'].map((id) => member({ id, currentBudget: 1000 })),
      },
      {
        platform: 'meta',
        currency: 'MXN',
        reportedD7: { spend: 600, results: 20 },
        members: ['m1', 'm2'].map((id) => member({ id, currentBudget: 10.01 })),
      },
    ];
    const r = proposalOf(lead(l));
    expect(r.amountMinor).toBe(500);
    expect(r.rounding.donor).toEqual({ remainderMinor: 2, assignedTo: ['t1', 't2'] });
    expect(r.legs.map((x) => [x.entityId, x.to])).toEqual([
      ['t1', 998.33],
      ['t2', 998.33],
      ['t3', 998.34],
      ['m1', 12.51],
      ['m2', 12.51],
    ]);
    expect(decreaseMinor(r)).toBe(increaseMinor(r));
    expect(r.reason).toContain('Rounding: $0.02 MXN of the decrease went to t1, t2.');
  });

  test('dark, learning and frozen entities sit out on BOTH sides; throttled and learning-limited only receive nothing', () => {
    const l: CrossPlatformLeg[] = [
      {
        platform: 'tiktok_ads',
        currency: 'MXN',
        reportedD7: { spend: 1200, results: 20 },
        members: [
          member({ id: 't1', currentBudget: 1000 }),
          member({ id: 'tLearning', learning: true }),
          member({ id: 'tDark', deliveryState: 'dark' }),
          member({ id: 'tFrozen', frozen: true }),
          member({ id: 'tThrottled', deliveryState: 'throttled', currentBudget: 200 }),
        ],
      },
      {
        platform: 'google_ads',
        currency: 'MXN',
        reportedD7: { spend: 600, results: 20 },
        members: [
          member({ id: 'g1', currentBudget: 200 }),
          member({ id: 'gLearning', learning: true }),
          member({ id: 'gDark', deliveryState: 'dark' }),
          member({ id: 'gFrozen', frozen: true }),
          member({ id: 'gThrottled', deliveryState: 'throttled' }),
          member({ id: 'gLimited', learningLimited: true }),
        ],
      },
    ];
    const r = proposalOf(lead(l));
    expect(r.excludedDonors.map((x) => [x.entityId, x.reason])).toEqual([
      ['tLearning', 'learning'],
      ['tDark', 'dark'],
      ['tFrozen', 'frozen'],
    ]);
    expect(r.excludedReceivers.map((x) => [x.entityId, x.reason])).toEqual([
      ['gLearning', 'learning'],
      ['gDark', 'dark'],
      ['gFrozen', 'frozen'],
      ['gThrottled', 'throttled'],
      ['gLimited', 'learning_limited'],
    ]);
    expect(r.legs.map((x) => x.entityId)).toEqual(['t1', 'tThrottled', 'g1']);
  });

  test('a Meta ad set learning by the engine proxy still receives (scenario 11)', () => {
    const l = legs(60);
    l[1]!.members.push(member({ id: 'metaLearning', learning: true }));
    const r = proposalOf(lead(l));
    expect(r.legs.some((x) => x.entityId === 'metaLearning' && x.direction === 'increase')).toBe(
      true,
    );
  });

  test('refuses without a target in the portfolio currency, across currencies (decision 21), and under 10 results', () => {
    const base = { objective: 'lead' as const, portfolioCurrency: 'MXN', legs: legs(60) };
    expect(crossPlatformMove({ ...base, cpaTarget: null })).toMatchObject({
      refusal: 'missing_cpa_target',
    });
    expect(
      crossPlatformMove({ ...base, cpaTarget: { amount: 35, currency: 'USD' } }),
    ).toMatchObject({ refusal: 'missing_cpa_target' });
    const usd = legs(60).map((l, i) => (i === 0 ? { ...l, currency: 'USD' } : l));
    expect(crossPlatformMove({ ...base, cpaTarget: target, legs: usd })).toMatchObject({
      refusal: 'currency_mismatch',
    });
    const thin = legs(60);
    thin[0]!.members[0]!.d7 = { spend: 540, results: 9 };
    expect(crossPlatformMove({ ...base, cpaTarget: target, legs: thin })).toMatchObject({
      refusal: 'insufficient_platforms',
    });
  });

  test('autopilot: only an autopilot portfolio WITH budget_move on auto-applies; human approval is always recommended', () => {
    const off = proposalOf(lead(legs(60)));
    expect([off.needsApproval, off.autoApply]).toEqual([true, false]);
    expect(off.reason).toContain('Human approval is recommended for moves between platforms.');
    expect(off.reason).toContain('It waits for a person.');
    const scopeOnly = proposalOf(
      lead(legs(60), { portfolioInAutopilot: false, budgetMoveScope: true }),
    );
    const autopilotOnly = proposalOf(
      lead(legs(60), { portfolioInAutopilot: true, budgetMoveScope: false }),
    );
    expect([scopeOnly.autoApply, autopilotOnly.autoApply]).toEqual([false, false]);
    const on = proposalOf(lead(legs(60), { portfolioInAutopilot: true, budgetMoveScope: true }));
    expect([on.needsApproval, on.autoApply]).toEqual([false, true]);
    expect(on.reason).toContain('Human approval is recommended for moves between platforms.');
    expect(on.legs).toEqual(off.legs);
  });

  test('TikTok: a cut under 105% of today spend is scheduled for tomorrow; 2 days between changes', () => {
    const l = legs(60);
    l[0]!.members[0]!.spendToday = 990;
    const r = proposalOf(lead(l));
    expect(r.legs[0]!.timing).toBe('next_day');
    expect(r.legs.slice(1).every((x) => x.waitsFor === 'decrease_applied')).toBe(true);
    l[0]!.members[0]!.daysSinceBudgetChange = 1;
    expect(lead(l)).toMatchObject({ refusal: 'no_eligible_donor' });
  });
});

describe('runCycle runs the solver per platform', () => {
  test('a scored Google campaign beside Meta leaves every Meta final budget at its Meta-only value', () => {
    const meta = (id: string, budget: number, leads: number): AdSetSnapshot => ({
      id,
      status: 'active',
      currentBudget: budget,
      ageDays: 30,
      kpiField: 'leads',
      windows: {
        d3: window(budget * 3, leads * 0.4),
        d7: window(budget * 7, leads),
        d14: window(budget * 14, leads * 2),
      },
    });
    const metaRoster = [meta('m1', 100, 60), meta('m2', 120, 20), meta('m3', 80, 55)];
    const google = mapMultiPlatformSnapshotToAdSet(googleSnapshot(), context);
    expect(google.freeze).toBeUndefined();
    const opts = { objective: 'lead' as const, total: 300, config: { cpaTarget: 35 } };
    const alone = runCycle(metaRoster, opts);
    const mixed = runCycle([...metaRoster, google], opts);
    const finals = (c: typeof alone, ids: string[]) =>
      c.reallocation.items
        .filter((i) => ids.includes(i.id))
        .map((i) => Math.round(i.finalBudget * 100));
    expect(finals(mixed, ['m1', 'm2', 'm3'])).toEqual(finals(alone, ['m1', 'm2', 'm3']));
    const g = mixed.reallocation.items.find((i) => i.id === 'g1')!;
    expect(Math.round(g.finalBudget * 100)).toBe(70_000);
    expect(mixed.reallocation.totalBudget).toBe(1000);
    expect(mixed.reallocation.conserved).toBe(true);
  });
});
