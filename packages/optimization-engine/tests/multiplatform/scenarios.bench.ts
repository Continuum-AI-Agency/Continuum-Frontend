/**
 * optimizer multi-platform scenarios — engine-level bench.
 *
 *   bun packages/optimization-engine/tests/multiplatform/scenarios.bench.ts [--json]
 *
 * Loads scenarios.json and every fixture it names (REAL Google GAQL v25 and Meta prod
 * reads, DOC_SHAPED TikTok, SYNTHETIC where no source exists), then drives the engine's
 * multi-platform layer on them and asserts each engine-level scenario of
 * docs/optimizer-multiplatform/escenarios.html: the rule that fires or the refusal, by
 * name, both sides of every threshold it states. Scenario 24 runs the Meta-only portfolio
 * through this tree AND through the engine at git HEAD (main), and asserts the final
 * budgets are identical to the cent.
 *
 * Offline: no network, no database. Scenarios that only the Optimizer service or an
 * applier can decide are listed by name as NOT COVERED with the reason.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  type MultiPlatformSnapshot,
  MultiPlatformSnapshotSchema,
  PlatformCardSchema,
} from '@continuum/contracts';
import { Recorder } from '../../../../Continuum-Backend/scripts/_bench/recorder';
import type {
  AdSetSnapshot,
  CrossPlatformLeg,
  CrossPlatformMember,
  CrossPlatformMoveResult,
  CycleResult,
  OptimizationObjective,
  WindowMetrics,
} from '../../src';
import * as engine from '../../src';
import { runDeliveryScenarios } from './deliveryScenarios';
import {
  AS_OF,
  daysBetween,
  FIXTURE_DIR,
  googleCampaign,
  googleCampaigns,
  loadFixture,
  type MetaItem,
  metaMember,
  metaPortfolio,
  metaPortfolioD7,
  type TikTokAdGroupRead,
  tiktokAdGroup,
  tiktokAdGroups,
} from './fixtures';
import { runSignalScenarios } from './signalScenarios';

const ROOT = resolve(import.meta.dir, '../../../..');
const rec = new Recorder('optimizer:multiplatform:scenarios:bench');
const json = process.argv.includes('--json');

const cents = (v: number): number => Math.round(v * 100);
const near = (a: number, b: number, eps = 0.005): boolean => Math.abs(a - b) <= eps;
const LEAD_TARGET = { amount: 35, currency: 'MXN' };

function proposal(r: CrossPlatformMoveResult) {
  if (r.outcome !== 'proposal')
    throw new Error(`expected a G27 proposal, got ${r.refusal}: ${r.reason}`);
  return r;
}

// ---------------------------------------------------------------------------
// Catalog + fixtures
// ---------------------------------------------------------------------------

type ScenarioIndex = {
  scenarios: { id: number; title: string; fixtures: { file: string; kind: string }[] }[];
};
const index = loadFixture<never>('scenarios.json') as unknown as ScenarioIndex;
const files = [...new Set(index.scenarios.flatMap((s) => s.fixtures.map((f) => f.file)))];
const unreadable = files.filter((file) => {
  try {
    loadFixture(file);
    return !existsSync(join(FIXTURE_DIR, file));
  } catch {
    return true;
  }
});
rec.check(
  'catalog: scenarios.json and every fixture it names load',
  index.scenarios.length === 44 && unreadable.length === 0,
  `${index.scenarios.length} scenarios, ${files.length} fixtures${unreadable.length ? `, unreadable: ${unreadable.join(', ')}` : ''}`,
);

// ---------------------------------------------------------------------------
// Shared builders on top of the fixtures
// ---------------------------------------------------------------------------

const leadCfg = engine.resolveConfig({ objective: 'lead' });

function tiktokMapped(read: TikTokAdGroupRead): AdSetSnapshot {
  return engine.mapMultiPlatformSnapshotToAdSet(read.snapshot, {
    ageDays: read.ageDays,
    kpiField: read.kpiField,
    channelType: null,
  });
}

/** A TikTok ad group as G27 sees it: learning by TikTok's rule over its campaign's results. */
function tiktokMember(read: TikTokAdGroupRead, roster: TikTokAdGroupRead[]): CrossPlatformMember {
  const mapped = tiktokMapped(read);
  const campaignResults = engine.tiktokCampaignResults7d(roster.map(tiktokMapped), leadCfg);
  const d7 = read.snapshot.windows.d7;
  const results = d7.leads ?? 0;
  return {
    id: read.snapshot.id,
    name: read.snapshot.name ?? null,
    currentBudget: mapped.currentBudget,
    d7: { spend: d7.spend, results },
    costPerResult: results > 0 ? d7.spend / results : null,
    ageDays: read.ageDays,
    frozen: mapped.freeze === true,
    starved: false,
    learning: engine.isPlatformLearning(
      mapped,
      leadCfg,
      campaignResults.get(mapped.campaignId ?? ''),
    ),
    learningLimited: false,
    deliveryState: null,
    daysSinceBudgetChange: read.daysSinceModified,
    attributionMatches: read.attributionMatches,
    spendToday: read.spendToday,
  };
}

const formularios = metaPortfolio('formularios-todos');
const metaLeg: CrossPlatformLeg = {
  platform: 'meta',
  currency: formularios.portfolio.currency,
  reportedD7: metaPortfolioD7(formularios),
  members: formularios.performance.latest_items.map(metaMember),
};
const leadRoster = tiktokAdGroups().filter((g) => g.snapshot.campaignId === '7000000000000000101');
function tiktokLeg(ids: string[], roster = leadRoster): CrossPlatformLeg {
  return {
    platform: 'tiktok_ads',
    currency: 'MXN',
    reportedD7: null,
    members: roster.filter((g) => ids.includes(g.snapshot.id)).map((g) => tiktokMember(g, roster)),
  };
}
const easyFitSearchLeads = googleCampaign('easyfit2026', '24274603133');
function googleMember(
  c: (typeof easyFitSearchLeads)['snapshot'],
  d7: { spend: number; results: number },
): CrossPlatformMember {
  return {
    id: c.id,
    name: c.name ?? null,
    currentBudget: c.budget.minor / 100,
    d7,
    costPerResult: d7.results > 0 ? d7.spend / d7.results : null,
    ageDays: null,
    frozen: false,
    starved: false,
    learning: engine.isGoogleBidLearning(c.bidding?.systemStatus),
    learningLimited: false,
    deliveryState: null,
    daysSinceBudgetChange: null,
    attributionMatches: true,
    spendToday: null,
  };
}

