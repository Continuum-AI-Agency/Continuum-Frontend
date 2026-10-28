// Delivery-state tests (bun test).
//
// The case that matters most here is the SPARSE series. Meta omits days with no
// delivery and nothing in the pipeline fills a date spine, so an ad set that has been
// dark for ten days arrives with its last daily row ten days old — and a reader that
// walks the array instead of the calendar sees a healthy tail and reports nothing.
import { expect, test } from 'bun:test';
import {
  calendarDayIn,
  countDarkDays,
  DEFAULT_CONFIG,
  evaluateDelivery,
  evaluateFatigue,
  impressionsWeekOverWeek,
  readDelivery,
  reachExpansionOf,
} from '../src/index';
import type { AdSetSnapshot, DailyMetrics, WindowMetrics } from '../src/index';

const w = (spend: number, purchases: number, clicks = 0, impressions = 0): WindowMetrics => ({
  spend,
  purchases,
  addToCarts: 0,
  clicks,
  impressions,
});

const day = (date: string, impressions: number): DailyMetrics => ({
  date,
  spend: impressions > 0 ? 10 : 0,
  purchases: 0,
  addToCarts: 0,
  clicks: 0,
  impressions,
});

const ASOF = '2026-09-06';

/** Dates counting back from ASOF: back(1) is yesterday, the last COMPLETE day. */
const back = (n: number): string =>
  new Date(Date.parse(`${ASOF}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

const snap = (over: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
  id: 'as1',
  status: 'active',
  currentBudget: 100,
  ageDays: 60,
  windows: { d3: w(300, 5, 50, 3000), d7: w(700, 12, 120, 7000), d14: w(1400, 25, 250, 14000) },
  ...over,
});

// --- countDarkDays ----------------------------------------------------------

test('a sparse series reports the real outage, not the length of the array', () => {
  // Delivered until 11 days ago, then nothing. Meta returns NO rows for the dark days,
  // so the series simply ends — the exact shape that used to read as healthy.
  const daily = [day(back(14), 5000), day(back(13), 4800), day(back(12), 4600)];
  expect(countDarkDays(snap({ daily }), ASOF)).toBe(11);
});

test("today is excluded — the cycle's own day is always partial", () => {
  // Delivered yesterday. A zero on ASOF itself must not count as an outage.
  const daily = [day(back(1), 4000), day(ASOF, 0)];
  expect(countDarkDays(snap({ daily }), ASOF)).toBe(0);
});

test('explicit zero rows count the same as absent ones', () => {
  const daily = [day(back(4), 4000), day(back(3), 0), day(back(2), 0), day(back(1), 0)];
  expect(countDarkDays(snap({ daily }), ASOF)).toBe(3);
});

test('a young ad set is never darker than it is old', () => {
  const daily = [day(back(1), 0)];
  expect(countDarkDays(snap({ daily, ageDays: 2 }), ASOF)).toBe(2);
});

test('no series, or no anchor, is UNKNOWN — never zero and never dark', () => {
  expect(countDarkDays(snap({ daily: [] }), ASOF)).toBeNull();
  expect(countDarkDays(snap(), ASOF)).toBeNull();
  expect(countDarkDays(snap({ daily: [day(back(1), 100)] }), undefined)).toBeNull();
});

test('a date repeated across shard boundaries is taken once, not summed', () => {
  // Both rows are the same day re-fetched. Summing would invent delivery; taking the max
  // keeps the day honest either way — here it must still read as delivered.
  const daily = [day(back(1), 0), day(back(1), 900)];
  expect(countDarkDays(snap({ daily }), ASOF)).toBe(0);
});

// --- impressionsWeekOverWeek ------------------------------------------------

test('week over week needs both weeks to exist', () => {
  const daily = [day(back(1), 1000), day(back(2), 1000)];
  expect(impressionsWeekOverWeek(snap({ daily, ageDays: 5 }), ASOF)).toBeNull();
});

test('week over week reads a halving off the densified spine', () => {
  const daily = [];
  for (let n = 8; n <= 14; n += 1) daily.push(day(back(n), 1000));
  for (let n = 1; n <= 7; n += 1) daily.push(day(back(n), 500));
  const ratio = impressionsWeekOverWeek(snap({ daily }), ASOF);
  expect(ratio).toBeCloseTo(0.5, 5);
});

// --- reach ------------------------------------------------------------------

test('reach expansion is null unless both windows landed', () => {
  expect(reachExpansionOf(snap({ delivery: { reach7d: 1000 } }))).toBeNull();
  expect(reachExpansionOf(snap({ delivery: { reach7d: 0, reach14d: 500 } }))).toBeNull();
  expect(reachExpansionOf(snap({ delivery: { reach7d: 1000, reach14d: 1080 } }))).toBeCloseTo(
    1.08,
    5,
  );
});

// --- readDelivery -----------------------------------------------------------

test('unknown delivery resolves to serving, so it can never silence the account', () => {
  // This read GATES the performance triggers. If the delivery fields stop arriving, the
  // engine must behave exactly as it did before they existed — not go quiet everywhere.
  const read = readDelivery(snap(), undefined);
  expect(read.state).toBe('serving');
  expect(read.darkDays).toBeNull();
});

test('three consecutive dark days is dark; two is not', () => {
  const two = [day(back(3), 4000), day(back(2), 0), day(back(1), 0)];
  expect(readDelivery(snap({ daily: two }), ASOF).state).toBe('serving');
  const three = [day(back(4), 4000), day(back(3), 0), day(back(2), 0), day(back(1), 0)];
  expect(readDelivery(snap({ daily: three }), ASOF).state).toBe('dark');
});

test('halved delivery at an unchanged budget is throttled', () => {
  const daily = [];
  for (let n = 8; n <= 14; n += 1) daily.push(day(back(n), 1000));
  for (let n = 1; n <= 7; n += 1) daily.push(day(back(n), 300));
  expect(readDelivery(snap({ daily }), ASOF).state).toBe('throttled');
});

// --- evaluateDelivery -------------------------------------------------------

test('D1 fires for an ad set that just left the ACTIVE roster', () => {
  const out = evaluateDelivery(
    [],
    [{ adsetId: 'gone', adsetName: 'Vivo47 VR', missingSince: '2026-09-04T00:00:00.000Z' }],
    ASOF,
  );
  expect(out.recommendations.length).toBe(1);
  expect(out.recommendations[0].trigger).toBe('D1_off_meta');
  expect(out.recommendations[0].kind).toBe('restore_delivery');
  expect(out.recommendations[0].reason).toContain('Vivo47 VR');
});

test('D1 counts calendar days from the day it went missing — never -1 on the same day', () => {
  // markPresence stamps missing_since with the cycle's own timestamp, so on the first cycle
  // it is a mid-day instant on the asOf day. A timestamp against that day's midnight floored
  // to -1; day against day is 0.
  const sameDay = evaluateDelivery(
    [],
    [{ adsetId: 'gone', missingSince: `${ASOF}T06:00:12.345+00:00` }],
    ASOF,
  ).recommendations[0];
  expect(sameDay.evidence?.value).toBe(0);
  expect(sameDay.evidence?.missingSinceDay).toBe(ASOF);
  expect(sameDay.evidence?.comparator).toBe(`not ACTIVE on Meta since ${ASOF}`);
  expect(sameDay.evidence?.title?.comparator).toContain(`desde ${ASOF}`);

  // An instant written with an offset lands on its UTC day — the frame asOf is in.
  const twoDays = evaluateDelivery(
    [],
    [{ adsetId: 'gone', missingSince: '2026-09-03T22:30:00-03:00' }],
    ASOF,
  ).recommendations[0];
  expect(twoDays.evidence?.missingSinceDay).toBe('2026-09-04');
  expect(twoDays.evidence?.value).toBe(2);
});

test("D1 dates the absence on the account's own calendar when the cycle holds its timezone", () => {
  // 02:00Z on the 21st is 20:00 on the 20th in Mexico City: the account's day is the 20th.
  const gone = [{ adsetId: 'gone', missingSince: '2026-10-21T02:00:00Z' }];
  const local = evaluateDelivery([], gone, '2026-10-20', null, undefined, 'America/Mexico_City')
    .recommendations[0];
  expect(local.evidence?.missingSinceDay).toBe('2026-10-20');
  expect(local.evidence?.value).toBe(0);
  expect(local.reason).toContain('since 2026-10-20');

  // No timezone: UTC, as before the envelope carried one.
  const utc = evaluateDelivery([], gone, '2026-10-21', null, undefined, null).recommendations[0];
  expect(utc.evidence?.missingSinceDay).toBe('2026-10-21');
  expect(utc.evidence?.value).toBe(0);
});

test('calendarDayIn falls back to UTC on a zone Intl cannot read', () => {
  expect(calendarDayIn('2026-10-21T02:00:00Z', 'America/Mexico_City')).toBe('2026-10-20');
  expect(calendarDayIn('2026-10-21T02:00:00Z', 'Not/AZone')).toBe('2026-10-21');
  expect(calendarDayIn('2026-10-21T02:00:00Z')).toBe('2026-10-21');
  expect(calendarDayIn('garbage', 'UTC')).toBeNull();
});

test('a long-departed ad set is enrollment state, not a fresh finding', () => {
  // 73 ad sets on the live account carry missing_since. Re-raising all of them every
  // cycle buries the ones a human can still act on.
  const out = evaluateDelivery(
    [],
    [{ adsetId: 'gone', missingSince: '2026-07-30T00:00:00.000Z' }],
    ASOF,
  );
  expect(out.recommendations.length).toBe(0);
});

test('D2 — ACTIVE, funded, and serving nothing — quotes Meta rather than guessing', () => {
  const daily = [day(back(6), 4000)];
  const s = snap({
    daily,
    delivery: { blockers: ['AD_SET_AUDIENCE_TOO_SMALL'] },
  });
  const out = evaluateDelivery([s], [], ASOF);
  const d2 = out.recommendations.find((r) => r.trigger === 'D2_dark_with_budget');
  expect(d2).toBeDefined();
  expect(d2?.severity).toBe('high');
  expect(d2?.reason).toContain('AD_SET_AUDIENCE_TOO_SMALL');
  // And the ad set is withheld from every performance stage this cycle.
  expect(out.suppressIds.has('as1')).toBe(true);
});

test('a dark ad set with no budget is not a delivery finding', () => {
  const s = snap({ daily: [day(back(6), 4000)], currentBudget: 0 });
  const out = evaluateDelivery([s], [], ASOF);
  expect(out.recommendations.some((r) => r.trigger === 'D2_dark_with_budget')).toBe(false);
});

test('D3 reports LEARNING_LIMITED on an ad set that is still delivering', () => {
  const s = snap({
    daily: [day(back(1), 4000)],
    delivery: { blockers: [], learningStage: 'LEARNING_LIMITED' },
  });
  const out = evaluateDelivery([s], [], ASOF);
  expect(out.recommendations.some((r) => r.trigger === 'D3_learning_limited')).toBe(true);
});

// --- F3 ---------------------------------------------------------------------

// Still converting, recent CPA well above the 14d baseline: 14d $40, 3d $60.
const decaying = (over: Partial<AdSetSnapshot> = {}): AdSetSnapshot =>
  snap({
    windows: { d3: w(600, 10, 50, 3000), d7: w(1800, 35, 150, 9000), d14: w(4000, 100, 400, 24000) },
    ...over,
  });

test('F3 fires on a flat reach curve at a frequency F2 would never reach', () => {
  const recs = evaluateFatigue(
    [decaying({ frequency7d: 1.6 })],
    DEFAULT_CONFIG,
    new Set(),
    new Map([['as1', readDelivery(decaying({ delivery: { reach7d: 1000, reach14d: 1050 } }))]]),
  );
  expect(recs.length).toBe(1);
  expect(recs[0].trigger).toBe('F3_audience_exhausted');
  expect(recs[0].kind).toBe('audience_expand');
});

test('a reach curve that is still growing is not exhausted', () => {
  const recs = evaluateFatigue(
    [decaying({ frequency7d: 1.6 })],
    DEFAULT_CONFIG,
    new Set(),
    new Map([['as1', readDelivery(decaying({ delivery: { reach7d: 1000, reach14d: 1800 } }))]]),
  );
  expect(recs.every((r) => r.trigger !== 'F3_audience_exhausted')).toBe(true);
});

test('without a reach read F3 stays silent — unknown is not flat', () => {
  const recs = evaluateFatigue([decaying({ frequency7d: 1.6 })], DEFAULT_CONFIG);
  expect(recs.every((r) => r.trigger !== 'F3_audience_exhausted')).toBe(true);
});
