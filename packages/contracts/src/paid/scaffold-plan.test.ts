import { describe, expect, it } from 'bun:test';
import {
  effectiveFieldProvenance,
  PAID_SCAFFOLD_PROVENANCE_KEYS,
  type PaidScaffoldDraftNodeInput,
  paidScaffoldAdSetPlanSchema,
  paidScaffoldAudienceSchema,
  paidScaffoldCopiedAudienceLabel,
  paidScaffoldCopiedAudienceSaveIssue,
  paidScaffoldDraftNodeSchema,
  paidScaffoldFullFieldIssues,
  paidScaffoldPlanSchema,
} from './scaffold-plan';

/** A draft node the way a Frontend that predates P5 saves it: no P5 key at all. */
const legacyNode = (over: Partial<PaidScaffoldDraftNodeInput>): PaidScaffoldDraftNodeInput => ({
  path_key: 'c0',
  parent_path_key: null,
  level: 'campaign',
  ordinal: 0,
  name: 'Campaign',
  product_key: null,
  angle_key: null,
  concept_key: null,
  objective: 'OUTCOME_SALES',
  special_ad_categories: [],
  optimization_goal: null,
  funnel_stage: null,
  placement_mode: null,
  publisher_platforms: null,
  facebook_positions: null,
  instagram_positions: null,
  device_platforms: null,
  audience_group_version_id: null,
  broad_targeting: null,
  daily_budget_minor_units: null,
  target_conversions_per_day: null,
  link: null,
  message: null,
  headline: null,
  description: null,
  call_to_action_type: null,
  creative: null,
  ...over,
});

const campaign = (over: Partial<PaidScaffoldDraftNodeInput> = {}) => legacyNode(over);
const adSet = (over: Partial<PaidScaffoldDraftNodeInput> = {}) =>
  legacyNode({
    path_key: 'c0/a0',
    parent_path_key: 'c0',
    level: 'adset',
    name: 'Ad set',
    product_key: 'p',
    angle_key: 'a',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    funnel_stage: 'prospecting',
    special_ad_categories: null,
    ...over,
  });
const ad = (over: Partial<PaidScaffoldDraftNodeInput> = {}) =>
  legacyNode({
    path_key: 'c0/a0/ad0',
    parent_path_key: 'c0/a0',
    level: 'ad',
    name: 'Ad',
    objective: null,
    product_key: 'p',
    angle_key: 'a',
    concept_key: 'k',
    special_ad_categories: null,
    ...over,
  });

const FUTURE = '2099-01-01T00:00:00-06:00';
const LATER = '2099-02-01T00:00:00-06:00';

describe('paidScaffoldDraftNodeSchema — the P5 keys', () => {
  it('parses a pre-P5 save, with every P5 key read as null (not undefined)', () => {
    const parsed = paidScaffoldDraftNodeSchema.parse(adSet());
    for (const key of [
      'budget_mode',
      'campaign_daily_budget_minor_units',
      'bid_strategy',
      'bid_amount_minor_units',
      'roas_floor',
      'start_time',
      'end_time',
      'custom_event_type',
      'pixel_id',
      'url_tags',
      'field_provenance',
    ] as const) {
      expect(parsed[key]).toBeNull();
    }
  });

  it('carries a full ABO ad set: cost cap, schedule, event, pixel and provenance', () => {
    const parsed = paidScaffoldDraftNodeSchema.parse(
      adSet({
        bid_strategy: 'COST_CAP',
        bid_amount_minor_units: 4_500,
        start_time: FUTURE,
        end_time: LATER,
        custom_event_type: 'COMPLETE_REGISTRATION',
        pixel_id: '1234567890',
        field_provenance: { bid_strategy: 'user_gave', start_time: 'jaina_filled' },
      }),
    );
    expect(parsed.bid_strategy).toBe('COST_CAP');
    expect(parsed.field_provenance).toEqual({
      bid_strategy: 'user_gave',
      start_time: 'jaina_filled',
    });
  });

  it('refuses an unknown bid strategy, a schedule without an offset and a non-digit pixel', () => {
    expect(
      paidScaffoldDraftNodeSchema.safeParse(adSet({ bid_strategy: 'TARGET_COST' as never }))
        .success,
    ).toBe(false);
    expect(
      paidScaffoldDraftNodeSchema.safeParse(adSet({ start_time: '2099-01-01T00:00:00' })).success,
    ).toBe(false);
    expect(paidScaffoldDraftNodeSchema.safeParse(adSet({ pixel_id: 'px_1' })).success).toBe(false);
    expect(
      paidScaffoldDraftNodeSchema.safeParse(adSet({ field_provenance: { name: 'model' as never } }))
        .success,
    ).toBe(false);
  });

  it('keeps the schema an object, so the save route can enumerate its keys', () => {
    expect(Object.keys(paidScaffoldDraftNodeSchema.shape)).toContain('url_tags');
  });

  it('names a provenance key only for a key the draft node has', () => {
    const keys = new Set(Object.keys(paidScaffoldDraftNodeSchema.shape));
    for (const level of Object.values(PAID_SCAFFOLD_PROVENANCE_KEYS)) {
      for (const key of level) expect(keys.has(key)).toBe(true);
    }
  });
});

