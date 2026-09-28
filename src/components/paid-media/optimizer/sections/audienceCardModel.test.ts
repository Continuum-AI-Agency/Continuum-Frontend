import { describe, expect, it } from 'bun:test';
import {
  audienceCardStateFor,
  audienceCardView,
  carriedRecommendation,
  implementedRows,
  isAudienceRecommendation,
  optionsByBucket,
  reachDeltaLabel,
} from './audienceCardModel';

const plan = {
  version: 1,
  mode: 'replace',
  trigger: 'F2_audience_saturation',
  diagnosis: 'd',
  rationale: 'r',
  previous_spec: {},
  previous_spec_hash: 'h',
  options: [
    {
      bucket: 'currently_live',
      kind: 'interest',
      id: '1',
      name: 'Gyms',
      spec: null,
      estimate: null,
      verified: false,
      locale: null,
      blocked_by: null,
      rationale: null,
    },
    {
      bucket: 'net_new_verified',
      kind: 'interest',
      id: '77',
      name: 'CrossFit',
      spec: null,
      estimate: { lower: 5_000_000, upper: 6_000_000, source: 'catalogue_band' },
      verified: true,
      locale: null,
      blocked_by: null,
      rationale: null,
    },
    {
      bucket: 'net_new_verified',
      kind: 'interest',
      id: '88',
      name: 'Beer',
      spec: null,
      estimate: null,
      verified: true,
      locale: null,
      blocked_by: 'Brand DNA: never alcohol',
      rationale: null,
    },
  ],
  chosen_option_ids: ['77'],
  targeting_spec: {},
  advantage_audience: { enabled: true, rationale: 'x' },
  reach: {
    current: { lower: 100_000, upper: 120_000, source: 'delivery_estimate' },
    proposed: { lower: 1_300_000, upper: 1_500_000, source: 'delivery_estimate' },
    estimated_at: null,
  },
  budget: {
    suggested_minor_units: 20000,
    currency: 'MXN',
    source: 'source_adset',
    bounds: { min_minor_units: 100, max_minor_units: 20000 },
    note: null,
  },
  adset_name: 'n',
  creatives: [],
  creatives_disclosure: '',
  source: {
    adset_id: 'as-1',
    campaign_id: 'c1',
    adset_name: null,
    campaign_name: null,
    status: null,
    optimization_goal: null,
    billing_event: null,
    promoted_object: null,
    placements: null,
    daily_budget_minor_units: null,
    is_cbo: false,
    audience_type: null,
  },
  grounded_on: [],
  disclosure: '',
  prompt_version: 'v1',
} as never;

describe('audience card model', () => {
  it('recognises the audience recommendation and reads the row into a view', () => {
    expect(
      isAudienceRecommendation({ kind: 'audience_expand', trigger: 'F3_audience_exhausted' }),
    ).toBe(true);
    expect(
      isAudienceRecommendation({ kind: 'creative_refresh', trigger: 'F1_creative_fatigue' }),
    ).toBe(false);
    const row = {
      id: '2f1c1c1e-0000-4000-8000-000000000001',
      portfolio_id: '2f1c1c1e-0000-4000-8000-000000000002',
      brand_id: '2f1c1c1e-0000-4000-8000-000000000003',
      ad_account_id: 'act_1',
      adset_id: 'as-1',
      trigger: 'F2_audience_saturation',
      recommendation_id: 'rec',
      utc_day: '2026-09-19',
      status: 'ready',
      proposal: plan,
      created_at: '2026-09-19T00:00:00Z',
      updated_at: '2026-09-19T00:00:00Z',
    } as never;
    const view = audienceCardView([row], {
      id: 'rec',
      adset_id: 'as-1',
      trigger: 'F2_audience_saturation',
    });
    expect(view.state).toBe('ready');
    expect(view.plan?.mode).toBe('replace');
    expect(
      audienceCardView([], { id: 'rec', adset_id: 'as-1', trigger: 'F2_audience_saturation' })
        .state,
    ).toBe('none');
  });
  it('groups options by bucket with the chosen and blocked ones marked', () => {
    const groups = optionsByBucket(plan);
    expect(groups.map((g) => g.bucket)).toEqual(['net_new_verified', 'currently_live']);
    expect(groups[0]?.options.map((o) => [o.id, o.chosen, o.blocked_by])).toEqual([
      ['77', true, null],
      ['88', false, 'Brand DNA: never alcohol'],
    ]);
    expect(reachDeltaLabel(plan)).toBe('100K–120K → 1.3M–1.5M (×12.7)');
  });
  it('lists what was implemented from the read-back', () => {
    const rows = implementedRows(
      {
        read_back_at: null,
        campaign: { id: 'c1', name: 'Leads', status: 'ACTIVE' },
        adset: {
          id: 'as9',
          name: 'New',
          status: 'PAUSED',
          effective_status: 'PAUSED',
          daily_budget: '20000',
          optimization_goal: 'LEAD_GENERATION',
          billing_event: 'IMPRESSIONS',
          bid_strategy: null,
          targeting: {
            age_min: 25,
            age_max: 54,
            flexible_spec: [{ interests: [{ id: '77', name: 'CrossFit' }] }],
            targeting_automation: { advantage_audience: 1 },
          },
          promoted_object: null,
        },
        ads: [
          {
            id: 'ad9',
            name: 'Ad',
            status: 'PAUSED',
            effective_status: 'PAUSED',
            creative_id: 'cr1',
            thumbnail_url: null,
            source_adset_id: 'as-2',
            source_adset_name: 'Other',
          },
        ],
        source_adset: {
          id: 'as-1',
          name: 'Source',
          prior_status: 'ACTIVE',
          status_after: 'ACTIVE',
          paused: false,
          note: 'kept delivering until the new ad set is activated',
        },
        activation: null,
        advantage_audience_written: true,
        ads_manager_urls: null,
      },
      plan,
    );
    const labels = rows.map((r) => r.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Campaign',
        'Ad set',
        'Daily budget',
        'Targeting',
        'Interests',
        'Advantage+ audience',
        'Ad',
        'Source ad set',
        'Mode',
      ]),
    );
    expect(rows.find((r) => r.label === 'Advantage+ audience')?.value).toBe('on');
  });
});

