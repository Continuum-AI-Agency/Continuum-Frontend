// A budget move follows efficiency RELATIVE TO WHAT EACH AD SET HAS TODAY.
//
// The solver used to target `pool × score ÷ Σscore`, which ignores the current budget: when the
// cheapest ad sets already hold most of the money (exactly what Meta does with its winners),
// their "share" came out below what they had and the engine cut them to fund pricier ones.
// The fixture is the real 2026-10-13 cycle of Easy Fit's "Conversaciones Whatsapp" portfolio
// (1,200 MXN/day, conversations): it cut ALEIRA (34.6 MXN per conversation, the cheapest) by 8 %
// and raised ITESO (50.1) by 25 %. Windows are rebuilt from that cycle's per-window scores and
// its 14-day event counts (d7 ≈ half, d3 ≈ 3/14).
import { expect, test } from 'bun:test';
import type { AdSetSnapshot, WindowMetrics } from '../src/index';
import { classifyPortfolio, classifyStatus, getObjectiveProfile, reallocate, resolveConfig, scoreAdSet } from '../src/index';

const win = (spend: number, conversations: number): WindowMetrics => ({
  spend,
  purchases: 0,
  addToCarts: 0,
  clicks: Math.round(conversations * 4),
  impressions: Math.round(spend * 40),
  conversations,
});

const WHATSAPP_2026_10_13 = [
  { name: "ALEIRA // AGOSTO - BAU - Mensajes", current: 269.79, d3: win(886.42, 21), d7: win(1705.11, 50), d14: win(3464.11, 100) },
  { name: "CA\u00d1ADAS // AGOSTO - BROAD - Mensajes", current: 212.12, d3: win(1286.25, 15), d7: win(2042.12, 35), d14: win(3722.5, 70) },
  { name: "CA\u00d1ADAS // AGOSTO - LKL - Mensajes", current: 163.09, d3: win(865.11, 22), d7: win(2562.13, 51), d14: win(3895.02, 102) },
  { name: "AV CAMACHO // AGOSTO - LKL - Mensajes", current: 150.07, d3: win(678.5, 14), d7: win(1609.22, 34), d14: win(3210.27, 67) },
  { name: "AV CAMACHO // AGOSTO - Broad - Mensajes", current: 140.89, d3: win(928.16, 14), d7: win(1487.71, 32), d14: win(3236.36, 63) },
  { name: "AV CAMACHO // AGOSTO - BAU - Mensajes", current: 125.02, d3: win(566.87, 12), d7: win(1508.61, 27), d14: win(2865.24, 54) },
  { name: "ITESO // AGOSTO - BROAD - Mensajes", current: 104.49, d3: win(1351.16, 12), d7: win(1372.36, 27), d14: win(2705.68, 54) },
];

const profile = getObjectiveProfile('conversations');
const cfg = resolveConfig({ kpiField: profile.kpiField, upperFunnelField: profile.upperFunnelField, cpaTarget: 30 });

const snapshots = (status: AdSetSnapshot['status']): AdSetSnapshot[] =>
  WHATSAPP_2026_10_13.map((r, i) => ({
    id: `as-${i}`,
    name: r.name,
    status,
    currentBudget: r.current,
    ageDays: 60,
    windows: { d3: r.d3, d7: r.d7, d14: r.d14 },
  }));

const spendWeightedComposite = (snaps: AdSetSnapshot[]): number => {
  const total = snaps.reduce((s, x) => s + x.currentBudget, 0);
  return snaps.reduce((s, x) => s + x.currentBudget * scoreAdSet(x, cfg).composite, 0) / total;
};

for (const status of ['active', 'learning'] as const) {
  test(`${status}: an ad set better than the portfolio never loses budget, a worse one never gains`, () => {
    const snaps = snapshots(status);
    const avg = spendWeightedComposite(snaps);
    const result = reallocate(snaps, 1200, { kpiField: profile.kpiField, upperFunnelField: profile.upperFunnelField, cpaTarget: 30 });
    expect(result.conserved).toBe(true);
    for (const item of result.items) {
      const snap = snaps.find((s) => s.id === item.id)!;
      const better = scoreAdSet(snap, cfg).composite > avg;
      if (better) expect(item.changeAbs).toBeGreaterThanOrEqual(-1e-6);
      else expect(item.changeAbs).toBeLessThanOrEqual(1e-6);
    }
  });
}

