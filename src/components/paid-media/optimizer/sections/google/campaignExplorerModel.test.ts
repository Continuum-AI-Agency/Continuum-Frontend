import { describe, expect, it } from 'bun:test';
import {
  AMBIGUOUS,
  BEFORE_E1,
  BID_CARD,
  BUDGET_CARD,
  EKATAR,
  GOALS,
  GOURMETERIA,
  HISTORY,
  NOW,
  SEARCH_GOAL,
  VALLE_REAL,
  WITH_E1,
} from './__fixtures__/googleTab';
import {
  biddingViews,
  campaignGoals,
  campaignViews,
  changeHistoryWindow,
  changeLine,
  goalBand,
  type HistoryRead,
  NO_TARGET,
  NOT_AMONG_TOP,
  portfolioCampaignViews,
  typeRows,
} from './campaignExplorerModel';
import { NOT_IN_THIS_READ } from './googleReads';

const READY: HistoryRead = { status: 'ready', history: HISTORY };

describe('goalBand: the portfolio CPA goal, never Google target CPA', () => {
  it('reads "no target" with its reason when no portfolio holds the campaign', () => {
    expect(goalBand(120, 10, null, 'MXN')).toMatchObject({
      kind: 'no_target',
      label: NO_TARGET,
      reason: 'No portfolio holds it',
    });
  });

  it('reads "no target" for a portfolio with no goal, or one priced in another currency', () => {
    expect(goalBand(120, 10, { ...SEARCH_GOAL, goal: null }, 'MXN').reason).toBe(
      'Vivo 47 // Search leads has no CPA goal',
    );
    expect(goalBand(120, 10, { ...SEARCH_GOAL, currency: 'USD' }, 'MXN').reason).toBe(
      "Vivo 47 // Search leads's goal is in USD; the account bills in MXN",
    );
  });

  it('holds ±5% as on goal and names the distance otherwise', () => {
    expect(goalBand(930, 3, SEARCH_GOAL, 'MXN').label).toBe('on goal');
    expect(goalBand(1350, 3, SEARCH_GOAL, 'MXN').label).toBe('50% over goal');
    expect(goalBand(720, 3, SEARCH_GOAL, 'MXN').label).toBe('20% under goal');
    expect(goalBand(null, 0, SEARCH_GOAL, 'MXN').kind).toBe('no_results');
  });

  it('prices nothing when the account has no single result', () => {
    expect(goalBand(null, null, SEARCH_GOAL, 'MXN')).toMatchObject({
      kind: 'unpriced',
      label: '—',
    });
  });
});

describe('campaignGoals', () => {
  it("maps each Google member to its portfolio's goal and skips Meta members", () => {
    const goals = campaignGoals(
      [{ id: 'p1', name: 'Search', cpa_target: 900, currency: 'mxn' }],
      new Map([
        [
          'p1',
          [
            { platform: 'google_ads', entityId: EKATAR },
            { platform: 'meta', entityId: '1200' },
          ],
        ],
      ]),
    );
    expect([...goals.keys()]).toEqual([EKATAR]);
    expect(goals.get(EKATAR)).toEqual({
      portfolioId: 'p1',
      portfolioName: 'Search',
      goal: 900,
      currency: 'MXN',
    });
  });
});

describe('campaignViews', () => {
  it('prices each campaign of the read against its goal, by spend', () => {
    const views = campaignViews(WITH_E1, GOALS, 'MXN');
    expect(views.map((view) => [view.name, view.typeLabel, view.band.label])).toEqual([
      ['VIVO 47-EKATAR', 'Search', '58% over goal'],
      ['Display', 'Display', NO_TARGET],
      ['Gourmetería', 'Search', '11% under goal'],
      ['Valle Real-Search', 'Search', '47% over goal'],
      ['Remarketing Gourmetería | Vivo 47 | 2025', 'Display', NO_TARGET],
      ['DP | VIVO 47 | Socios', 'Display', NO_TARGET],
      ['Remarketing Valle Real | Vivo 47 | 2025', 'Display', NO_TARGET],
    ]);
    const ekatar = views[0];
    expect(ekatar?.budgetLost).toEqual({ value: 0.28, reason: null });
    expect(views[1]?.budgetLost.reason).toBe(
      'Google reports impression share only for campaigns that serve on Search',
    );
  });

  it('says why every E1 figure is "—" on a payload cached before E1', () => {
    const [first] = campaignViews(BEFORE_E1, GOALS, 'MXN');
    for (const figure of [first?.status, first?.budgetPerDay, first?.rankLost]) {
      expect(figure).toEqual({ value: null, reason: NOT_IN_THIS_READ });
    }
  });

  it('never claims "in no portfolio" when the members read failed', () => {
    const [ekatar] = campaignViews(WITH_E1, new Map(), 'MXN', 'members unread');
    expect(ekatar?.band).toMatchObject({ kind: 'unpriced', reason: 'members unread' });
  });
});