describe('paidScaffoldFullFieldIssues — refused by name at propose and save', () => {
  it('passes a plain ABO tree with nothing set (today exactly)', () => {
    expect(paidScaffoldFullFieldIssues([campaign(), adSet(), ad()])).toEqual([]);
  });

  it('a CBO campaign needs its budget, and its ad sets carry none', () => {
    const issues = paidScaffoldFullFieldIssues([
      campaign({ budget_mode: 'cbo' }),
      adSet({ daily_budget_minor_units: 50_000, bid_strategy: 'COST_CAP' }),
    ]);
    expect(issues).toContain(
      'campaign c0 uses campaign budget (CBO) and needs campaign_daily_budget_minor_units',
    );
    expect(
      issues.some((issue) => issue.startsWith('adset c0/a0 must omit daily_budget_minor_units')),
    ).toBe(true);
    expect(issues.some((issue) => issue.startsWith('adset c0/a0 must omit bid_strategy'))).toBe(
      true,
    );
  });

  it('a well-formed CBO tree passes, with a capped campaign and a per-ad-set amount', () => {
    expect(
      paidScaffoldFullFieldIssues([
        campaign({
          budget_mode: 'cbo',
          campaign_daily_budget_minor_units: 90_000,
          bid_strategy: 'LOWEST_COST_WITH_BID_CAP',
          bid_amount_minor_units: 3_000,
        }),
        adSet({ bid_amount_minor_units: 2_500 }),
      ]),
    ).toEqual([]);
  });

  it('an ABO campaign holds no budget and no bid', () => {
    const issues = paidScaffoldFullFieldIssues([
      campaign({ campaign_daily_budget_minor_units: 90_000, bid_strategy: 'COST_CAP' }),
    ]);
    expect(issues).toHaveLength(2);
  });

  it('a capped bid needs its amount; an uncapped one takes none', () => {
    expect(paidScaffoldFullFieldIssues([campaign(), adSet({ bid_strategy: 'COST_CAP' })])).toEqual([
      'adset c0/a0 uses COST_CAP and needs bid_amount_minor_units',
    ]);
    expect(
      paidScaffoldFullFieldIssues([campaign(), adSet({ bid_amount_minor_units: 1_000 })]),
    ).toEqual(['adset c0/a0 names bid_amount_minor_units but an uncapped bid takes no amount']);
  });

  it('a ROAS floor needs its ratio and a VALUE goal', () => {
    const issues = paidScaffoldFullFieldIssues([
      campaign(),
      adSet({ bid_strategy: 'LOWEST_COST_WITH_MIN_ROAS' }),
    ]);
    expect(issues).toContain('adset c0/a0 uses LOWEST_COST_WITH_MIN_ROAS and needs roas_floor');
    expect(issues).toContain('adset c0/a0 bids a ROAS floor and must optimize for VALUE');
    expect(
      paidScaffoldFullFieldIssues([
        campaign(),
        adSet({
          bid_strategy: 'LOWEST_COST_WITH_MIN_ROAS',
          roas_floor: 2.5,
          optimization_goal: 'VALUE',
        }),
      ]),
    ).toEqual([]);
  });

  it('end_time must follow start_time and lie in the future', () => {
    expect(
      paidScaffoldFullFieldIssues([campaign(), adSet({ start_time: LATER, end_time: FUTURE })]),
    ).toEqual(['adset c0/a0 ends at or before it starts; end_time must be after start_time']);
    expect(
      paidScaffoldFullFieldIssues(
        [campaign(), adSet({ end_time: '2026-10-01T00:00:00-06:00' })],
        Date.parse('2026-10-29T00:00:00Z'),
      ),
    ).toEqual(['adset c0/a0 has an end_time already in the past']);
  });

  it('keeps each key on its level', () => {
    const issues = paidScaffoldFullFieldIssues([
      campaign({ start_time: FUTURE, url_tags: 'utm_source=meta' }),
      adSet({ budget_mode: 'cbo', url_tags: 'utm_source=meta' }),
      ad({ bid_strategy: 'COST_CAP', custom_event_type: 'LEAD' }),
    ]);
    expect(issues).toEqual([
      'campaign c0 must omit start_time (ad set only)',
      'campaign c0 must omit url_tags (ad only)',
      'adset c0/a0 must omit budget_mode (campaign only)',
      'adset c0/a0 must omit url_tags (ad only)',
      'ad c0/a0/ad0 must omit custom_event_type (ad set only)',
      'ad c0/a0/ad0 must omit bid_strategy (an ad carries no bid)',
    ]);
  });

  it('url_tags is a bare query string', () => {
    expect(paidScaffoldFullFieldIssues([ad({ url_tags: '?utm_source=meta' })])).toHaveLength(1);
    expect(
      paidScaffoldFullFieldIssues([
        ad({ url_tags: 'utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}' }),
      ]),
    ).toEqual([]);
  });
});