function scenario01Input(over: Partial<{ tiktok: CrossPlatformLeg; meta: CrossPlatformLeg }> = {}) {
  const real = easyFitSearchLeads.snapshot.windows.d7;
  return {
    objective: 'lead' as const,
    portfolioCurrency: 'MXN',
    cpaTarget: LEAD_TARGET,
    legs: [
      over.meta ?? metaLeg,
      over.tiktok ??
        tiktokLeg(['7000000000000000201', '7000000000000000202', '7000000000000000203']),
      {
        platform: 'google_ads' as const,
        currency: 'MXN',
        reportedD7: null,
        members: [
          googleMember(easyFitSearchLeads.snapshot, {
            spend: real.spend,
            results: real.leads ?? 0,
          }),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 01 + 25 — G27 across three platforms; the dark Meta ad set never receives
// ---------------------------------------------------------------------------
{
  const r = engine.crossPlatformMove(scenario01Input());
  const p = proposal(r);
  rec.check(
    'e01: G27 fires at 1.50× (TikTok 65.72 vs Meta 43.81 per lead, d7)',
    p.rule === 'G27' &&
      p.donorPlatform === 'tiktok_ads' &&
      p.receiverPlatform === 'meta' &&
      near(p.costPerResult.donor, 65.72) &&
      near(p.costPerResult.receiver, 43.81) &&
      p.ratio >= 1.5 &&
      p.ratio < 1.501,
    `ratio ${p.ratio.toFixed(4)}, ${p.results.donor} vs ${p.results.receiver} results`,
  );
  const googleOut = p.excludedFromComparison.find(
    (x) => x.platform === 'google_ads' && x.entityId === null,
  );
  rec.check(
    'e01: Google with 0 results stays out of the comparison, not out of the portfolio',
    googleOut?.reason === 'insufficient_results' &&
      googleOut.entityId === null &&
      googleOut.results === 0,
  );
  const young = p.excludedFromComparison.find((x) => x.entityId === '7000000000000000203');
  rec.check(
    'e01: TikTok 203 (3 days old) is not priced into the comparison',
    young?.reason === 'young',
  );
  const decreases = p.legs.filter((l) => l.direction === 'decrease');
  const increases = p.legs.filter((l) => l.direction === 'increase');
  rec.check(
    'e01: every decrease comes before every increase (legs 1–2 TikTok, 3–9 Meta)',
    p.legs.length === 9 &&
      p.legs.every((l, i) => l.leg === i + 1) &&
      p.legs.slice(0, 2).every((l) => l.direction === 'decrease' && l.platform === 'tiktok_ads') &&
      p.legs.slice(2).every((l) => l.direction === 'increase' && l.platform === 'meta'),
    p.legs.map((l) => `${l.leg}:${l.direction[0]}:${l.entityName}`).join('; '),
  );
  rec.check(
    'e01: the donor is the whole TikTok platform — 201 and 202 both down 4.23%, the learning 203 sits out',
    decreases.map((l) => `${l.entityId}:${cents(l.from)}→${cents(l.to)}`).join(',') ===
      '7000000000000000201:40000→38307,7000000000000000202:100000→95768' &&
      near(p.donorPct, 5925 / 140_000, 1e-12) &&
      p.excludedDonors.some((x) => x.entityId === '7000000000000000203' && x.reason === 'learning'),
    decreases.map((l) => `${l.entityName} ${l.from}→${l.to} (${l.timing})`).join('; '),
  );
  rec.check(
    "e01: 202 spent 986 today, so its cut (957.68 < 1,035.30) is scheduled — and goes after 201's immediate one",
    decreases[0]!.timing === 'immediate' && decreases[1]!.timing === 'next_day',
  );
  const expected: [string, number, number][] = [
    ['ITESO // AGOSTO - BROAD', 67.91, 84.88],
    ['CAÑADAS // AGOSTO - LKL', 55.04, 68.8],
    ['CAÑADAS // AGOSTO - BROAD', 42.73, 53.41],
    ['ALEIRA // AGOSTO - BROAD', 18.73, 23.41],
    ['ALEIRA // AGOSTO - BAU', 17.96, 22.45],
    ['CAÑADAS // AGOSTO - BAU', 17.38, 21.72],
    ['ALEIRA // AGOSTO - LKL', 17.32, 21.65],
  ];
  rec.check(
    'e01: the receiver is the whole Meta platform — all 7 eligible ad sets up the same 24.99% (each within one minor unit), whatever their own cost per lead',
    increases.length === expected.length &&
      increases.every(
        (leg, i) =>
          leg.entityName === expected[i]![0] &&
          cents(leg.from) === cents(expected[i]![1]) &&
          cents(leg.to) === cents(expected[i]![2]) &&
          leg.waitsFor === 'decrease_applied' &&
          Math.abs(cents(leg.to) - cents(leg.from) - leg.from * p.receiverPct * 100) <= 1,
      ) &&
      near(p.receiverPct, 5925 / 23_707, 1e-12),
    increases.map((l) => `${l.entityName} ${l.from}→${l.to}`).join('; '),
  );
  rec.check(
    "e01: Meta's +25% binds (the 7 ad sets' floored caps sum to 59.25), not TikTok's −50% (700)",
    p.bindingCap.side === 'receiver' &&
      p.bindingCap.platform === 'meta' &&
      p.bindingCap.pct === 0.25,
    p.bindingCap.basis,
  );
  const off = (legs: typeof p.legs) =>
    legs.reduce((a, l) => a + Math.abs(cents(l.to) - cents(l.from)), 0);
  rec.check(
    'e01: the decrease total equals the increase total to the minor unit — 59.25 MXN/day',
    off(decreases) === off(increases) && off(decreases) === 5925 && p.amountMinor === 5925,
    `${p.amount} MXN/day`,
  );
  rec.check(
    'e01: the remainders are assigned by largest fraction then id, and stated in the reason',
    p.rounding.donor.remainderMinor === 1 &&
      p.rounding.donor.assignedTo.join() === '7000000000000000201' &&
      p.reason.includes('Rounding: $0.01 MXN of the decrease went to EF | Leads | Broad MX.') &&
      (p.rounding.receiver.remainderMinor === 0 ||
        p.reason.includes(
          `Rounding: $${(p.rounding.receiver.remainderMinor / 100).toFixed(2)} MXN of the increase`,
        )),
    `donor ${JSON.stringify(p.rounding.donor)}, receiver ${JSON.stringify(p.rounding.receiver)}`,
  );
  rec.check(
    'e01: FORMULARIOS is in autopilot with budget=true but no budget_move scope → one human approval, and the reason recommends it',
    p.needsApproval === true &&
      p.autoApply === false &&
      formularios.portfolio.apply_mode === 'autopilot' &&
      !('budget_move' in formularios.portfolio.autopilot_scopes) &&
      p.reason.includes('Human approval is recommended for moves between platforms.') &&
      p.reason.includes('It waits for a person.'),
  );
  const auto = proposal(
    engine.crossPlatformMove({
      ...scenario01Input(),
      autopilot: { portfolioInAutopilot: true, budgetMoveScope: true },
    }),
  );
  const paused = proposal(
    engine.crossPlatformMove({
      ...scenario01Input(),
      autopilot: { portfolioInAutopilot: false, budgetMoveScope: true },
    }),
  );
  rec.check(
    'e01: with budget_move ON and the portfolio in autopilot the same 9 legs auto-apply (decision 18); paused or not in autopilot, they wait',
    auto.autoApply === true &&
      auto.needsApproval === false &&
      JSON.stringify(auto.legs) === JSON.stringify(p.legs) &&
      auto.reason.includes('Human approval is recommended for moves between platforms.') &&
      paused.autoApply === false &&
      paused.needsApproval === true,
  );
  rec.check(
    'e25: ITESO // AGOSTO - LKL (dark 8 days, best d14 CPA 18.11) does not receive the move',
    p.excludedReceivers.some(
      (x) => x.entityName === 'ITESO // AGOSTO - LKL' && x.reason === 'dark',
    ) &&
      !p.legs.some((l) => l.entityName === 'ITESO // AGOSTO - LKL') &&
      formularios.performance.recommendations.some(
        (x) => x.trigger === 'D2_dark_with_budget' && x.adset_name === 'ITESO // AGOSTO - LKL',
      ),
  );
  rec.check(
    'e01: the starved ITESO // AGOSTO - RTG sits out; the dark and starved are the only Meta exclusions',
    p.excludedReceivers.map((x) => `${x.entityName}:${x.reason}`).join(',') ===
      'ITESO // AGOSTO - LKL:dark,ITESO // AGOSTO - RTG:starved',
    p.excludedReceivers.map((x) => `${x.entityName}:${x.reason}`).join(', '),
  );

  // The other side of the threshold: the same TikTok results at 1.49× do not move money.
  const below = engine.crossPlatformMove(
    scenario01Input({
      tiktok: {
        ...tiktokLeg(['7000000000000000201', '7000000000000000202']),
        reportedD7: { spend: 1.49 * (2102.68 / 48) * 21, results: 21 },
      },
    }),
  );
  rec.check(
    'e01: at 1.49× G27 does not fire (below_threshold)',
    below.outcome === 'refusal' &&
      below.refusal === 'below_threshold' &&
      near(below.ratio ?? 0, 1.49, 1e-6),
    below.reason,
  );
  const thin = engine.crossPlatformMove(
    scenario01Input({
      tiktok: { ...tiktokLeg(['7000000000000000202']), reportedD7: { spend: 690.03, results: 9 } },
    }),
  );
  rec.check(
    'e01: with 9 TikTok results (< 10) there is no comparison at all',
    thin.outcome === 'refusal' && thin.refusal === 'insufficient_platforms',
    thin.reason,
  );
  const d14 = tiktokAdGroups().filter((g) =>
    ['7000000000000000201', '7000000000000000202'].includes(g.snapshot.id),
  );
  const t14 =
    d14.reduce((a, g) => a + g.snapshot.windows.d14.spend, 0) /
    d14.reduce((a, g) => a + (g.snapshot.windows.d14.leads ?? 0), 0);
  const m14 = formularios.cpaSeries.at(-1)!;
  rec.check(
    'e01: at 14 days the gap is 1.4995× (64.81 vs 43.22) — the catalog\'s "same gap" sits a hair under 1.5×, so G27 stays a d7 rule',
    near(t14, 64.81) &&
      near(m14.spend_d14 / m14.conv_d14, 43.22) &&
      near(t14 / (m14.spend_d14 / m14.conv_d14), 1.4995, 0.0001),
    `${(t14 / (m14.spend_d14 / m14.conv_d14)).toFixed(4)}×`,
  );
}

// ---------------------------------------------------------------------------
// 01 (binding cap) — when the DONOR's cap is the tighter one, it sets the percentage
// ---------------------------------------------------------------------------
{
  // TikTok 202 alone gives (−50% = 500) against every Easy Fit Google campaign that can
  // take a raise (+25% of 2,255 = 563.75): TikTok binds, and every Google campaign goes up
  // the same 500 / 2,255 = 22.17% — never 25% on some and less on others.
  const synthetic = loadFixture<{ metrics: { cost: number; conversions: number } }>(
    'synthetic-google-easyfit-search-leads-7d.json',
  ).data;
  const easyFit = googleCampaigns('easyfit2026').map((c) => c.snapshot);
  const r = proposal(
    engine.crossPlatformMove({
      objective: 'lead',
      portfolioCurrency: 'MXN',
      cpaTarget: LEAD_TARGET,
      legs: [
        tiktokLeg(['7000000000000000202']),
        {
          platform: 'google_ads',
          currency: 'MXN',
          reportedD7: { spend: synthetic.metrics.cost, results: synthetic.metrics.conversions },
          members: easyFit.map((c) => googleMember(c, { spend: 0, results: 0 })),
        },
      ],
    }),
  );
  const increases = r.legs.filter((l) => l.direction === 'increase');
  rec.check(
    "e01-binding: TikTok's −50% binds (500 < 563.75): 202 goes 1,000 → 500, scheduled under the 105% floor",
    r.bindingCap.side === 'donor' &&
      r.bindingCap.platform === 'tiktok_ads' &&
      r.bindingCap.pct === 0.5 &&
      r.amountMinor === 50_000 &&
      cents(r.legs[0]!.to) === 50_000 &&
      r.legs[0]!.timing === 'next_day',
    r.bindingCap.basis,
  );
  rec.check(
    'e01-binding: five Google campaigns up the SAME 22.17% (each within one minor unit); GA 1 EASY (LEARNING_NEW) and the 0-budget YouTube campaign sit out',
    increases.length === 5 &&
      increases.every(
        (l) => Math.abs(cents(l.to) - cents(l.from) - (l.from * 50_000) / 2255) <= 1,
      ) &&
      increases.reduce((a, l) => a + cents(l.to) - cents(l.from), 0) === 50_000 &&
      r.excludedReceivers.map((x) => `${x.entityId}:${x.reason}`).join(',') ===
        '20653378244:no_budget,24298030946:learning',
    increases.map((l) => `${l.entityName} ${l.from}→${l.to}`).join('; ') +
      ` · remainder ${JSON.stringify(r.rounding.receiver)}`,
  );
}

// ---------------------------------------------------------------------------
// 02 + 27 — an unmapped objective is frozen; a different attribution window is not compared
// ---------------------------------------------------------------------------
{
  const messages = tiktokAdGroup('7000000000000000205');
  const mapped = tiktokMapped(messages);
  const conversionActions = loadFixture<{ conversionAction: { category: string } }[]>(
    'google-easyfit2026-conversionActions.json',
  ).data.map((r) => r.conversionAction.category);
  const googleConversations = conversionActions.filter((c) => /CONVERSATION|MESSAGE|CHAT/i.test(c));
  rec.check(
    'e02: Google has no conversion action that is a conversation, so its KPI resolves to null',
    googleConversations.length === 0 && conversionActions.length > 0,
    `${conversionActions.length} actions: ${[...new Set(conversionActions)].join(', ')}`,
  );
  const google = engine.mapMultiPlatformSnapshotToAdSet(
    googleCampaign('easyfit2026', '20249528111').snapshot,
    {
      ageDays: null,
      kpiField: null,
      channelType: 'SEARCH',
    },
  );
  rec.check(
    'e02: TikTok EF | Mensajes | Broad (CONVERSATION, not in the map) and the Google campaign are frozen kpi_mismatch',
    messages.kpiField === null &&
      mapped.freezeReason === 'kpi_mismatch' &&
      google.freezeReason === 'kpi_mismatch',
  );
  const cycle = engine.runCycle([mapped], {
    objective: 'conversations',
    config: { currency: 'MXN', cpaTarget: 30 },
  });
  const item = cycle.reallocation.items.find((i) => i.id === mapped.id)!;
  rec.check(
    'e02: in a cycle it keeps its budget, gets no recommendation, and the skipped families say not_applicable:tiktok_ads',
    cents(item.finalBudget) === cents(350) &&
      cycle.recommendations.every((r) => r.adSetId !== mapped.id) &&
      (cycle.ruleSkips ?? [])
        .filter((s) => s.adSetId === mapped.id)
        .map((s) => `${s.family}:${s.reason}`)
        .join(',') === 'delivery:not_applicable:tiktok_ads,creative:not_applicable:tiktok_ads',
  );
  const member = tiktokMember(messages, [messages]);
  rec.check(
    'e27: ONE_DAY click / OFF view attribution does not match Meta 7d/1d — 205 is never compared',
    messages.attributionMatches === false && member.attributionMatches === false,
  );
  const leg: CrossPlatformLeg = {
    platform: 'tiktok_ads',
    currency: 'MXN',
    reportedD7: null,
    members: [{ ...member, frozen: false }],
  };
  const excluded: engine.ComparisonExclusion[] = [];
  const priced = engine.legD7(leg, excluded);
  rec.check(
    'e27: even unfrozen, its 30 conversations are excluded from the TikTok d7 for attribution_mismatch',
    priced.results === 0 &&
      excluded.some(
        (x) => x.entityId === '7000000000000000205' && x.reason === 'attribution_mismatch',
      ),
  );
}

// ---------------------------------------------------------------------------
// 03 — PMax: campaign level, 14-day protection, a day may cost 2× the budget
// ---------------------------------------------------------------------------
{
  const pmax = googleCampaign('tangassi', '22980224558');
  const mapped = engine.mapMultiPlatformSnapshotToAdSet(pmax.snapshot, {
    ageDays: 10,
    kpiField: 'leads',
    channelType: pmax.channelType,
  });
  const caps = engine.platformCapabilities('google_ads', pmax.snapshot.automation);
  rec.check(
    'e03: Necesidades SLP maps at campaign level as pmax; the engine never descends to asset groups',
    mapped.level === 'campaign' &&
      mapped.automation === 'pmax' &&
      caps.descendToGroups === false &&
      caps.rules.creative.applies === false,
  );
  rec.check(
    'e03: PMax is protected 14 days (grace at 10 days, where a Search campaign would not be)',
    engine.protectDaysFor(mapped, leadCfg) === 14 &&
      engine.classifyStatus(mapped, leadCfg) === 'grace',
  );
  const daily = loadFixture<{ campaign: { id: string }; metrics: { costMicros: string } }[]>(
    'google-tangassi-campaignDaily14d.json',
  )
    .data.filter((r) => r.campaign.id === '22980224558')
    .map((r) => Number(r.metrics.costMicros) / 1e6);
  const atTwice = daily.filter((v) => v >= 239.995 && v < 240.5).length;
  const ceiling = engine.expectedDailySpendCeiling(pmax.snapshot);
  rec.check(
    'e03: a 120 MXN/day budget is a 240 MXN/day exposure — and the recording spent 240 on 4 of 14 days',
    ceiling === 240 && atTwice === 4 && Math.max(...daily) > 120,
    `max day ${Math.max(...daily).toFixed(2)} MXN`,
  );
}

// ---------------------------------------------------------------------------
// 04, 05, 06 — what the mapper holds: shared budgets, Video, Smart
// ---------------------------------------------------------------------------
{
  const vivo = googleCampaigns('vivo47');
  const map = (id: string) => {
    const c = vivo.find((x) => x.snapshot.id === id)!;
    return engine.mapMultiPlatformSnapshotToAdSet(c.snapshot, {
      ageDays: 365,
      kpiField: 'leads',
      channelType: c.channelType,
    });
  };
  const shared = ['18585815224', '19321380656', '19323095414'].map(map);
  rec.check(
    'e04: the 3 campaigns on shared budget 12280387431 are held shared_budget, never written in place',
    shared.every(
      (s) =>
        s.freeze === true &&
        s.freezeReason === 'unsupported_budget' &&
        s.platformHold === 'shared_budget',
    ),
  );
  const easyVideo = googleCampaign('easyfit2026', '20653378244');
  const videos = [
    map('22357506361'),
    engine.mapMultiPlatformSnapshotToAdSet(easyVideo.snapshot, {
      ageDays: 365,
      kpiField: 'thruplays',
      channelType: easyVideo.channelType,
    }),
  ];
  rec.check(
    'e05: both YouTube VIDEO campaigns are read-only (platform_readonly)',
    videos.every((s) => s.freeze === true && s.platformHold === 'platform_readonly'),
  );
  const smart = map('18572377820');
  const admission = engine.googleChannelAdmission('SMART');
  rec.check(
    'e06: the Smart campaign is not admitted (unsupported_channel:SMART); Display neither; Search is',
    smart.platformHold === 'unsupported_channel' &&
      admission.admitted === false &&
      admission.reason === 'unsupported_channel:SMART' &&
      engine.googleChannelAdmission('DISPLAY').admitted === false &&
      engine.googleChannelAdmission('SEARCH').admitted === true,
  );
}

// ---------------------------------------------------------------------------
// 07 — G03 only against a target in the account's currency
// ---------------------------------------------------------------------------
{
  const ekatar = googleCampaign('vivo47', '20775796216').snapshot;
  const d7 = ekatar.windows.d7;
  rec.check(
    'e07: EKATAR d7 is 6,190.59 MXN for 8.01 conversions = 772.98, losing 28.0% to budget',
    near(d7.spend, 6190.59) &&
      near(d7.leads ?? 0, 8.01) &&
      near(d7.spend / (d7.leads ?? 1), 772.98) &&
      near(d7.delivery?.budgetLostImpressionShare ?? 0, 0.28, 0.0005),
  );
  const a = engine.g03BudgetLimitedRaise(ekatar, {
    objective: 'lead',
    kpiField: 'leads',
    cpaTarget: null,
  });
  rec.check(
    'e07 (A): no target → G03 abstains by name, quoting the cost, instead of losing to the currency-less default 50',
    a.outcome === 'refusal' &&
      a.refusal === 'missing_cpa_target' &&
      a.reason.includes('$773 MXN') &&
      a.reason.includes('28%'),
    a.reason,
  );
  const usd = engine.g03BudgetLimitedRaise(ekatar, {
    objective: 'lead',
    kpiField: 'leads',
    cpaTarget: { amount: 900, currency: 'USD' },
  });
  rec.check(
    'e07: a target in another currency is the same as none',
    usd.outcome === 'refusal' && usd.refusal === 'missing_cpa_target',
  );
  const b = engine.g03BudgetLimitedRaise(ekatar, {
    objective: 'lead',
    kpiField: 'leads',
    cpaTarget: { amount: 900, currency: 'MXN' },
  });
  rec.check(
    'e07 (B): target 900 MXN → raise 1,179 → 1,473.75 (+25% lead profile), 14% under target, human-approved',
    b.outcome === 'proposal' &&
      cents(b.from) === 117900 &&
      cents(b.to) === 147375 &&
      b.needsApproval === true &&
      b.reason.includes('14% under target'),
    b.outcome === 'proposal' ? b.reason : b.reason,
  );
  const projected = engine.g03BudgetLimitedRaise(ekatar, {
    objective: 'lead',
    kpiField: 'leads',
    cpaTarget: { amount: 900, currency: 'MXN' },
    historyDays: 30,
  });
  const card =
    projected.outcome === 'proposal'
      ? engine.googleBudgetLimitedCard(ekatar, projected, {
          kpiField: 'leads',
          resultLabel: 'leads',
          daysLimited: null,
        })
      : null;
  const projection = card?.projection;
  rec.check(
    'e07 (B, feature 14): at 1,473.75/day about 1.53–1.59 leads/day (now 1.14), the high end capped by the 28% lost to budget, on 7 days',
    PlatformCardSchema.safeParse(card).success &&
      projection?.results_per_day_now === 1.14 &&
      projection.results_per_day_low === 1.53 &&
      projection.results_per_day_high === 1.59 &&
      projection.basis_days === 7 &&
      card?.proposed_budget_per_day === 147375 / 100,
    JSON.stringify(projection),
  );
  const fresh = engine.g03BudgetLimitedRaise(ekatar, {
    objective: 'lead',
    kpiField: 'leads',
    cpaTarget: { amount: 900, currency: 'MXN' },
    historyDays: 5,
  });
  rec.check(
    'e07 (feature 14): fewer than 7 days of history → the proposal stands, the projection is null',
    fresh.outcome === 'proposal' && fresh.projection === null,
  );
  const above = engine.g03BudgetLimitedRaise(ekatar, {
    objective: 'lead',
    kpiField: 'leads',
    cpaTarget: { amount: 700, currency: 'MXN' },
  });
  rec.check(
    'e07: with a 700 target (under 772.98) G03 does not fire',
    above.outcome === 'refusal' && above.refusal === 'above_target',
  );
  const g27 = engine.crossPlatformMove({ ...scenario01Input(), cpaTarget: null });
  rec.check(
    'e07: G27 makes no proposal without a cpa_target in the account currency',
    g27.outcome === 'refusal' && g27.refusal === 'missing_cpa_target',
  );
}

// ---------------------------------------------------------------------------
// 08 — G11 reads the keyword's live status before it proposes anything
// ---------------------------------------------------------------------------
{
  type KeywordRow = {
    adGroupCriterion: {
      status: string;
      criterionId: string;
      keyword: { text: string };
      qualityInfo?: { qualityScore?: number };
    };
    metrics: { costMicros: string; conversions: number };
  };
  const keywords = loadFixture<KeywordRow[]>('google-vivo47-keywords30d.json').data;
  const read = (text: string, pick: (k: KeywordRow) => boolean) => {
    const k = keywords.find((x) => x.adGroupCriterion.keyword.text === text && pick(x))!;
    return {
      id: k.adGroupCriterion.criterionId,
      text,
      status: k.adGroupCriterion.status,
      qualityScore: k.adGroupCriterion.qualityInfo?.qualityScore ?? null,
      spend: Number(k.metrics.costMicros) / 1e6,
      conversions: k.metrics.conversions,
      window: 'September 2026',
    };
  };
  const funcional = read('Entrenamiento funcional', (k) => Number(k.metrics.costMicros) > 0);
  const gimnasios = read('gimnasios cerca de mi', (k) => Number(k.metrics.costMicros) > 0);
  const f = engine.g11LowQualityKeyword(funcional, 900, 'MXN');
  const g = engine.g11LowQualityKeyword(gimnasios, 900, 'MXN');
  const live = engine.g11LowQualityKeyword({ ...funcional, status: 'ENABLED' }, 900, 'MXN');
  rec.check(
    'e08: "Entrenamiento funcional" (QS 1, 7,562.57 MXN, 0.33 conv) is already PAUSED — no card',
    funcional.qualityScore === 1 &&
      near(funcional.spend, 7562.57) &&
      f.fires === false &&
      f.because === 'not_enabled',
  );
  rec.check(
    'e08: "gimnasios cerca de mi" (QS 1) has 3 conversions — no card',
    g.fires === false && g.because === 'has_conversions',
  );
  rec.check(
    'e08: the other side — had it been ENABLED, G11 would still hold on its 0.33 conversions',
    live.fires === false && live.because === 'has_conversions',
  );
  const zero = engine.g11LowQualityKeyword(
    { ...funcional, status: 'ENABLED', conversions: 0 },
    900,
    'MXN',
  );
  rec.check(
    'e08: ENABLED, QS 1, spend over target and 0 conversions → G11 fires, with its window',
    zero.fires === true && zero.reason.includes('September 2026'),
  );
}

// ---------------------------------------------------------------------------
// 09 — TikTok's 105% floor schedules the decrease; the Google raise waits for it
// ---------------------------------------------------------------------------
{
  const synthetic = loadFixture<{ metrics: { cost: number; conversions: number } }>(
    'synthetic-google-easyfit-search-leads-7d.json',
  ).data;
  const r = engine.crossPlatformMove({
    objective: 'lead',
    portfolioCurrency: 'MXN',
    cpaTarget: LEAD_TARGET,
    legs: [
      tiktokLeg(['7000000000000000202']),
      {
        platform: 'google_ads',
        currency: 'MXN',
        reportedD7: { spend: synthetic.metrics.cost, results: synthetic.metrics.conversions },
        members: [
          googleMember(easyFitSearchLeads.snapshot, {
            spend: synthetic.metrics.cost,
            results: synthetic.metrics.conversions,
          }),
        ],
      },
    ],
  });
  const p = proposal(r);
  rec.check(
    'e09: G27 fires at 2.2× (69.00 vs 31.40, 10 and 70 results)',
    near(p.ratio, 2.2, 0.01) && p.results.donor === 10 && p.results.receiver === 70,
  );
  rec.check(
    'e09: amount = min(Google +25% = 175, TikTok −50% = 500) = 175: TikTok 1,000 → 825, Google 700 → 875',
    cents(p.amount) === 17500 && cents(p.legs[0]!.to) === 82500 && cents(p.legs[1]!.to) === 87500,
  );
  rec.check(
    'e09: 825 < 1.05 × 986.00 spent today → the decrease is scheduled for tomorrow, and the raise waits for it',
    p.legs[0]!.timing === 'next_day' && p.legs[1]!.waitsFor === 'decrease_applied',
  );
}

// ---------------------------------------------------------------------------
// 10 — Smart+: campaign budget only
// ---------------------------------------------------------------------------
{
  const smartPlus = tiktokAdGroup('7000000000000000204');
  const mapped = tiktokMapped(smartPlus);
  const caps = engine.platformCapabilities('tiktok_ads', 'upgraded_smart_plus');
  rec.check(
    "e10: the Smart+ ad group 204 is held (its budget is the campaign's) and the engine never descends into it",
    mapped.freeze === true &&
      mapped.freezeReason === 'unsupported_budget' &&
      caps.descendToGroups === false,
  );
}

// ---------------------------------------------------------------------------
// 11, 12, 13 — learning, by each platform's own definition
// ---------------------------------------------------------------------------
{
  const d7 = metaPortfolioD7(formularios);
  // The fixture holds the portfolio's d7 (48 leads), not each ad set's. Every ad set's d7 is
  // at most 48, so an ad set holding ALL of them is the upper bound — and still learning.
  const upperBound = (item: MetaItem): AdSetSnapshot => ({
    id: item.adset_id,
    status: 'active',
    currentBudget: item.diagnostics.currentBudget,
    ageDays: 30,
    kpiField: 'leads',
    windows: {
      d3: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0, leads: 0 },
      d7: {
        spend: d7.spend,
        purchases: 0,
        addToCarts: 0,
        clicks: 0,
        impressions: 0,
        leads: d7.results,
      },
      d14: {
        spend: d7.spend,
        purchases: 0,
        addToCarts: 0,
        clicks: 0,
        impressions: 0,
        leads: d7.results,
      },
    },
  });
  const items = formularios.performance.latest_items;
  rec.check(
    "e11: all 9 Formularios ad sets are learning by Meta's 50-events-in-7-days rule (the portfolio has 48)",
    items.length === 9 &&
      d7.results === 48 &&
      items.every((i) => engine.isPlatformLearning(upperBound(i), leadCfg)),
  );
  const rtg = items.find((i) => i.adset_name === 'ITESO // AGOSTO - RTG')!;
  const caps = engine.platformCaps('meta', 'lead', true);
  rec.check(
    'e11: a learning Meta ad set is cut at most 8%: ITESO RTG 52.73 → 48.51, what prod recorded',
    caps.downPct === 0.08 &&
      cents(rtg.diagnostics.currentBudget * (1 - caps.downPct)) === cents(rtg.final_budget) &&
      cents(rtg.final_budget) === 4851,
  );

  const ga1 = googleCampaign('easyfit2026', '24298030946').snapshot;
  const pmax = googleCampaign('easyfit2026', '24298408295').snapshot;
  const ga1Mapped = engine.mapMultiPlatformSnapshotToAdSet(ga1, {
    ageDays: null,
    kpiField: 'leads',
    channelType: 'SEARCH',
  });
  const pmaxMapped = engine.mapMultiPlatformSnapshotToAdSet(pmax, {
    ageDays: null,
    kpiField: 'leads',
    channelType: 'PERFORMANCE_MAX',
  });
  const googleCaps = engine.platformCaps('google_ads', 'lead', true);
  rec.check(
    'e12: GA 1 EASY is learning because Google says LEARNING_NEW — and a decrease stops at 644 MXN (−8%)',
    engine.isPlatformLearning(ga1Mapped, leadCfg) &&
      cents(ga1Mapped.currentBudget * (1 - googleCaps.downPct)) === 64400,
  );
  rec.check(
    'e12: the other side — Easy Fit PMax (ENABLED, 0 conversions) is NOT learning: the 50-event proxy never applies to Google',
    engine.isPlatformLearning(pmaxMapped, leadCfg) === false,
  );

  const lal = tiktokAdGroup('7000000000000000203');
  const lalMapped = tiktokMapped(lal);
  const campaignResults = engine
    .tiktokCampaignResults7d(leadRoster.map(tiktokMapped), leadCfg)
    .get('7000000000000000101');
  rec.check(
    "e13: LAL 2% nuevos (3 days, 4 leads) is learning on TikTok and in the engine's grace window",
    lal.ageDays === 3 &&
      engine.isPlatformLearning(lalMapped, leadCfg, campaignResults) &&
      engine.classifyStatus(lalMapped, leadCfg, campaignResults) === 'grace',
  );
  rec.check(
    'e13: the other side — 202 (41 days, campaign at 25 results) is out of learning',
    campaignResults === 25 &&
      !engine.isPlatformLearning(
        tiktokMapped(tiktokAdGroup('7000000000000000202')),
        leadCfg,
        campaignResults,
      ),
  );
  const cooled = tiktokLeg(['7000000000000000201', '7000000000000000202']);
  cooled.members.find((m) => m.id === '7000000000000000202')!.daysSinceBudgetChange = 1;
  const r = proposal(engine.crossPlatformMove(scenario01Input({ tiktok: cooled })));
  rec.check(
    'e13: TikTok waits 2 days between changes — 202 changed yesterday, so 201 donates instead',
    r.legs[0]!.entityId === '7000000000000000201' &&
      r.excludedDonors.some((x) => x.entityId === '7000000000000000202' && x.reason === 'cooldown'),
  );
}

// ---------------------------------------------------------------------------
// 14 — one currency per comparison (the 23514 enroll check is SQL; this is the engine's half)
// ---------------------------------------------------------------------------
{
  const mismatch = loadFixture<{ advertiserInfo: { currency: string } }>(
    'synthetic-currency-mismatch.json',
  ).data;
  const usdLeg = {
    ...tiktokLeg(['7000000000000000201', '7000000000000000202']),
    currency: mismatch.advertiserInfo.currency,
  };
  const r = engine.crossPlatformMove(scenario01Input({ tiktok: usdLeg }));
  rec.check(
    'e14: a USD TikTok advertiser in an MXN portfolio is never compared (currency_mismatch)',
    r.outcome === 'refusal' && r.refusal === 'currency_mismatch' && r.reason.includes('USD'),
    r.outcome === 'refusal' ? r.reason : '',
  );
}

// ---------------------------------------------------------------------------
// 20 — a whole dark Google account is one card
// ---------------------------------------------------------------------------
{
  const easyFit = googleCampaigns('easyfit2026').map((c) => c.snapshot);
  const findings = engine.googleDarkness(easyFit);
  const card = findings[0];
  rec.check(
    'e20: Easy Fit 2026 — 6 active campaigns, 2,955 MXN/day, no impressions — collapse to ONE account card',
    findings.length === 1 &&
      card?.scope === 'account' &&
      card.campaignIds.length === 6 &&
      cents(card.dailyBudget) === 295500,
    card?.reason,
  );
  const one = easyFit.map((s) =>
    s.id === '24274603133'
      ? { ...s, windows: { ...s.windows, d14: { ...s.windows.d14, impressions: 120 } } }
      : s,
  ) as MultiPlatformSnapshot[];
  const split = engine.googleDarkness(one);
  rec.check(
    'e20: the other side — if one campaign served, the other 5 dark ones are campaign cards, not an account card',
    split.length === 5 && split.every((f) => f.scope === 'campaign'),
  );
}

// ---------------------------------------------------------------------------
// 21 — no signal on either side, no move
// ---------------------------------------------------------------------------
{
  const tours = metaPortfolio('septiembre-tours-programados');
  const purchase = loadFixture<{ conversionAction: { category: string; status: string } }[]>(
    'google-easyfit2026-conversionActions.json',
  ).data.filter((r) => r.conversionAction.category === 'PURCHASE');
  const r = engine.crossPlatformMove({
    objective: 'purchase',
    portfolioCurrency: 'MXN',
    cpaTarget: { amount: tours.portfolio.cpa_target ?? 0, currency: 'MXN' },
    legs: [
      {
        platform: 'meta',
        currency: 'MXN',
        reportedD7: metaPortfolioD7(tours),
        members: tours.performance.latest_items.map(metaMember),
      },
      {
        platform: 'google_ads',
        currency: 'MXN',
        reportedD7: null,
        members: [googleMember(pmaxOf(), { spend: 0, results: 0 })],
      },
    ],
  });
  rec.check(
    'e21: Tours (624.03 MXN, 0 purchases) plus a Google purchase action with no data → no G27, cost per result null',
    metaPortfolioD7(tours).results === 0 &&
      purchase.length > 0 &&
      r.outcome === 'refusal' &&
      r.refusal === 'insufficient_platforms' &&
      r.ratio === null,
    r.outcome === 'refusal' ? r.reason : '',
  );
}
function pmaxOf() {
  return googleCampaign('easyfit2026', '24298408295').snapshot;
}

// ---------------------------------------------------------------------------
// 26 — a gap inside Google is not G27, and 7 days of 4 vs 7 calls is not evidence
// ---------------------------------------------------------------------------
{
  const tangassi = googleCampaigns('tangassi');
  const search = tangassi.find((c) => c.snapshot.id === '22574767866')!.snapshot.windows.d7;
  const pmax = tangassi.find((c) => c.snapshot.id === '22980224558')!.snapshot.windows.d7;
  const sCost = search.spend / (search.leads ?? 1);
  const pCost = pmax.spend / (pmax.leads ?? 1);
  rec.check(
    'e26: d7 Search 148.95 (4) vs PMax 174.00 (7) — 1.17×, both under 10 results',
    near(sCost, 148.95) &&
      near(pCost, 174.0) &&
      near(pCost / sCost, 1.17, 0.01) &&
      (search.leads ?? 0) < 10 &&
      (pmax.leads ?? 0) < 10,
  );
  const members = tangassi
    .filter((c) => c.status === 'ENABLED')
    .map((c) =>
      googleMember(c.snapshot, {
        spend: c.snapshot.windows.d7.spend,
        results: c.snapshot.windows.d7.leads ?? 0,
      }),
    );
  const r = engine.crossPlatformMove({
    objective: 'lead',
    portfolioCurrency: 'MXN',
    cpaTarget: LEAD_TARGET,
    legs: [{ platform: 'google_ads', currency: 'MXN', reportedD7: null, members }],
  });
  rec.check(
    'e26: G27 is cross-platform only — one Google leg is refused, the solver inside Google decides',
    r.outcome === 'refusal' && r.refusal === 'insufficient_platforms',
    r.outcome === 'refusal' ? r.reason : '',
  );
}

// ---------------------------------------------------------------------------
// 24 — a Meta-only portfolio: identical to the cent to the engine on main
// ---------------------------------------------------------------------------
type EngineModule = typeof engine;

function loadMainEngine(): { mod: Promise<EngineModule>; rev: string } {
  const cache = join(ROOT, 'node_modules/.cache/optimization-engine-main');
  rmSync(cache, { recursive: true, force: true });
  mkdirSync(cache, { recursive: true });
  const rev = spawnSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
  }).stdout.trim();
  const out = spawnSync(
    'sh',
    ['-c', `git -C "${ROOT}" archive HEAD packages/optimization-engine/src | tar -x -C "${cache}"`],
    {
      encoding: 'utf8',
    },
  );
  if (out.status !== 0) throw new Error(`git archive failed: ${out.stderr}`);
  return {
    mod: import(join(cache, 'packages/optimization-engine/src/index.ts')) as Promise<EngineModule>,
    rev,
  };
}

/** Meta snapshots for a recorded portfolio. Windows are CONSTRUCTED from the recorded
 *  per-ad-set budget, scores and d14 CI (the fixture has no raw windows): the parity claim
 *  is "same input, same output", not a replay of prod's numbers. */
function metaSnapshots(items: MetaItem[], kpi: keyof WindowMetrics): AdSetSnapshot[] {
  const w = (spend: number, events: number): WindowMetrics => ({
    spend,
    purchases: 0,
    addToCarts: 0,
    clicks: Math.round(events * 10),
    impressions: Math.round(spend * 40),
    [kpi]: events,
  });
  return items.map((item) => {
    const g = item.diagnostics;
    const b = g.currentBudget;
    const spend14 = g.ci.events > 0 ? g.ci.cpa * g.ci.events : b * 14;
    return {
      id: item.adset_id,
      name: item.adset_name,
      status: 'active',
      currentBudget: b,
      ageDays: 30,
      kpiField: kpi,
      windows: {
        d3: w(b * 3, g.score3d * b * 3),
        d7: w(b * 7, g.score7d * b * 7),
        d14: w(spend14, g.ci.events),
      },
    };
  });
}

function viaMapper(s: AdSetSnapshot, kpi: keyof WindowMetrics): AdSetSnapshot {
  const ref = {
    platform: 'meta' as const,
    level: 'group' as const,
    nativeLevel: 'adset' as const,
    id: s.id,
    accountId: '521903353286118',
  };
  const neutral = MultiPlatformSnapshotSchema.parse({
    platform: 'meta',
    level: 'group',
    native_level: 'adset',
    id: s.id,
    accountId: ref.accountId,
    name: s.name,
    automation: 'manual',
    budget: {
      kind: 'daily',
      minor: Math.round(s.currentBudget * 100),
      currency: 'MXN',
      shared: false,
      ownerRef: ref,
    },
    windows: s.windows,
  });
  return engine.mapMultiPlatformSnapshotToAdSet(neutral, {
    ageDays: s.ageDays,
    kpiField: kpi,
    channelType: null,
  });
}

const main = loadMainEngine();
const mainEngine = await main.mod;
for (const slug of ['mensajes-todos', 'prueba'] as const) {
  const p = metaPortfolio(slug);
  const objective = p.portfolio.objective as OptimizationObjective;
  const kpi = engine.getObjectiveProfile(objective).kpiField;
  const snapshots = metaSnapshots(p.performance.latest_items, kpi);
  const opts = {
    objective,
    mode: p.portfolio.mode as 'balanced',
    total: p.performance.latest_run!.total_budget,
    config: { cpaTarget: p.portfolio.cpa_target ?? undefined, currency: p.portfolio.currency },
  };
  const here: CycleResult = engine.runCycle(snapshots, opts);
  const onMain: CycleResult = mainEngine.runCycle(snapshots, opts);
  const mapped: CycleResult = engine.runCycle(
    snapshots.map((s) => viaMapper(s, kpi)),
    opts,
  );
  const budgets = (c: CycleResult) =>
    c.reallocation.items.map((i) => `${i.id}:${cents(i.finalBudget)}`).join(',');
  const triggers = (c: CycleResult) =>
    c.recommendations.map((r) => `${r.adSetId}:${r.trigger}:${r.reason}`).join('|');
  const name = p.performance.latest_items.length === 12 ? 'MENSAJES // TODOS' : 'Prueba';
  rec.check(
    `e24: ${name} — every final budget equals main (${main.rev}) to the cent`,
    budgets(here) === budgets(onMain) &&
      here.reallocation.items.length === p.performance.latest_items.length,
    `${here.reallocation.items.length} ad sets, pool ${cents(here.reallocation.totalBudget) / 100} MXN`,
  );
  rec.check(
    `e24: ${name} — the whole cycle (items, recommendations, confidence) is byte-identical to main`,
    JSON.stringify(here) === JSON.stringify(onMain) && !('ruleSkips' in here),
  );
  rec.check(
    `e24: ${name} — routed through mapMultiPlatformSnapshotToAdSet as platform 'meta', the budgets and recommendations do not move`,
    budgets(mapped) === budgets(here) &&
      triggers(mapped) === triggers(here) &&
      !('ruleSkips' in mapped),
  );
}

// ---------------------------------------------------------------------------
// 31–40 — the platform-only rules over search terms, keywords, bidding, PMax coverage and
// TikTok creatives (wave 8), through evaluatePlatformSignals
// ---------------------------------------------------------------------------
runSignalScenarios(rec);

// ---------------------------------------------------------------------------
// 41–44 — delivery and policy (wave 9): the scopes' mappers on the REAL Easy Fit 2026 and
// Vivo 47 reads and the DOC_SHAPED TikTok reads, then evaluatePlatformSignals
// ---------------------------------------------------------------------------
runDeliveryScenarios(rec);

// ---------------------------------------------------------------------------
// What this bench does not assert, by name
// ---------------------------------------------------------------------------
const NOT_ENGINE: [number, string][] = [
  [15, 'portfolio currency null on Meta — the enroll RPC decides before any engine run (SQL)'],
  [16, 'platform vs GA4 vs sheet discrepancy — attribution sources live in the Optimizer service'],
  [17, 'sheet coverage < 80% fallback — attribution_fallback is an Optimizer log row'],
  [
    18,
    'an increase fails, every landed leg compensated — the N-leg executor (apply-level; move bench)',
  ],
  [
    19,
    'compensation fails, stranded → autopilot_paused — the executor and the kill switch (apply-level)',
  ],
  [22, 'Demand Gen minimum discovered by validate_only — Google preflight (apply-level)'],
  [23, 'budget drifted between card and approval — read-before-write in the applier (apply-level)'],
  [28, 'stale portfolio (57 days) — O/staleness.ts and the enroll picker (Optimizer)'],
  [
    29,
    'a move counts once against the daily cap, however many legs — the ledger reserve (apply-level; move bench)',
  ],
  [
    30,
    'Google in an autopilot portfolio never writes — portfolio_accounts.apply_enabled (Optimizer; ingest bench)',
  ],
];
for (const [id, why] of NOT_ENGINE) {
  const title = index.scenarios.find((s) => s.id === id)?.title ?? '?';
  rec.record(`e${String(id).padStart(2, '0')}: ${title}`, 'SKIP', `not engine-level: ${why}`);
}
rec.note(
  `fixtures read on ${AS_OF}; TikTok is DOC_SHAPED (not a live advertiser) and has no 3-day report, so a TikTok d3 is its d7 read and no assertion uses it`,
);
rec.note(
  'e24 windows are constructed from the recorded per-ad-set budgets, scores and d14 CI (the fixture has no raw windows): the claim is identical output to main for the same input, not a replay of the prod cycle',
);
rec.note(
  `e01 compares platform against platform: Meta on the portfolio's own d7 series (2,102.68 MXN / 48 leads), TikTok on 201+202 (1,380.06 / 21); per-ad-set costs never pick a donor or a receiver. ${daysBetween('2026-08-21', AS_OF)}-day-old TikTok 202 is the scheduled donor leg`,
);
rec.finish({ json });