describe('typeRows: the account read by campaign type', () => {
  it('holds a type to the one goal its campaigns share, and reads "no target" where none is held', () => {
    const rows = typeRows(campaignViews(WITH_E1, GOALS, 'MXN'), 'MXN');
    expect(rows.map((row) => [row.label, row.campaigns, row.sharePct, row.band.label])).toEqual([
      ['Search', 3, 81, '46% over goal'],
      ['Display', 4, 19, NO_TARGET],
    ]);
    expect(Math.round(rows[0]?.cost ?? 0)).toBe(1315);
  });

  it('reads "—" with a reason for a type split across goals', () => {
    const split = new Map(GOALS);
    split.set(VALLE_REAL, { ...SEARCH_GOAL, portfolioId: 'p2', goal: 1500 });
    const [search] = typeRows(campaignViews(WITH_E1, split, 'MXN'), 'MXN');
    expect(search?.band).toMatchObject({ kind: 'mixed', label: '—' });
    expect(search?.band.reason).toContain('different goals');
  });

  it('counts nothing when the account has no single result', () => {
    const [search] = typeRows(campaignViews(AMBIGUOUS, GOALS, 'MXN'), 'MXN');
    expect(search?.conversions).toBeNull();
    expect(search?.band.kind).toBe('unpriced');
  });
});

describe('biddingViews', () => {
  const views = campaignViews(WITH_E1, GOALS, 'MXN');

  it("reads Google's target, the ±10% step, the cooldown since the last change, and G07's proposal", () => {
    const [ekatar] = biddingViews(views, READY, [BID_CARD], NOW);
    expect(ekatar).toMatchObject({
      id: EKATAR,
      strategy: { value: 'Target CPA' },
      learning: { value: 'Learned' },
      isLearning: false,
      targetKind: 'cpa',
      target: { value: 1200 },
      lastChange: { value: { before: 1300, after: 1200 } },
      cooldown: { state: 'wait', daysLeft: 10, until: '2026-11-06' },
      proposal: { current: 1200, proposed: 1080, strategy: 'target_cpa' },
    });
    expect(ekatar?.step?.low).toBeCloseTo(1080);
    expect(ekatar?.step?.high).toBeCloseTo(1320);
    expect(Math.round(ekatar?.actual.value ?? 0)).toBe(1422);
  });

  it('marks a learning strategy and clears the cooldown when the history holds no change', () => {
    const gourmeteria = biddingViews(views, READY, [], NOW).find((row) => row.id === GOURMETERIA);
    expect(gourmeteria).toMatchObject({
      learning: { value: 'Learning: a setting changed' },
      isLearning: true,
      target: { value: null, reason: expect.stringContaining('No target on the campaign itself') },
      lastChange: { reason: "No target change in Google's change history since Sep 29" },
      cooldown: { state: 'clear' },
      proposal: null,
    });
  });

  it('says why when there is no target to move, or the history could not be read', () => {
    const rows = biddingViews(views, { status: 'error' }, [], NOW);
    expect(rows.find((row) => row.name === 'Display')?.target.reason).toBe(
      'Manual CPC bids without a target to move',
    );
    expect(rows[0]?.cooldown).toEqual({
      state: 'unknown',
      reason: "Google's change history could not be read",
    });
  });
});

describe('portfolioCampaignViews', () => {
  it("shows each member's budget and target before → after from G03 and G07", () => {
    const rows = portfolioCampaignViews({
      members: [
        {
          platform: 'google_ads',
          entityId: VALLE_REAL,
          name: 'Valle Real-Search',
          channelType: 'SEARCH',
        },
        { platform: 'google_ads', entityId: EKATAR, name: 'VIVO 47-EKATAR', channelType: 'SEARCH' },
        { platform: 'google_ads', entityId: '999', name: 'Brand', channelType: 'SEARCH' },
      ],
      read: WITH_E1,
      goal: SEARCH_GOAL,
      cards: [BID_CARD, BUDGET_CARD],
      currency: 'MXN',
    });
    expect(
      rows.map((row) => [
        row.name,
        row.budgetBefore.value,
        row.budgetAfter,
        row.target.value,
        row.targetAfter,
      ]),
    ).toEqual([
      ['VIVO 47-EKATAR', 1179, null, 1200, 1080],
      ['Valle Real-Search', 120, 150, null, null],
      ['Brand', null, null, null, null],
    ]);
    expect(rows[2]?.spend).toEqual({ value: null, reason: NOT_AMONG_TOP });
  });
});

describe('changeLine', () => {
  it('says what changed, where, from what to what, and through which channel', () => {
    const [budget, target, ad] = HISTORY.changes.map(changeLine);
    expect(budget).toMatchObject({
      what: 'Budget changed',
      where: 'Valle Real-Search',
      detail: 'budget $100 MXN → $120 MXN',
      who: 'in Google Ads',
    });
    expect(target?.detail).toBe('target CPA $1,300 MXN → $1,200 MXN');
    expect(target?.who).toBe('through the API');
    expect(ad).toMatchObject({ what: 'Ad added', where: 'Display › Banners', detail: null });
  });
});

describe('changeHistoryWindow', () => {
  it('asks for the 30 days change_event holds, today included, and lets the edge clamp it', () => {
    expect(changeHistoryWindow(NOW)).toEqual({ since: '2026-09-28', until: '2026-10-29' });
  });
});