describe('the plan — P5 keys default to what older plans built', () => {
  it('an ad-set plan stored before P5 reads ABO, uncapped, unscheduled', () => {
    const parsed = paidScaffoldAdSetPlanSchema.parse({
      path_key: 'c0/a0',
      name: 'x',
      optimization_goal: 'REACH',
      billing_event: 'IMPRESSIONS',
      daily_budget_minor_units: 10_000,
      budget_basis: 'b',
      budget_source: 'floor',
      meta_floor_minor_units: 10_000,
      raised_to_floor: false,
      expected_conversions_per_day: null,
      audience: {
        kind: 'broad',
        targeting: { countries: ['MX'], age_min: 18, age_max: 65, genders: null },
        targeting_summary: 'MX',
        reach: null,
      },
      promoted_object: null,
    });
    expect(parsed.bid).toBeNull();
    expect(parsed.schedule).toBeNull();
    expect(parsed.budget_held_by_campaign).toBe(false);
  });

  it('a plan stored before P5 reads ABO with no campaign budget', () => {
    const parsed = paidScaffoldPlanSchema.shape.budget_mode.parse(undefined);
    expect(parsed).toBe('abo');
  });
});

describe('effectiveFieldProvenance', () => {
  it('reads a filled "asks" field as filled, and an unrecorded empty one as asks', () => {
    expect(effectiveFieldProvenance('jaina_asks', true)).toBe('jaina_filled');
    expect(effectiveFieldProvenance(null, true)).toBe('jaina_filled');
    expect(effectiveFieldProvenance(undefined, false)).toBe('jaina_asks');
    expect(effectiveFieldProvenance('user_gave', true)).toBe('user_gave');
  });
});

describe('a copied audience (P5 design 08)', () => {
  it('names the live ad set its targeting was copied from', () => {
    const parsed = paidScaffoldAudienceSchema.safeParse({
      kind: 'copied',
      source_adset_id: '120200000000000111',
      source_adset_name: 'Monterrey · WhatsApp',
      targeting_summary: '1 city · 22-45 · all genders',
      reach: null,
    });
    expect(parsed.success).toBe(true);
    expect(
      paidScaffoldAudienceSchema.safeParse({ kind: 'copied', source_adset_name: 'x', reach: null })
        .success,
    ).toBe(false);
  });

  it('reads as "copied from <source>", and a save refusal says where to edit it', () => {
    expect(paidScaffoldCopiedAudienceLabel('Monterrey')).toBe('copied from Monterrey');
    expect(paidScaffoldCopiedAudienceSaveIssue('Monterrey')).toBe(
      'This audience was copied from Monterrey; edit it by asking Jaina or in Ads Manager.',
    );
  });
});
