import { describe, expect, it } from 'bun:test';
import {
  accountCountsFrom,
  businessFrom,
  portfolioSignalsFrom,
  savedGoalFrom,
} from './brandSignals';

const account = (type: string | null, status: string | null = null) => ({ type, status });

describe('accountCountsFrom', () => {
  it('splits the facebook bucket by asset type and skips a Google Ads manager', () => {
    expect(
      accountCountsFrom({
        facebook: { accounts: [account('meta_ad_account'), account('meta_page')] },
        instagram: { accounts: [account('meta_instagram_account')] },
        googleAds: { accounts: [account('ads_customer'), account('ads_customer', 'manager')] },
        tiktok: { accounts: [account('tiktok_user')] },
        tiktokAds: { accounts: [account('tiktok_advertiser')] },
        googleAnalytics: { accounts: [account('ga4_property')] },
      }),
    ).toEqual({ ads: 3, organic: 3 });
  });

  it('counts nothing for an empty summary', () => {
    expect(accountCountsFrom({})).toEqual({ ads: 0, organic: 0 });
  });
});

describe('portfolioSignalsFrom', () => {
  it('reads the optimizer_list_portfolios fields the reading uses', () => {
    expect(
      portfolioSignalsFrom([
        {
          id: 'b9cebbcf',
          name: 'Leads // Google Ads only',
          apply_mode: 'recommend',
          status: 'active',
          autopilot_paused: false,
          pending_recommendations: 1,
          pending_budget_moves: 0,
          stale_for_days: null,
          roster_state: 'present',
        },
      ]),
    ).toEqual([
      {
        id: 'b9cebbcf',
        name: 'Leads // Google Ads only',
        applyMode: 'recommend',
        status: 'active',
        autopilotPaused: false,
        pendingRecommendations: 1,
        pendingBudgetMoves: 0,
        staleForDays: null,
        rosterAbsent: false,
        // A row that names no platform predates the projection: a Meta portfolio, writable.
        canWrite: true,
      },
    ]);
  });

  // PP-DT-E-home-approve-client-executes: Pink Elephant's portfolio (platforms google_ads,
  // platform_writes {google_ads: false}) is one Continuum cannot write for.
  it('reads whether Continuum may write any platform the portfolio is on', () => {
    const canWrite = (row: Record<string, unknown>) =>
      portfolioSignalsFrom([
        {
          id: 'p',
          name: 'P',
          apply_mode: 'recommend',
          status: 'active',
          ...row,
        },
      ])[0]?.canWrite;
    expect(canWrite({ platforms: ['google_ads'], platform_writes: { google_ads: false } })).toBe(
      false,
    );
    expect(canWrite({ platforms: ['google_ads'], platform_writes: {} })).toBe(false);
    expect(canWrite({ platforms: ['google_ads'], platform_writes: { google_ads: true } })).toBe(
      true,
    );
    expect(canWrite({ platforms: ['meta'], platform_writes: {} })).toBe(true);
    expect(
      canWrite({
        platforms: ['meta', 'google_ads'],
        platform_writes: { meta: false, google_ads: false },
      }),
    ).toBe(false);
    // A row from before the projection: every such portfolio is Meta, which writes unless
    // its row is switched off.
    expect(canWrite({})).toBe(true);
  });

  it('drops a row it cannot read instead of failing the Home', () => {
    expect(portfolioSignalsFrom([{ id: 'x', apply_mode: 'mystery' }, null])).toEqual([]);
    expect(portfolioSignalsFrom({ error: 'nope' })).toEqual([]);
  });
});

describe('businessFrom', () => {
  it('puts the Brand Book calls to action first, then the descriptions', () => {
    expect(
      businessFrom({
        structuredBusiness: {
          business_cta: 'Claim your free family day pass',
          alt_ctas: ['Schedule a comfortable 15-minute facility tour', ''],
          business_description: 'Comfortable neighborhood gyms for families.',
        },
        headline: 'Haz ejercicio en familia',
        brandDescription: null,
      }),
    ).toEqual({
      calls: ['Claim your free family day pass', 'Schedule a comfortable 15-minute facility tour'],
      descriptions: ['Comfortable neighborhood gyms for families.', 'Haz ejercicio en familia'],
    });
  });

  it('is null when onboarding learned nothing', () => {
    expect(businessFrom({ structuredBusiness: null, headline: null, brandDescription: ' ' })).toBe(
      null,
    );
  });
});

describe('savedGoalFrom', () => {
  it("takes the brand row's primary goal and ignores account rows", () => {
    expect(
      savedGoalFrom([
        {
          brand_id: 'b',
          scope: 'act_1',
          source: 'user',
          objectives: [{ id: 'leads', label: 'Leads', metric: 'leads', role: 'primary' }],
        },
        {
          brand_id: 'b',
          scope: 'brand',
          source: 'user',
          objectives: [
            { id: 'tours', label: 'Tours booked', metric: 'purchases', role: 'primary' },
          ],
        },
      ]),
    ).toEqual({ id: 'tours', label: 'Tours booked', metric: 'purchases', role: 'primary' });
    expect(savedGoalFrom([])).toBeNull();
  });
});
