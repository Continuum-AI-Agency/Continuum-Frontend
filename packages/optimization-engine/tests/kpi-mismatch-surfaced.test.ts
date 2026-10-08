// A portfolio whose every ad set buys a different result than the portfolio prices.
//
// The live case (Easy Fit, "Septiembre - Tours Programados", 2026-09-24): the portfolio was
// created with objective `conversations`, but all 12 ad sets are Meta OUTCOME_SALES /
// OFFSITE_CONVERSIONS optimizing the pixel PURCHASE event, delivered to WhatsApp
// (destination_type WHATSAPP). Read from the Graph API on 2026-09-26. The ad sets bid for
// purchases — the engine's `kpi_mismatch` freeze is RIGHT. What was wrong is that nothing
// said so at portfolio level: pool 0, 100% of the budget frozen, and the only confidence
// actionable told the account to "give them budget until they clear 20 conversions" — a
// currency they never bid for — while the brief read "on its plan".

import { expect, test } from 'bun:test';
import { kpiFieldForOptimizationGoal } from '@continuum/contracts';
import type { AdSetSnapshot, WindowMetrics } from '../src/index';
import { runCycle } from '../src/index';

const ZERO: WindowMetrics = { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 };

/** 14-day spend (MXN) per ad set, Meta insights last_14d, 2026-09-26. Zero purchases and
 *  zero messaging conversations on every one of them. */
const TOURS: ReadonlyArray<readonly [id: string, name: string, spend14: number]> = [
  ['120253006769440236', 'ITESO // AGOSTO // 1 - BAU', 23.22],
  ['120253006769540236', 'ITESO // AGOSTO // 3 - BROAD', 38.58],
  ['120253006769610236', 'AV CAMACHO // AGOSTO // 1 - BAU', 18.16],
  ['120253006769680236', 'AV CAMACHO // AGOSTO // 3 - BROAD', 13.21],
  ['120253006769730236', 'AV CAMACHO // AGOSTO // 2 - LKL 5%', 33.07],
  ['120253006769860236', 'ITESO // AGOSTO // 2 - LKL CONTINUUM', 22.83],
  ['120253006837150236', 'ALEIRA // AGOSTO // 3 - BROAD', 24.53],
  ['120253006837160236', 'ALEIRA // AGOSTO // 2 - LKL 5%', 18.76],
  ['120253006837170236', 'ALEIRA // AGOSTO // 1 - BAU', 25.19],
  ['120253006837250236', 'CAÑADAS // AGOSTO // 1 - LKL 10%', 12.8],
  ['120253006837260236', 'CAÑADAS // AGOSTO // 3 - Broad Geo', 37.96],
  ['120253006837270236', 'CAÑADAS // AGOSTO // 2 - Interest & 2%', 31.97],
];

/** What Meta declares for all 12: Sales → WhatsApp, maximize conversions on PURCHASE. */
const META_GOAL = 'OFFSITE_CONVERSIONS';
const META_PROMOTED_EVENT = 'PURCHASE';

const window = (spend: number): WindowMetrics => ({
  ...ZERO,
  spend,
  impressions: Math.round(spend * 60),
  clicks: 2,
  linkClicks: 2,
  conversations: 0,
});

const toursSnapshots = (): AdSetSnapshot[] =>
  TOURS.map(([id, name, spend]) => ({
    id,
    name,
    status: 'active',
    currentBudget: 80,
    ageDays: 30,
    optimization_goal: META_GOAL,
    kpiField: kpiFieldForOptimizationGoal(META_GOAL, META_PROMOTED_EVENT),
    windows: { d3: window(spend / 5), d7: window(spend / 2), d14: window(spend) },
  }));

test('the classifier reads a Sales→WhatsApp PURCHASE ad set as buying purchases, not conversations', () => {
  // WhatsApp is where the ad sends people; PURCHASE is what Meta bids for. The destination
  // does not change the currency — a CONVERSATIONS / REPLIES goal would.
  expect(kpiFieldForOptimizationGoal(META_GOAL, META_PROMOTED_EVENT)).toBe('purchases');
  expect(kpiFieldForOptimizationGoal('CONVERSATIONS')).toBe('conversations');
});

test('every Tours ad set is held as kpi_mismatch in a conversations portfolio', () => {
  const result = runCycle(toursSnapshots(), { objective: 'conversations', total: 750 });
  const reasons = result.reallocation.items.map((i) => i.freezeReason);
  expect(reasons).toEqual(Array(12).fill('kpi_mismatch'));
});

test('the portfolio says loudly that none of its ad sets buys what it prices', () => {
  const result = runCycle(toursSnapshots(), { objective: 'conversations', total: 750 });
  const mismatch = result.confidence.actionables.find((a) => a.code === 'kpi_mismatch');
  expect(mismatch).toBeDefined();
  expect(mismatch?.adsetIds).toHaveLength(12);
  expect(mismatch?.spendShare).toBeCloseTo(1, 10);
  expect(mismatch?.message).toContain('12 of 12 ad sets');
  expect(mismatch?.message).toContain('purchases');
  expect(mismatch?.message).toContain('conversations');
  // It leads: nothing else about this portfolio matters until the currency is right.
  expect(result.confidence.actionables[0]?.code).toBe('kpi_mismatch');
});

test('ad sets held for a different currency are not told to earn this one', () => {
  // "Give them budget until they clear 20 conversions" is advice about a currency the ad
  // set never bids for — it can't be followed, and it hid the real problem.
  const result = runCycle(toursSnapshots(), { objective: 'conversations', total: 750 });
  expect(result.confidence.underFloor.adsetIds).toEqual([]);
  expect(result.confidence.actionables.map((a) => a.code)).toEqual(['kpi_mismatch']);
});

test('a mixed portfolio names only the mismatched ad sets and their share of spend', () => {
  const [first, second, ...rest] = toursSnapshots();
  const converting: AdSetSnapshot[] = [first, second].map((s) => ({
    ...s,
    optimization_goal: 'CONVERSATIONS',
    kpiField: 'conversations',
    windows: {
      d3: { ...s.windows.d3, conversations: 3 },
      d7: { ...s.windows.d7, conversations: 9 },
      d14: { ...s.windows.d14, conversations: 30 },
    },
  }));
  const result = runCycle([...converting, ...rest], { objective: 'conversations', total: 960 });
  const mismatch = result.confidence.actionables.find((a) => a.code === 'kpi_mismatch');
  const restSpend = rest.reduce((sum, s) => sum + s.windows.d14.spend, 0);
  const allSpend = restSpend + converting.reduce((sum, s) => sum + s.windows.d14.spend, 0);
  expect(mismatch?.adsetIds).toEqual(rest.map((s) => s.id));
  expect(mismatch?.spendShare).toBeCloseTo(restSpend / allSpend, 10);
  expect(mismatch?.message).toContain('10 of 12 ad sets');
  expect(result.confidence.events).toBe(60);
});

test('a portfolio whose ad sets all buy its currency carries no mismatch actionable', () => {
  const matching = toursSnapshots().map((s) => ({ ...s, kpiField: 'conversations' as const }));
  const result = runCycle(matching, { objective: 'conversations', total: 960 });
  expect(result.confidence.actionables.some((a) => a.code === 'kpi_mismatch')).toBe(false);
});
