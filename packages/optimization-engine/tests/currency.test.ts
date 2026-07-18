// The currency an ad set is priced in.
//
// Modelled on the account that exposed the bug: a gym running CONVERSATIONS ad sets
// (WhatsApp / IG Direct) alongside LEAD_GENERATION ad sets, all under one Meta objective.
// It bought 949 messaging conversations against 161 leads — and the optimizer, which had
// no `conversations` field at all, counted ZERO events on every conversation ad set,
// froze them as `no_conversions`, and never surfaced a single fatigue recommendation for
// the ad sets doing most of the account's work.
//
// A missing measurement is not a measurement of zero. These tests encode that claim.

import { expect, test } from 'bun:test';
import type { AdSetSnapshot, WindowMetrics } from '../src/index';
import { evaluateFatigue, resolveConfig, runCycle } from '../src/index';

const ZERO: WindowMetrics = { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 };

/** A window that bought `n` messaging conversations for `spend`. */
const convos = (spend: number, n: number, extra: Partial<WindowMetrics> = {}): WindowMetrics => ({
  ...ZERO,
  spend,
  impressions: Math.round(spend * 100),
  clicks: Math.round(spend / 2),
  conversations: n,
  ...extra,
});

/** A window that bought `n` leads for `spend`. */
const leads = (spend: number, n: number): WindowMetrics => ({
  ...ZERO,
  spend,
  impressions: Math.round(spend * 100),
  clicks: Math.round(spend / 2),
  leads: n,
});

const adSet = (
  over: Partial<AdSetSnapshot> & Pick<AdSetSnapshot, 'id' | 'windows'>,
): AdSetSnapshot => ({
  status: 'active',
  currentBudget: 100,
  ageDays: 45,
  ...over,
});

const itemFor = (result: ReturnType<typeof runCycle>, id: string) => {
  const item = result.reallocation.items.find((i) => i.id === id);
  if (!item) throw new Error(`no diagnostics for ${id}`);
  return item;
};

// --- The regression -----------------------------------------------------------------

test('a converting conversations ad set is SCORED, not frozen as no_conversions', () => {
  // 305 conversations on $12k. Before `conversations` existed as a KPI field, this ad set
  // reported zero events and was held at its budget while being described as having "no
  // conversions" — about an ad set that started 305 conversations.
  const result = runCycle(
    [
      adSet({
        id: 'convo-winner',
        kpiField: 'conversations',
        currentBudget: 200,
        windows: { d3: convos(2_600, 70), d7: convos(6_000, 155), d14: convos(12_045, 305) },
      }),
      adSet({
        id: 'convo-loser',
        kpiField: 'conversations',
        currentBudget: 200,
        windows: { d3: convos(2_600, 20), d7: convos(6_000, 44), d14: convos(12_045, 88) },
      }),
    ],
    { objective: 'conversations', total: 400 },
  );

  const winner = itemFor(result, 'convo-winner');
  const loser = itemFor(result, 'convo-loser');

  expect(winner.freezeReason).toBeUndefined();
  expect(loser.freezeReason).toBeUndefined();
  expect(winner.status).toBe('active');

  // And the cheaper conversation actually wins budget — the whole point of scoring it.
  expect(winner.compositeScore).toBeGreaterThan(loser.compositeScore);
  expect(winner.finalBudget).toBeGreaterThan(loser.finalBudget);
  expect(result.reallocation.conserved).toBe(true);
});

test('a genuinely dead conversations ad set is ACTED ON, not silently held', () => {
  // The other half of the regression. Before `conversations` was a countable event, a
  // messaging ad set with zero conversions was indistinguishable from one with 305 — both
  // read as zero — so both were frozen `no_conversions` and NEITHER earned a
  // recommendation. The engine had nothing to say about either.
  //
  // Now the dead one is caught by the pause trigger and starved toward its floor, and a
  // human gets an approval-gated recommendation that names the real figure.
  const result = runCycle(
    [
      adSet({
        id: 'genuinely-dead',
        kpiField: 'conversations',
        windows: { d3: convos(300, 0), d7: convos(700, 0), d14: convos(1_500, 0) },
      }),
      adSet({
        id: 'alive',
        kpiField: 'conversations',
        windows: { d3: convos(300, 12), d7: convos(700, 26), d14: convos(1_500, 55) },
      }),
    ],
    { objective: 'conversations', total: 200 },
  );

  const dead = itemFor(result, 'genuinely-dead');
  expect(dead.status).toBe('starved');
  expect(dead.finalBudget).toBeLessThan(itemFor(result, 'alive').finalBudget);

  const rec = result.recommendations.find((r) => r.adSetId === 'genuinely-dead');
  expect(rec?.kind).toBe('pause');
  expect(rec?.needsApproval).toBe(true);
  // The reason must carry the real figure — it is the sole grounding for any rephrase.
  expect(rec?.reason).toContain('0 conversions');

  // The converting one is left alone.
  expect(result.recommendations.some((r) => r.adSetId === 'alive')).toBe(false);
});