test('the cheapest ad set gains and the dearest loses on the real WhatsApp cycle', () => {
  const result = reallocate(snapshots('active'), 1200, { kpiField: profile.kpiField, upperFunnelField: profile.upperFunnelField, cpaTarget: 30 });
  const byName = new Map(result.items.map((i, k) => [WHATSAPP_2026_10_13[k].name, i]));
  expect(byName.get('ALEIRA // AGOSTO - BAU - Mensajes')!.changeAbs).toBeGreaterThan(0);
  expect(byName.get('ITESO // AGOSTO - BROAD - Mensajes')!.changeAbs).toBeLessThan(0);
  expect(byName.get('CAÑADAS // AGOSTO - BROAD - Mensajes')!.changeAbs).toBeLessThan(0);
});

test('equal budgets allocate exactly as before: the anchor is a no-op when every ad set holds the same', () => {
  const equal = snapshots('active').map((s) => ({ ...s, currentBudget: 1200 / 7 }));
  const result = reallocate(equal, 1200, { kpiField: profile.kpiField, upperFunnelField: profile.upperFunnelField, cpaTarget: 30 });
  const best = result.items.reduce((a, b) => (a.compositeScore > b.compositeScore ? a : b));
  const worst = result.items.reduce((a, b) => (a.compositeScore < b.compositeScore ? a : b));
  expect(best.changeAbs).toBeGreaterThan(0);
  expect(worst.changeAbs).toBeLessThan(0);
});

test('an ad set with no budget today still receives one (it is anchored on the eligible average)', () => {
  const snaps = snapshots('active');
  snaps[1] = { ...snaps[1], currentBudget: 0 };
  const result = reallocate(snaps, 1200, { kpiField: profile.kpiField, upperFunnelField: profile.upperFunnelField, cpaTarget: 30 });
  expect(result.items[1].finalBudget).toBeGreaterThan(0);
});

test('Meta: the learning stage the read carries decides, the conversion proxy only when no read', () => {
  const iteso = snapshots('active').find((x) => x.name === 'ITESO // AGOSTO - BROAD - Mensajes')!;
  const base: AdSetSnapshot = { ...iteso, status: 'active', platform: 'meta' };
  // ITESO: 54 conversations in 14 days → 27 in 7, under the 50-in-7-days proxy.
  const exited = { ...base, delivery: { blockers: [] } };
  expect(classifyStatus(exited, cfg)).toBe('active');
  const learning = { ...base, delivery: { blockers: [], learningStage: 'LEARNING' } };
  expect(classifyStatus(learning, cfg)).toBe('learning');
  const limited = { ...base, delivery: { blockers: [], learningStage: 'LEARNING_LIMITED' } };
  expect(classifyStatus(limited, cfg)).toBe('active');
  const noRead = { ...base, delivery: undefined };
  expect(classifyStatus(noRead, cfg)).toBe('learning');
});

