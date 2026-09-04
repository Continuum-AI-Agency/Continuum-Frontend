import { expect, test } from 'bun:test';
import type { AdAttributionDay, AdSetSnapshot } from '../src/index';
import { attachCreativeSeries, retentionRates } from '../src/index';

const W = { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 };

const snapshot = (id: string): AdSetSnapshot => ({
  id,
  status: 'active',
  currentBudget: 100,
  ageDays: 30,
  windows: { d3: W, d7: W, d14: W },
});

/** One ad-day as paid-media-metrics normalizes it: flat numbers plus an action map.
 *  Shaped exactly like a paid_media.ad_breakdown_daily row so the fixture cannot drift
 *  into something friendlier than production sends. */
const row = (
  over: Partial<AdAttributionDay> & { ad_id: string; adset_id: string; date: string },
): AdAttributionDay => ({
  ad_name: null,
  impressions: 1_000,
  clicks: 10,
  link_clicks: 5,
  spend: 100,
  actions: {},
  video_thruplays: null,
  ...over,
});

/** 14 consecutive days for one ad, newest last. `perDay` shapes each day. */
const days = (adId: string, adsetId: string, perDay: (i: number) => Partial<AdAttributionDay>) =>
  Array.from({ length: 14 }, (_, i) =>
    row({
      ad_id: adId,
      adset_id: adsetId,
      date: `2026-08-${String(20 + i).padStart(2, '0')}`,
      ...perDay(i),
    }),
  );

test('no rows leaves the snapshots untouched — absent series means UNKNOWN', () => {
  const snaps = [snapshot('as_1')];
  expect(attachCreativeSeries(snaps, [])).toBe(snaps);
  expect(attachCreativeSeries(snaps, [])[0]?.creativeSeries).toBeUndefined();
});

test('an ad set with no attribution rows keeps no series, while its sibling gets one', () => {
  const out = attachCreativeSeries(
    [snapshot('as_1'), snapshot('as_2')],
    days('ad_a', 'as_1', () => ({})),
  );
  expect(out.find((s) => s.id === 'as_1')?.creativeSeries).toHaveLength(1);
  expect(out.find((s) => s.id === 'as_2')?.creativeSeries).toBeUndefined();
});

test('d3 covers the three most recent dates and d14 the run — cumulative, like the engine', () => {
  // 100 spend and 1000 impressions per day, every day.
  const [out] = attachCreativeSeries(
    [snapshot('as_1')],
    days('ad_a', 'as_1', () => ({})),
  );
  const s = out?.creativeSeries?.[0];
  expect(s?.adId).toBe('ad_a');
  expect(s?.windows.d3.spend).toBe(300);
  expect(s?.windows.d7.spend).toBe(700);
  expect(s?.windows.d14.spend).toBe(1_400);
  expect(s?.windows.d3.impressions).toBe(3_000);
  expect(s?.windows.d14.impressions).toBe(14_000);
});

test('the window counts DATES, so a gap shrinks coverage instead of zeroing it', () => {
  // Only 2 days exist. d3 must be the sum of those 2, not two-thirds of nothing.
  const rows = [
    row({ ad_id: 'ad_a', adset_id: 'as_1', date: '2026-09-01' }),
    row({ ad_id: 'ad_a', adset_id: 'as_1', date: '2026-08-20' }), // a week-old straggler
  ];
  const [out] = attachCreativeSeries([snapshot('as_1')], rows);
  expect(out?.creativeSeries?.[0]?.windows.d3.spend).toBe(200);
});

test('conversions come out of the actions map into the right KPI field', () => {
  const rows = days('ad_a', 'as_1', () => ({
    actions: { 'onsite_conversion.messaging_conversation_started_7d': 2, add_to_cart: 1 },
  }));
  const [out] = attachCreativeSeries([snapshot('as_1')], rows);
  const w = out?.creativeSeries?.[0]?.windows;
  expect(w?.d3.conversations).toBe(6);
  expect(w?.d14.conversations).toBe(28);
  expect(w?.d14.addToCarts).toBe(14);
});

test('omni_purchase wins over its components — never both', () => {
  // Meta emits the dedup aggregate AND the parts. Summing them would double-count.
  const rows = days('ad_a', 'as_1', () => ({
    actions: { omni_purchase: 3, purchase: 3, 'offsite_conversion.fb_pixel_purchase': 3 },
  }));
  const [out] = attachCreativeSeries([snapshot('as_1')], rows);
  expect(out?.creativeSeries?.[0]?.windows.d14.purchases).toBe(42); // 3 x 14, not 9 x 14
});

