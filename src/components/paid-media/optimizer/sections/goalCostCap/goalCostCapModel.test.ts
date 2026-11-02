import { describe, expect, it } from 'bun:test';
import { GOAL_AS_COST_CAP_PLATFORMS } from '@continuum/contracts';
import {
  bidSettingsPhrase,
  DEFAULT_BID_STEP_FRACTION,
  GOAL_COST_CAP_LABEL,
  goalCostCapAvailability,
  goalCostCapErrorMessage,
  goalCostCapHelp,
  isCpaGoalMetric,
} from './goalCostCapModel';

describe('bidSettingsPhrase', () => {
  it('names the bid setting of every platform the checkbox acts on, from the contracts constant', () => {
    expect(bidSettingsPhrase(GOAL_AS_COST_CAP_PLATFORMS)).toBe(
      'Google Ads target CPA (bid setting) of each campaign and the Meta cost cap (bid setting) of each ad set already bidding with a cost cap',
    );
  });

  it('names one platform alone, and lists three', () => {
    expect(bidSettingsPhrase(['google_ads'])).toBe(
      'Google Ads target CPA (bid setting) of each campaign',
    );
    expect(bidSettingsPhrase(['google_ads', 'meta', 'tiktok_ads'])).toBe(
      'Google Ads target CPA (bid setting) of each campaign, the Meta cost cap (bid setting) of each ad set already bidding with a cost cap and the TikTok cost cap (bid setting) of each ad group',
    );
  });
});

describe('goalCostCapHelp', () => {
  it('unchecked: the goal is only measured and bid settings are never changed', () => {
    expect(goalCostCapHelp({ enabled: false, maxChangePctPerCycle: 0.1 })).toBe(
      'The Optimizer measures the portfolio against this goal and never changes bid settings on the platforms.',
    );
  });

  it("checked: names the platforms' bid settings and the portfolio's per-cycle step", () => {
    expect(goalCostCapHelp({ enabled: true, maxChangePctPerCycle: 0.1 })).toBe(
      'The Optimizer proposes setting the Google Ads target CPA (bid setting) of each campaign and the Meta cost cap (bid setting) of each ad set already bidding with a cost cap to this goal, in steps of up to 10% a day.',
    );
  });

  it('falls back to the engine default step when the portfolio sets none', () => {
    expect(DEFAULT_BID_STEP_FRACTION).toBe(0.2);
    for (const missing of [null, undefined, 0, -1, Number.NaN]) {
      expect(goalCostCapHelp({ enabled: true, maxChangePctPerCycle: missing })).toContain(
        'in steps of up to 20% a day.',
      );
    }
  });

  it('rounds a fractional step to at most one decimal', () => {
    expect(goalCostCapHelp({ enabled: true, maxChangePctPerCycle: 0.125 })).toContain(
      'up to 12.5% a day',
    );
    expect(goalCostCapHelp({ enabled: true, maxChangePctPerCycle: 0.15 })).toContain(
      'up to 15% a day',
    );
  });

  it('accepts an explicit platform list', () => {
    expect(
      goalCostCapHelp({
        enabled: true,
        maxChangePctPerCycle: 0.2,
        platforms: ['google_ads', 'meta'],
      }),
    ).toBe(
      'The Optimizer proposes setting the Google Ads target CPA (bid setting) of each campaign and the Meta cost cap (bid setting) of each ad set already bidding with a cost cap to this goal, in steps of up to 20% a day.',
    );
  });
});

describe('isCpaGoalMetric', () => {
  it('is true for a cost per conversion and false for a cost per impression, click or view', () => {
    for (const metric of ['purchase', 'lead', 'signup', 'app_install', 'conversations', 'custom']) {
      expect(isCpaGoalMetric(metric)).toBe(true);
    }
    for (const metric of [
      'awareness',
      'traffic',
      'link_clicks',
      'clicks',
      'thruplays',
      'post_engagement',
      'nonsense',
      null,
    ]) {
      expect(isCpaGoalMetric(metric)).toBe(false);
    }
  });
});

describe('goalCostCapAvailability', () => {
  it('is available with a CPA-type metric and a positive goal', () => {
    expect(goalCostCapAvailability({ targetMetric: 'lead', goal: 36 })).toEqual({
      available: true,
    });
  });

  it('is unavailable without a goal, with the reason', () => {
    for (const goal of [null, 0, -3, Number.NaN]) {
      expect(goalCostCapAvailability({ targetMetric: 'lead', goal })).toEqual({
        available: false,
        reason: 'Set a portfolio CPA goal above to use it as the cost cap on the ad platforms.',
      });
    }
  });

  it('is unavailable when the goal is not a cost per conversion, naming what it is', () => {
    expect(goalCostCapAvailability({ targetMetric: 'awareness', goal: 12 })).toEqual({
      available: false,
      reason:
        "Only a cost-per-conversion goal can be the platforms' cost cap. This portfolio's goal is a CPM.",
    });
    expect(goalCostCapAvailability({ targetMetric: 'link_clicks', goal: 2 })).toEqual({
      available: false,
      reason:
        "Only a cost-per-conversion goal can be the platforms' cost cap. This portfolio's goal is a cost per link click.",
    });
  });
});

describe('goalCostCapErrorMessage', () => {
  it('turns each setter error code into plain English', () => {
    expect(goalCostCapErrorMessage({ code: '22023', message: 'p_enabled is null' })).toBe(
      'The change was not accepted. Reload the page and try again.',
    );
    expect(goalCostCapErrorMessage({ code: 'P0002' })).toBe(
      'This portfolio no longer exists. Reload the page.',
    );
    expect(goalCostCapErrorMessage({ code: '42501' })).toBe(
      "You don't have access to change this portfolio. Ask a member of the brand.",
    );
    expect(goalCostCapErrorMessage({ code: 'PGRST202' })).toBe(
      "This setting isn't available yet. The server needs an update first.",
    );
  });

  it('falls back to a generic sentence for anything else, never the raw database text', () => {
    expect(goalCostCapErrorMessage({ code: '57014', message: 'canceling statement' })).toBe(
      "The setting couldn't be saved. Try again.",
    );
    expect(goalCostCapErrorMessage(new Error('fetch failed'))).toBe(
      "The setting couldn't be saved. Try again.",
    );
    expect(goalCostCapErrorMessage(null)).toBe("The setting couldn't be saved. Try again.");
  });
});

it('labels the checkbox with the product wording', () => {
  expect(GOAL_COST_CAP_LABEL).toBe('Use this goal as the cost cap on the ad platforms');
});