// G5: the same rule on Google. b9cebbcf ("Leads // Google Ads only", Easy Fit, 670 MXN/day) on
// its 2026-10-16 cycle, rebuilt day by day from optimizer.entity_daily (latest as_of, counted
// leads): Search Octubre spent 2,329.92 MXN for 3 leads (776.64 each), PMax 2,158.74 for 22.97
// (93.98). Both started 2026-10-08, so on that day they were 8 days old — past the 3-day lock,
// and PMax inside its 14 days of protection.
const leadProfile = getObjectiveProfile('lead');
const leadCfg = { kpiField: leadProfile.kpiField, upperFunnelField: leadProfile.upperFunnelField };
const leadWin = (spend: number, leads: number): WindowMetrics => ({
  spend,
  purchases: 0,
  addToCarts: 0,
  clicks: Math.round(spend / 8),
  impressions: Math.round(spend * 30),
  leads,
});
const googleB9 = (over: Partial<AdSetSnapshot> = {}): AdSetSnapshot[] => [
  {
    id: '24321097869',
    name: 'Search | Octubre | Easy Fit',
    status: 'active',
    currentBudget: 350,
    ageDays: 8,
    platform: 'google_ads',
    level: 'campaign',
    automation: 'manual',
    windows: { d3: leadWin(0.11, 0), d7: leadWin(1630.15, 3), d14: leadWin(2329.92, 3) },
    ...over,
  },
  {
    id: '24321868026',
    name: 'PMax | Octubre | Easy Fit | Leads',
    status: 'active',
    currentBudget: 320,
    ageDays: 8,
    platform: 'google_ads',
    level: 'campaign',
    automation: 'pmax',
    windows: { d3: leadWin(9.12, 0), d7: leadWin(1558.5, 18.97), d14: leadWin(2158.74, 22.97) },
  },
];

test('Google: PMax inside its 14 days is protected — scored at the cohort average, never cut; with the other campaign active, nothing moves (b9cebbcf, 2026-10-16)', () => {
  const classified = classifyPortfolio(googleB9(), resolveConfig(leadCfg));
  expect(classified.map((s) => s.status)).toEqual(['active', 'grace']);
  const result = reallocate(classified, 670, leadCfg);
  expect(result.conserved).toBe(true);
  for (const item of result.items) expect(Math.abs(item.changeAbs)).toBeLessThan(0.01);
});

test('Google: past the protection the cheaper campaign gains and the dearer loses — the same days, PMax 15 days old', () => {
  const older = googleB9().map((s) => ({ ...s, ageDays: 15 }));
  const classified = classifyPortfolio(older, resolveConfig(leadCfg));
  expect(classified.map((s) => s.status)).toEqual(['active', 'active']);
  const result = reallocate(classified, 670, leadCfg);
  expect(result.conserved).toBe(true);
  const [search, pmax] = result.items;
  expect(search!.changeAbs).toBeLessThan(0);
  expect(pmax!.changeAbs).toBeGreaterThan(0);
});

test('Google: a bid strategy Google reports LEARNING caps the cut, as Meta learning does', () => {
  const learningCfg = resolveConfig(leadCfg);
  const classified = classifyPortfolio(
    googleB9({ bidding: { strategyType: 'MAXIMIZE_CONVERSIONS', systemStatus: 'LEARNING_NEW' } }),
    learningCfg,
  );
  expect(classified[0]!.status).toBe('learning');
  const [search] = reallocate(classified, 670, leadCfg).items;
  expect(search!.changeAbs).toBeLessThan(0);
  expect(search!.changeAbs).toBeGreaterThanOrEqual(-350 * learningCfg.learningReductionCapPct - 1e-6);
});

test('Google: PMax inside its 14 days is never cut, even beside a winner holding most of the money (gate-g5 1)', () => {
  // Grace only averages the score; the solver kept PMax's normal down-cap, so an 8-day PMax
  // beside a dominant winner went 300 → 210 (−30 %). PMax's protection is the whole point of
  // its 14 days: it may receive, it may not lose.
  const campaign = (id: string, current: number, spend: number, leads: number, over: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
    id,
    name: id,
    status: 'active',
    currentBudget: current,
    ageDays: 60,
    platform: 'google_ads',
    level: 'campaign',
    automation: 'manual',
    windows: { d3: leadWin(spend * 0.2, leads * 0.2), d7: leadWin(spend / 2, leads / 2), d14: leadWin(spend, leads) },
    ...over,
  });
  const roster = [
    campaign('winner', 1000, 7000, 140),
    campaign('search-b', 300, 2100, 14),
    campaign('pmax-young', 300, 2100, 20, { ageDays: 8, automation: 'pmax' }),
  ];
  const classified = classifyPortfolio(roster, resolveConfig(leadCfg));
  expect(classified.map((s) => s.status)).toEqual(['active', 'active', 'grace']);
  const pmax = reallocate(classified, 1600, leadCfg).items.find((i) => i.id === 'pmax-young')!;
  expect(pmax.finalBudget).toBeGreaterThanOrEqual(300 - 1e-6);
  expect(pmax.lowerBound).toBeGreaterThanOrEqual(300 - 1e-6);
});