test('several ads in one ad set each get their own trend', () => {
  const rows = [
    ...days('ad_a', 'as_1', () => ({ spend: 100, ad_name: 'A' })),
    ...days('ad_b', 'as_1', () => ({ spend: 50, ad_name: 'B' })),
  ];
  const [out] = attachCreativeSeries([snapshot('as_1')], rows);
  const series = out?.creativeSeries ?? [];
  expect(series).toHaveLength(2);
  expect(series.find((s) => s.adId === 'ad_a')?.windows.d14.spend).toBe(1_400);
  expect(series.find((s) => s.adId === 'ad_b')?.windows.d14.spend).toBe(700);
  expect(series.find((s) => s.adId === 'ad_b')?.adName).toBe('B');
});

test('the input snapshots are not mutated', () => {
  const snaps = [snapshot('as_1')];
  attachCreativeSeries(
    snaps,
    days('ad_a', 'as_1', () => ({})),
  );
  expect(snaps[0]?.creativeSeries).toBeUndefined();
});

// --- Video retention ---------------------------------------------------------
// The quartile counts were fetched from Meta, normalized, carried in the contract and
// persisted in paid_media.ad_breakdown_daily, then dropped at the mapper. These pin the
// hop shut.

test('quartile counts fold into d3/d7/d14 alongside the windows', () => {
  const [out] = attachCreativeSeries(
    [snapshot('as_1')],
    days('ad_a', 'as_1', () => ({ video_p25: 200, video_p50: 100, video_p75: 40 })),
  );
  const r = out?.creativeSeries?.[0]?.retention;
  expect(r?.d3.videoP25).toBe(600);
  expect(r?.d7.videoP50).toBe(700);
  expect(r?.d14.videoP75).toBe(560);
  expect(r?.d14.impressions).toBe(14_000);
});

test('an ad with no quartile rows carries NO retention — absent is unknown, not zero', () => {
  // A static image reports no video views at all. A curve of zeroes would read as
  // "nobody watched it", which is a different and false claim.
  const [out] = attachCreativeSeries(
    [snapshot('as_1')],
    days('ad_a', 'as_1', () => ({})),
  );
  expect(out?.creativeSeries?.[0]?.retention).toBeUndefined();
});

test('rates are derived from the SUMMED window, never averaged per day', () => {
  // Two days: 1000 impressions/500 p25 and 1000/100. The true window hook is
  // 600/2000 = 0.30. Averaging the daily rates would give (0.5 + 0.1)/2 = 0.30 here
  // by luck, so weight the days differently to catch it.
  const rows = [
    row({
      ad_id: 'ad_a',
      adset_id: 'as_1',
      date: '2026-09-01',
      impressions: 1_000,
      video_p25: 500,
      video_p50: 250,
      video_p75: 100,
    }),
    row({
      ad_id: 'ad_a',
      adset_id: 'as_1',
      date: '2026-09-02',
      impressions: 9_000,
      video_p25: 900,
      video_p50: 90,
      video_p75: 9,
    }),
  ];
  const [out] = attachCreativeSeries([snapshot('as_1')], rows);
  const d3 = out?.creativeSeries?.[0]?.retention?.d3;
  expect(d3).toBeDefined();
  const rates = retentionRates(d3 as NonNullable<typeof d3>);
  // 1400 / 10000 — not the daily mean of 0.5 and 0.1 (0.30).
  expect(rates.hook).toBeCloseTo(0.14, 6);
  // 340 / 1400
  expect(rates.hold).toBeCloseTo(0.242_857, 5);
  // 109 / 340
  expect(rates.finish).toBeCloseTo(0.320_588, 5);
});

test('a zero denominator is null — an unwatched ad has an UNKNOWN hook, not a bad one', () => {
  expect(
    retentionRates({ impressions: 0, videoP25: 0, videoP50: 0, videoP75: 0, thruplays: 0 }),
  ).toEqual({ hook: null, hold: null, finish: null });
  // Reached 25% but never 50%: hold is a real 0, finish is unknown.
  expect(
    retentionRates({ impressions: 100, videoP25: 10, videoP50: 0, videoP75: 0, thruplays: 0 }),
  ).toEqual({ hook: 0.1, hold: 0, finish: null });
});
