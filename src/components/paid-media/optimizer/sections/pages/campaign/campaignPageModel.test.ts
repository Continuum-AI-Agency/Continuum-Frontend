import { describe, expect, it } from 'bun:test';
import { type GoogleTopCampaigns, paidAccountOverviewSchema } from '@continuum/contracts';
import {
  AMBIGUOUS,
  DISPLAY,
  EKATAR,
  GOALS,
  HISTORY,
  WITH_E1,
} from '../../google/__fixtures__/googleTab';
import { type CampaignView, campaignViews } from '../../google/campaignExplorerModel';
import {
  auctionSlices,
  campaignKind,
  campaignKpis,
  campaignTabs,
  campaignTrend,
  changeActor,
  changeMarks,
  kindLabel,
} from './campaignPageModel';

function view(read: GoogleTopCampaigns, id: string): CampaignView {
  const found = campaignViews(read, GOALS, 'MXN').find((row) => row.id === id);
  if (!found) throw new Error(`no campaign ${id}`);
  return found;
}

/** EKATAR's row read as Performance Max: the tiles follow the type, the figures stay its own. */
const asPmax = (read: GoogleTopCampaigns): GoogleTopCampaigns => ({
  ...read,
  rows: read.rows.map((row) =>
    row.id === EKATAR ? { ...row, labels: { channel_type: 'PERFORMANCE_MAX' } } : row,
  ),
});

const tiles = (campaign: CampaignView) =>
  campaignKpis(campaign, 'MXN').map((tile) => [
    tile.label,
    tile.figure.value ?? tile.figure.reason,
  ]);

describe('campaignKind', () => {
  it("reads Google's channel type, and anything unknown as another campaign", () => {
    expect(campaignKind('SEARCH')).toBe('search');
    expect(campaignKind('PERFORMANCE_MAX')).toBe('pmax');
    expect(campaignKind('DEMAND_GEN')).toBe('video');
    expect(campaignKind(null)).toBe('other');
    expect(kindLabel('other')).toBe('Other campaign');
    expect(kindLabel('video')).toBe('YouTube / Demand Gen');
  });
});

describe('campaignKpis', () => {
  it('leads a Search campaign with what it buys by the click, every figure its own', () => {
    expect(tiles(view(WITH_E1, EKATAR))).toEqual([
      ['Spend', '$36,997 MXN'],
      ['Clicks', '4,816'],
      ['CTR', '2.98%'],
      ['CPC', '$7.68 MXN'],
      ['Conversions', '26'],
      ['Cost / conv.', '$1,422 MXN'],
    ]);
  });

  it('leads Performance Max with its conversions and their cost', () => {
    expect(tiles(view(asPmax(WITH_E1), EKATAR)).map(([label]) => label)).toEqual([
      'Spend',
      'Conversions',
      'Cost / conv.',
      'CTR',
    ]);
  });

  it('dashes a count the read does not have, with why', () => {
    const ambiguous = view(AMBIGUOUS, EKATAR);
    const byLabel = Object.fromEntries(tiles(ambiguous));
    expect(byLabel['Cost / conv.']).toBe('No single result defined');
  });

  it('reads Display by its clicks', () => {
    expect(tiles(view(WITH_E1, DISPLAY)).map(([label]) => label)).toEqual([
      'Spend',
      'Clicks',
      'CTR',
      'Conversions',
    ]);
  });
});

// Two weeks of one campaign, as the paid-media-metrics `campaign` scope answers: Oct 6 has no
// row (Google returns none for a day without impressions) and Oct 7 spent nothing.
const DAILY = paidAccountOverviewSchema.parse({
  metrics: { spend: 9_000, roas: 0, ctr: 3.1 },
  result_basis: { rule: 'google_conversion_rule_v1', bucket: 'leads', unambiguous: true },
  trends: [
    { date: '2026-10-01', spend: 900, clicks: 120, conversions: 1 },
    { date: '2026-10-02', spend: 800, clicks: 100, conversions: 0 },
    { date: '2026-10-03', spend: 1000, clicks: 130, conversions: 2 },
    { date: '2026-10-04', spend: 700, clicks: 90, conversions: 1 },
    { date: '2026-10-05', spend: 600, clicks: 80, conversions: 0 },
    { date: '2026-10-07', spend: 0, clicks: 0, conversions: 0 },
    { date: '2026-10-08', spend: 900, clicks: 110, conversions: 1 },
  ],
});
const WEEK = { since: '2026-10-01', until: '2026-10-08' };