test("Meta's grace is unchanged: a 3-day ad set keeps its normal down-cap", () => {
  const young = { ...snapshots('active')[6]!, status: 'grace' as const, ageDays: 3, platform: 'meta' as const };
  const roster = [...snapshots('active').slice(0, 6), young];
  const item = reallocate(roster, 1200, { kpiField: profile.kpiField, upperFunnelField: profile.upperFunnelField, cpaTarget: 30 }).items[6]!;
  expect(item.lowerBound).toBeLessThan(young.currentBudget);
});

// G5 follow-ups (gate-g5, "not blocking", picked up by G7).
const googleCampaign = (id: string, current: number, spend: number, leads: number, over: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
  id,
  name: id,
  status: 'active',
  currentBudget: current,
  ageDays: 60,
  platform: 'google_ads',
  level: 'campaign',
  automation: 'manual',
  windows: { d3: leadWin(spend * 0.2, leads * 0.2), d7: leadWin(spend / 2, leads / 2), d14: leadWin(spend, leads) },
  ...over,
});

test('Google: a graced campaign with no active peer holds its budget — a borrowed score is no efficiency basis (G5 follow-up)', () => {
  // b9cebbcf with Search still learning its bid strategy: nothing is active, so grace had only
  // Search's own composite to borrow, and the slack was split between them as if PMax had earned it.
  const classified = classifyPortfolio(
    googleB9({ bidding: { strategyType: 'MAXIMIZE_CONVERSIONS', systemStatus: 'LEARNING_NEW' } }),
    resolveConfig(leadCfg),
  );
  expect(classified.map((s) => s.status)).toEqual(['learning', 'grace']);
  const result = reallocate(classified, 790, leadCfg);
  const pmax = result.items.find((i) => i.id === '24321868026')!;
  expect(pmax.finalBudget).toBeCloseTo(320, 6);
  expect(result.items.find((i) => i.id === '24321097869')!.finalBudget).toBeCloseTo(470, 6);
  expect(result.notes.some((n) => n.includes('no active'))).toBe(true);
});

test('Google: lowering the total never cuts a graced PMax — the underflow relaxation keeps its protection (G5 follow-up)', () => {
  const roster = [
    googleCampaign('winner', 1000, 7000, 140),
    googleCampaign('search-b', 300, 2100, 14),
    googleCampaign('pmax-young', 300, 2100, 20, { ageDays: 8, automation: 'pmax' }),
  ];
  const classified = classifyPortfolio(roster, resolveConfig(leadCfg));
  expect(classified.map((s) => s.status)).toEqual(['active', 'active', 'grace']);
  const result = reallocate(classified, 1000, leadCfg);
  expect(result.feasibility.underflow).toBe(true);
  expect(result.conserved).toBe(true);
  expect(result.items.find((i) => i.id === 'pmax-young')!.finalBudget).toBeGreaterThanOrEqual(300 - 1e-6);
});

test('Google: a total under what the graced PMax alone holds is refused by name — every budget holds', () => {
  const roster = [
    googleCampaign('winner', 1000, 7000, 140),
    googleCampaign('pmax-young', 300, 2100, 20, { ageDays: 8, automation: 'pmax' }),
  ];
  const classified = classifyPortfolio(roster, resolveConfig(leadCfg));
  const result = reallocate(classified, 250, leadCfg);
  expect(result.refusal).toEqual({ reason: 'protected_above_total', protectedBudget: 300, totalBudget: 250 });
  for (const item of result.items) expect(item.finalBudget).toBe(item.currentBudget);
});
