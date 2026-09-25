import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { AudienceRecommendationCard } from './AudienceRecommendationCard';
import { audienceCardView } from './audienceCardModel';

afterEach(cleanup);

const rec = {
  id: 'rec-1',
  adset_id: 'as-1',
  kind: 'audience_expand',
  trigger: 'F2_audience_saturation',
  severity: 'medium',
  reason: 'Frequency 3.4 with CPA up 28%',
  status: 'pending',
  evidence: {
    metric: 'frequency',
    value: 3.4,
    comparator: '>=',
    threshold: 3,
    window: 'd7',
    estImpactPerDay: null,
    source: 'engine',
  },
  seed: null,
} as never;

const plan = {
  version: 1,
  mode: 'replace',
  trigger: 'F2_audience_saturation',
  diagnosis: 'Frequency 3.4 on a converting audience; CPA up 28% in 7 days.',
  rationale: 'Widen to CrossFit and add the converters lookalike.',
  previous_spec: {
    age_min: 25,
    age_max: 54,
    geo_locations: { countries: ['MX'] },
    flexible_spec: [{ interests: [{ id: '1', name: 'Gyms' }] }],
  },
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
  advantage_audience: { enabled: true, rationale: 'Broad pool, leads objective.' },
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
  adset_name: 'Source · wider fitness · 2026-09-19',
  creatives: [
    {
      ad_id: 'a1',
      ad_name: 'Winner',
      creative_row_id: 'r1',
      creative_id: 'cr1',
      source_adset_id: 'as-2',
      source_adset_name: 'Other',
      cost_per_event: 5,
      events: 20,
      spend: 100,
      poster_url: null,
      rank: 1,
    },
  ],
  creatives_disclosure: 'Ranked across enrolled ad sets.',
  source: {
    adset_id: 'as-1',
    adset_name: 'Source',
    campaign_id: 'c1',
    campaign_name: 'Leads MX',
    status: 'ACTIVE',
    optimization_goal: 'LEAD_GENERATION',
    billing_event: 'IMPRESSIONS',
    promoted_object: null,
    placements: null,
    daily_budget_minor_units: 20000,
    is_cbo: false,
    audience_type: 'prospecting',
  },
  grounded_on: [],
  disclosure: '',
  prompt_version: 'v1',
};

const row = (over: Record<string, unknown>) =>
  ({
    id: '2f1c1c1e-0000-4000-8000-000000000001',
    portfolio_id: '2f1c1c1e-0000-4000-8000-000000000002',
    brand_id: '2f1c1c1e-0000-4000-8000-000000000003',
    ad_account_id: 'act_1',
    adset_id: 'as-1',
    trigger: 'F2_audience_saturation',
    recommendation_id: 'rec-1',
    utc_day: '2026-09-19',
    status: 'ready',
    proposal: plan,
    created_at: '2026-09-19T00:00:00Z',
    updated_at: '2026-09-19T00:00:00Z',
    ...over,
  }) as never;

