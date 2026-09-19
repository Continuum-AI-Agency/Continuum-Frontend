import { describe, expect, it } from 'bun:test';
import {
  adsManagerUrls,
  audienceProposalCardState,
  audienceProposalPlanSchema,
  clampBudgetMinorUnits,
  proposalForRecommendation,
} from './audience-proposals';

const row = (over: Record<string, unknown>) =>
  ({
    id: '2f1c1c1e-0000-4000-8000-000000000001',
    portfolio_id: '2f1c1c1e-0000-4000-8000-000000000002',
    brand_id: '2f1c1c1e-0000-4000-8000-000000000003',
    ad_account_id: 'act_1',
    adset_id: 'as-1',
    trigger: 'F2_audience_saturation',
    recommendation_id: '2f1c1c1e-0000-4000-8000-000000000004',
    utc_day: '2026-09-19',
    status: 'ready',
    created_at: '2026-09-19T06:00:00Z',
    updated_at: '2026-09-19T06:00:00Z',
    ...over,
  }) as never;

describe('audience proposals', () => {
  it('validates a full plan', () => {
    const plan = audienceProposalPlanSchema.parse({
      version: 1,
      mode: 'replace',
      trigger: 'F2_audience_saturation',
      diagnosis: 'Frequency 3.4 on a converting audience; CPA up 28% in 7 days.',
      rationale: 'Widen to adjacent fitness interests.',
      previous_spec: { age_min: 25, age_max: 54, geo_locations: { countries: ['MX'] } },
      previous_spec_hash: 'abc',
      options: [
        {
          bucket: 'net_new_verified',
          kind: 'interest',
          id: '77',
          name: 'CrossFit',
          verified: true,
        },
      ],
      chosen_option_ids: ['77'],
      targeting_spec: {
        age_min: 25,
        age_max: 54,
        flexible_spec: [{ interests: [{ id: '77', name: 'CrossFit' }] }],
      },
      advantage_audience: { enabled: true, rationale: 'Broad pool, lower-funnel objective.' },
      reach: {
        current: { lower: 100000, upper: 120000, source: 'delivery_estimate' },
        proposed: null,
      },
      budget: {
        suggested_minor_units: 50000,
        currency: 'MXN',
        source: 'source_adset',
        bounds: { min_minor_units: 10000, max_minor_units: 50000 },
      },
      adset_name: 'ALEIRA · wider fitness · 2026-09-19',
      creatives: [{ ad_id: 'ad1', creative_id: 'cr1', source_adset_id: 'as-1', rank: 1 }],
      creatives_disclosure: 'Ranked across enrolled ad sets.',
      source: { adset_id: 'as-1', campaign_id: 'c1' },
    });
    expect(plan.creatives[0]?.events).toBe(0);
    expect(plan.source.is_cbo).toBe(false);
  });
  it('maps statuses to card states, CBO block apart', () => {
    expect(audienceProposalCardState(null)).toBe('none');
    expect(
      audienceProposalCardState(
        row({ status: 'blocked', blocked_by: { code: 'cbo_campaign', message: 'x' } }),
      ),
    ).toBe('blocked_cbo');
    expect(
      audienceProposalCardState(
        row({ status: 'blocked', blocked_by: { code: 'no_creatives', message: 'x' } }),
      ),
    ).toBe('blocked');
    expect(audienceProposalCardState(row({ status: 'activate_requested' }))).toBe('switching');
    expect(audienceProposalCardState(row({ status: 'superseded' }))).toBe('none');
  });
  it('picks the live row for a recommendation, else the newest non-superseded one', () => {
    const rec = {
      id: '2f1c1c1e-0000-4000-8000-000000000004',
      adset_id: 'as-1',
      trigger: 'F2_audience_saturation',
    };
    const older = row({
      id: '2f1c1c1e-0000-4000-8000-000000000010',
      status: 'executed',
      created_at: '2026-09-01T00:00:00Z',
    });
    const superseded = row({
      id: '2f1c1c1e-0000-4000-8000-000000000011',
      status: 'superseded',
      created_at: '2026-09-18T00:00:00Z',
    });
    const live = row({
      id: '2f1c1c1e-0000-4000-8000-000000000012',
      status: 'ready',
      recommendation_id: null,
    });
    expect(proposalForRecommendation([older, superseded, live], rec)?.id).toBe(live.id);
    expect(proposalForRecommendation([older, superseded], rec)?.id).toBe(older.id);
    expect(proposalForRecommendation([], rec)).toBeNull();
  });
  it('clamps budgets and builds Ads Manager links', () => {
    expect(clampBudgetMinorUnits(999999, { min_minor_units: 100, max_minor_units: 5000 })).toBe(
      5000,
    );
    expect(clampBudgetMinorUnits(1, { min_minor_units: 100, max_minor_units: 5000 })).toBe(100);
    const urls = adsManagerUrls({
      adAccountId: 'act_123',
      campaignId: 'c1',
      adsetId: 'as9',
      adIds: ['ad1'],
    });
    expect(urls.adset).toContain('act=123');
    expect(urls.adset).toContain('selected_adset_ids=as9');
    expect(urls.ads[0]).toContain('selected_ad_ids=ad1');
  });
});