describe('campaignTrend', () => {
  it('prices each day over the trailing seven, against the goal, with the dark days counted', () => {
    const trend = campaignTrend(DAILY, WEEK, 900);
    expect(trend.metric).toBe('cost_per_conversion');
    expect(trend.label).toBe('Cost per conversion, trailing 7 days');
    expect(trend.goal).toBe(900);
    expect(trend.days.map((day) => day.day)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
    ]);
    // Oct 1: 900 / 1. Oct 3: 2,700 / 3. Oct 8: Oct 2–8 is 4,000 over 4.
    expect(trend.days[0]?.value).toBe(900);
    expect(trend.days[2]?.value).toBe(900);
    expect(trend.days[7]?.value).toBe(1000);
    expect(trend.days.map((day) => day.dark)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
    ]);
    expect(trend.darkDays).toBe(2);
    expect(trend.last).toEqual({ day: '2026-10-08', value: 1000 });
  });

  it('falls back to the cost per click where conversions are not counted, and draws no goal', () => {
    const ambiguous = paidAccountOverviewSchema.parse({
      ...DAILY,
      result_basis: { rule: 'google_conversion_rule_v1', bucket: null, unambiguous: false },
      trends: DAILY.trends?.map((row) => ({ ...row, conversions: null })),
    });
    const trend = campaignTrend(ambiguous, WEEK, 900);
    expect(trend.metric).toBe('cpc');
    expect(trend.label).toBe('Cost per click');
    expect(trend.goal).toBeNull();
    expect(trend.days[0]?.value).toBe(7.5);
    // A day that spent nothing has nothing to price.
    expect(trend.days[5]?.value).toBeNull();
  });

  it('never prices under one conversion: the line has a gap there', () => {
    const thin = paidAccountOverviewSchema.parse({
      ...DAILY,
      trends: [{ date: '2026-10-01', spend: 500, clicks: 50, conversions: 0.5 }],
    });
    const trend = campaignTrend(thin, { since: '2026-10-01', until: '2026-10-02' }, null);
    expect(trend.metric).toBe('cpc');
    expect(trend.last).toEqual({ day: '2026-10-01', value: 10 });
  });
});

describe('changeMarks', () => {
  const SEPT_OCT = { since: '2026-09-29', until: '2026-10-28' };

  it("marks the campaign's own changes on their day, by the channel that made them", () => {
    expect(changeMarks({ status: 'ready', history: HISTORY }, EKATAR, SEPT_OCT)).toEqual([
      { day: '2026-10-23', actor: 'api', count: 1, label: 'Campaign changed' },
    ]);
    expect(changeMarks({ status: 'ready', history: HISTORY }, DISPLAY, SEPT_OCT)).toEqual([
      { day: '2026-10-02', actor: 'person', count: 1, label: 'Ad added' },
    ]);
  });

  it('leaves out what falls outside the window, and reads nothing from a history not read', () => {
    expect(
      changeMarks({ status: 'ready', history: HISTORY }, EKATAR, {
        since: '2026-10-24',
        until: '2026-10-28',
      }),
    ).toEqual([]);
    expect(changeMarks({ status: 'loading' }, EKATAR, SEPT_OCT)).toEqual([]);
  });

  it("tells a person's change from the API's and from Google's own automation", () => {
    expect(changeActor({ clientType: 'GOOGLE_ADS_API' })).toBe('api');
    expect(changeActor({ clientType: 'GOOGLE_ADS_EDITOR' })).toBe('person');
    expect(changeActor({ clientType: 'GOOGLE_ADS_RECOMMENDATIONS' })).toBe('google');
  });
});

describe('auctionSlices', () => {
  it("splits a Search campaign's auctions into shown, lost to budget and lost to rank", () => {
    expect(auctionSlices(view(WITH_E1, EKATAR))?.map((slice) => [slice.key, slice.share])).toEqual([
      ['shown', 0.42],
      ['budget', 0.28],
      ['rank', 0.3],
    ]);
  });

  it('draws no auction for a campaign Google reports no impression share for', () => {
    expect(auctionSlices(view(WITH_E1, DISPLAY))).toBeNull();
  });
});

describe('campaignTabs', () => {
  it('opens each type on what it is bought by', () => {
    expect(campaignTabs('search')).toEqual(['keywords', 'terms', 'quality']);
    expect(campaignTabs('pmax')).toEqual(['groups', 'channels']);
    expect(campaignTabs('video')).toEqual(['channels']);
  });
});