// A blocked proposal the next cycle superseded (Easy Fit → Tours, 2026-09-28: no_creatives,
// proposal null, status superseded). The block is the one fact the row still holds.
describe('audience card model — a superseded blocked proposal', () => {
  const superseded = {
    id: 'p-1',
    brand_id: '33333333-3333-4333-8333-333333333333',
    ad_account_id: 'act_1',
    campaign_id: 'c1',
    adset_id: 'as-1',
    trigger: 'F3_audience_exhausted',
    kind: 'audience_expand',
    recommendation_id: '44444444-4444-4444-8444-444444444444',
    cycle_run_id: '22222222-2222-4222-8222-222222222222',
    utc_day: '2026-09-27',
    status: 'superseded',
    requested_via: 'human',
    requested_by: null,
    attempts: 1,
    proposal: null,
    proposal_built_at: null,
    blocked_by: {
      code: 'no_creatives',
      message: 'No delivering creative has enough results yet.',
      campaign_id: 'c1',
      campaign_name: 'Tours',
    },
    approved_at: null,
    approved_by: null,
    approval: null,
    result: null,
    executed_at: null,
    undo_requested_at: null,
    undo_result: null,
    undone_at: null,
    error: { code: 'signal_stopped', message: 'The trigger did not fire again.' },
    created_at: '2026-09-27T09:20:16Z',
    updated_at: '2026-09-28T00:20:00Z',
  } as never;

  it('keeps its blocked face instead of offering a fresh analysis', () => {
    expect(audienceCardStateFor(superseded)).toBe('blocked');
    expect(audienceCardStateFor({ ...(superseded as object), proposal: plan } as never)).toBe(
      'none',
    );
    expect(audienceCardStateFor({ ...(superseded as object), blocked_by: null } as never)).toBe(
      'none',
    );
    const view = audienceCardView([superseded], {
      id: '44444444-4444-4444-8444-444444444444',
      adset_id: 'as-1',
      trigger: 'F3_audience_exhausted',
    });
    expect(view.state).toBe('blocked');
    expect(view.block?.code).toBe('no_creatives');
  });

  it("rebuilds the expired recommendation it belonged to from the proposal's own fields", () => {
    expect(carriedRecommendation(superseded, 'ITESO // AGOSTO // 2 - LKL')).toEqual({
      id: '44444444-4444-4444-8444-444444444444',
      adset_id: 'as-1',
      adset_name: 'ITESO // AGOSTO // 2 - LKL',
      ad_id: null,
      kind: 'audience_expand',
      trigger: 'F3_audience_exhausted',
      severity: null,
      reason: 'No delivering creative has enough results yet.',
      status: 'expired',
      run_id: '22222222-2222-4222-8222-222222222222',
      created_at: '2026-09-27T09:20:16Z',
    });
    expect(
      carriedRecommendation({ ...(superseded as object), status: 'blocked' } as never),
    ).toBeNull();
    expect(
      carriedRecommendation({ ...(superseded as object), recommendation_id: null } as never),
    ).toBeNull();
  });
});