const executedResult = {
  read_back_at: null,
  campaign: { id: 'c1', name: 'Leads MX', status: 'ACTIVE' },
  adset: {
    id: 'as-9',
    name: 'Source · wider fitness · 2026-09-19',
    status: 'PAUSED',
    effective_status: 'PAUSED',
    daily_budget: '20000',
    optimization_goal: 'LEAD_GENERATION',
    billing_event: 'IMPRESSIONS',
    bid_strategy: null,
    targeting: plan.previous_spec,
    promoted_object: null,
  },
  ads: [
    {
      id: 'ad-9',
      name: 'Winner · new',
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
    note: null,
  },
  activation: null,
  advantage_audience_written: true,
  ads_manager_urls: null,
};

const noop = () => undefined;
const baseProps = {
  rec,
  adsetName: 'Source',
  snapshot: null,
  currency: 'MXN',
  adAccountId: 'act_1',
  onRequest: noop,
  requesting: false,
  onApprove: noop,
  approving: false,
  onCancel: noop,
  onActivate: noop,
  onUndo: noop,
  busy: false,
  onConvertCbo: noop,
  convertingCbo: false,
  cboPreview: null,
  resultWord: 'leads',
};

describe('AudienceRecommendationCard', () => {
  it('with no proposal yet, explains the daily cycle and offers Ask Jaina now', () => {
    const view = audienceCardView([], rec);
    const { container } = render(<AudienceRecommendationCard {...baseProps} view={view} />);
    const text = container.textContent ?? '';
    expect(text).toContain('daily optimizer cycle');
    expect(text).toContain('Ask Jaina now');
    expect(text).toContain('Frequency');
  });
  it('renders a ready proposal: mode, chosen and blocked options, reach, budget, creatives, the one button', () => {
    const view = audienceCardView([row({})], rec);
    const { container } = render(<AudienceRecommendationCard {...baseProps} view={view} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Replace audience');
    expect(text).toContain('CrossFit');
    expect(text).toContain('Beer');
    expect(text).toContain('100K–120K → 1.3M–1.5M');
    expect(text).toContain('Advantage+on');
    expect(text).toContain('Winner');
    expect(text).toContain('Create new ad set');
    expect(text).toContain('Start active');
    expect((container.querySelector('#budget-rec-1') as HTMLInputElement).value).toBe('200');
  });
  it('blocked by a campaign budget: says what is needed and offers the conversion preview', () => {
    const view = audienceCardView(
      [
        row({
          status: 'blocked',
          proposal: null,
          blocked_by: {
            code: 'cbo_campaign',
            message: 'This campaign holds the budget.',
            campaign_id: 'c1',
            campaign_name: 'Leads MX',
          },
        }),
      ],
      rec,
    );
    const { container } = render(<AudienceRecommendationCard {...baseProps} view={view} />);
    const text = container.textContent ?? '';
    expect(text).toContain('holds the budget');
    expect(text).toContain('Preview the conversion');
    expect(text).not.toContain('Create new ad set');
  });
  it('executed: lists the identifiers, the What was implemented dropdown, Switch over and Undo', () => {
    const view = audienceCardView(
      [
        row({
          status: 'executed',
          result: executedResult,
        }),
      ],
      rec,
    );
    const { container } = render(<AudienceRecommendationCard {...baseProps} view={view} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Created on Meta');
    expect(text).toContain('as-9');
    expect(text).toContain('ad-9');
    expect(text).toContain('What was implemented');
    expect(text).toContain('Switch over');
    expect(text).toContain('Undo');
    expect(container.querySelector('a[href*="selected_adset_ids=as-9"]')).not.toBeNull();
  });
});

describe('AudienceRecommendationCard — +2 type scale', () => {
  const SUB_XS = /text-(2|3)xs/;

  it('a ready proposal carries no text-2xs/3xs and roomy buttons', () => {
    const view = audienceCardView([row({})], rec);
    const { container } = render(<AudienceRecommendationCard {...baseProps} view={view} />);
    expect(container.innerHTML).not.toMatch(SUB_XS);
    expect(screen.getByText(plan.diagnosis).className).toContain('text-base');
    expect(screen.getByText('Replace audience').className).toContain('text-xs');
    for (const button of container.querySelectorAll('button[data-slot="button"]')) {
      expect(button.className).toContain('h-9');
      expect(button.className).toContain('text-sm');
    }
  });

  it('the no-proposal, CBO-preview and executed faces carry no text-2xs/3xs either', () => {
    const faces = [
      audienceCardView([], rec),
      audienceCardView(
        [
          row({
            status: 'blocked',
            proposal: null,
            blocked_by: {
              code: 'cbo_campaign',
              message: 'This campaign holds the budget.',
              campaign_id: 'c1',
              campaign_name: 'Leads MX',
            },
          }),
        ],
        rec,
      ),
      audienceCardView([row({ status: 'executed', result: executedResult })], rec),
    ];
    for (const view of faces) {
      const { container, unmount } = render(
        <AudienceRecommendationCard
          {...baseProps}
          cboPreview={
            {
              ok: true,
              dryRun: true,
              currency: 'MXN',
              adset_budgets: [{ adset_id: 'as-1', adset_name: 'Source', daily_major: 200 }],
            } as never
          }
          view={view}
        />,
      );
      expect(container.innerHTML).not.toMatch(SUB_XS);
      unmount();
    }
  });
});
