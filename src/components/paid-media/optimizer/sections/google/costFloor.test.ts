import { describe, expect, it } from 'bun:test';
import {
  type CampaignGroup,
  costPerConversion,
  costPerResult,
} from '../platforms/googleAdsOverviewModel';
import { costOf } from './campaignExplorerModel';

// PP-DT-B-pmax-cpa-from-fractional-conversions (G8 F13). Vivo 47's Google tab printed
// "Performance Max: $68,187 MXN per conversion": 7,155.26 MXN over 0.05 of a conversion
// (data-driven attribution splits conversions into fractions). A cost per result from less than
// one result is not a cost anyone paid; under one result the tab says so instead of pricing it.

const PMAX_SPEND = 7155.26;

describe('no cost per result below one result', () => {
  it('a campaign type with 0.05 conversions has no cost per conversion', () => {
    expect(costOf(PMAX_SPEND, 0.05)).toBeNull();
    expect(costPerConversion({ spend: PMAX_SPEND, conversions: 0.05 } as CampaignGroup)).toBeNull();
  });

  it('a result type counted below one has no cost per result', () => {
    expect(
      costPerResult(PMAX_SPEND, { leads: 0.05, signups: 0, purchases: 0 }, 'leads'),
    ).toBeNull();
  });

  it('one result and more are priced as before, fractions included', () => {
    expect(costOf(PMAX_SPEND, 2.18)).toBeCloseTo(PMAX_SPEND / 2.18, 6);
    expect(costOf(100, 1)).toBe(100);
    expect(costPerResult(450, { leads: 1.5, signups: 0, purchases: 0 }, 'leads')).toBe(300);
  });
});