// --- One currency per pool ------------------------------------------------------------

test('an ad set buying a DIFFERENT currency is frozen kpi_mismatch, not ranked', () => {
  // The gym's real portfolio. Priced in leads, a $39 conversation looks infinitely
  // efficient — events/$ would hand the conversation ad set the entire pool. Refusing to
  // compare is the only honest answer.
  const result = runCycle(
    [
      adSet({
        id: 'lead-adset',
        kpiField: 'leads',
        currentBudget: 200,
        windows: { d3: leads(1_200, 6), d7: leads(2_800, 14), d14: leads(6_000, 30) },
      }),
      adSet({
        id: 'convo-adset',
        kpiField: 'conversations',
        currentBudget: 200,
        windows: { d3: convos(1_200, 60), d7: convos(2_800, 140), d14: convos(6_000, 305) },
      }),
    ],
    { objective: 'lead', total: 400 },
  );

  const convo = itemFor(result, 'convo-adset');
  expect(convo.freezeReason).toBe('kpi_mismatch');
  expect(convo.status).toBe('frozen');

  // Frozen means PINNED — it does not get starved to its floor, and it does not get the
  // pool either. Its budget is held exactly where the human left it.
  expect(convo.finalBudget).toBe(200);
  expect(convo.changeAbs).toBe(0);

  expect(itemFor(result, 'lead-adset').freezeReason).toBeUndefined();
  expect(result.reallocation.conserved).toBe(true);
});

test('a mismatched ad set earns no recommendation at all — a verdict in the wrong currency is worse than silence', () => {
  // It would otherwise look catastrophic (zero leads on real spend) and earn a confident
  // pause. That pause would be a lie: the ad set never bought a lead in its life.
  const result = runCycle(
    [
      adSet({
        id: 'convo-in-lead-portfolio',
        kpiField: 'conversations',
        windows: { d3: convos(900, 45), d7: convos(2_100, 100), d14: convos(4_500, 220) },
      }),
      adSet({
        id: 'real-lead-adset',
        kpiField: 'leads',
        windows: { d3: leads(900, 5), d7: leads(2_100, 11), d14: leads(4_500, 24) },
      }),
    ],
    { objective: 'lead', total: 200 },
  );

  const mismatchRecs = result.recommendations.filter(
    (r) => r.adSetId === 'convo-in-lead-portfolio',
  );
  expect(mismatchRecs).toEqual([]);
});

test('a matching currency is never frozen, and an unknown one falls back to the portfolio', () => {
  const result = runCycle(
    [
      adSet({
        id: 'matches',
        kpiField: 'leads',
        windows: { d3: leads(600, 3), d7: leads(1_400, 7), d14: leads(3_000, 16) },
      }),
      // No optimization_goal on the row (older sync) ⇒ no kpiField ⇒ the portfolio's
      // currency applies, exactly as before this change. Not a mismatch.
      adSet({
        id: 'unknown-goal',
        windows: { d3: leads(600, 3), d7: leads(1_400, 7), d14: leads(3_000, 16) },
      }),
    ],
    { objective: 'lead', total: 200 },
  );

  expect(itemFor(result, 'matches').freezeReason).toBeUndefined();
  expect(itemFor(result, 'unknown-goal').freezeReason).toBeUndefined();
});

// --- Fatigue can finally see these ad sets --------------------------------------------

test('creative fatigue fires on a conversations ad set — it never could before', () => {
  // evaluateFatigue bails unless kpiEvents > 0 in BOTH d3 and d14. With no conversations
  // field those were always 0, so a worn-out messaging creative could decay forever and
  // the optimizer had nothing to say about it.
  const cfg = resolveConfig({ objective: 'conversations' });

  const worn = adSet({
    id: 'worn-out-convo-creative',
    kpiField: 'conversations',
    audienceType: 'prospecting',
    frequency7d: 2.1, // under the saturation cap → this is F1 creative fatigue, not F2
    windows: {
      // CTR collapsing (clicks/impressions) while cost-per-conversation climbs.
      d3: { ...ZERO, spend: 900, impressions: 200_000, clicks: 1_000, conversations: 10 },
      d7: { ...ZERO, spend: 1_900, impressions: 380_000, clicks: 3_500, conversations: 34 },
      d14: { ...ZERO, spend: 3_400, impressions: 600_000, clicks: 9_000, conversations: 85 },
    },
  });

  const recs = evaluateFatigue([worn], cfg);
  expect(recs.map((r) => r.kind)).toContain('creative_refresh');
  expect(recs[0].trigger).toBe('F1_creative_fatigue');
  expect(recs[0].needsApproval).toBe(true);
});
