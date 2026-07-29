import { describe, expect, it } from 'bun:test';

import {
  audienceGroupManageInputSchema,
  audienceGroupManifestSchema,
  metaAdSetTargetingSpecSchema,
  metaAudienceVerificationInputSchema,
  metaAudienceVerificationReportSchema,
} from './audience-groups';

const validManifest = {
  name: 'High-intent retargeting',
  ad_account_id: 'act_123456',
  members: [
    {
      key: 'site_checkout',
      kind: 'website',
      name: 'Checkout visitors — 30d',
      pixel_id: 'pixel_123',
      event: 'InitiateCheckout',
      retention_days: 30,
      prefill: true,
    },
    {
      key: 'checkout_lal',
      kind: 'lookalike',
      name: 'Checkout lookalike — US 1%',
      seed_member_key: 'site_checkout',
      country: 'us',
      ratio: 0.01,
      lookalike_type: 'similarity',
    },
    {
      key: 'ig_engaged',
      kind: 'engagement',
      name: 'Instagram engagers — 90d',
      source_type: 'ig_business',
      source_id: 'ig_123',
      event: 'ig_business_profile_all',
      retention_days: 90,
      prefill: true,
    },
  ],
  include_member_keys: ['checkout_lal', 'ig_engaged'],
  exclude_member_keys: ['site_checkout'],
  targeting: {
    age_min: 21,
    age_max: 55,
    geo_locations: { countries: ['us'] },
    interests: [{ id: 'interest_1', name: 'Running' }],
  },
  rationale: 'Retarget high-intent visitors and prospect from the same seed.',
  evidence: ['Checkout visitors converted above the account average.'],
} as const;

describe('audienceGroupManifestSchema', () => {
  it('normalizes a valid Meta-native audience group', () => {
    const parsed = audienceGroupManifestSchema.parse(validManifest);

    expect(parsed.schema_version).toBe(1);
    expect(parsed.members[1]).toMatchObject({ country: 'US' });
    expect(parsed.targeting.geo_locations?.countries).toEqual(['US']);
  });

  it('rejects unknown and conflicting member references', () => {
    const parsed = audienceGroupManifestSchema.safeParse({
      ...validManifest,
      include_member_keys: ['site_checkout', 'missing'],
      exclude_member_keys: ['site_checkout'],
    });

    expect(parsed.success).toBe(false);
    const messages = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
    expect(messages).toContain('Unknown audience member key: missing');
    expect(messages).toContain(
      'Audience member site_checkout cannot be both included and excluded',
    );
  });

  it('rejects source/event mismatches and lookalike chains', () => {
    const parsed = audienceGroupManifestSchema.safeParse({
      ...validManifest,
      members: [
        {
          key: 'wrong_event',
          kind: 'engagement',
          name: 'Wrong event',
          source_type: 'page',
          source_id: 'page_1',
          event: 'video_completed',
          retention_days: 30,
        },
        {
          key: 'lal_one',
          kind: 'lookalike',
          name: 'First lookalike',
          seed_audience_id: 'aud_1',
          country: 'US',
          ratio: 0.01,
        },
        {
          key: 'lal_two',
          kind: 'lookalike',
          name: 'Second lookalike',
          seed_member_key: 'lal_one',
          country: 'US',
          ratio: 0.02,
        },
      ],
      include_member_keys: ['wrong_event', 'lal_two'],
      exclude_member_keys: [],
    });

    expect(parsed.success).toBe(false);
    const messages = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
    expect(messages).toContain('Event video_completed is not valid for page');
    expect(messages).toContain('A lookalike member cannot seed another lookalike member');
  });

  it('rejects an inverted age range', () => {
    const parsed = audienceGroupManifestSchema.safeParse({
      ...validManifest,
      targeting: { age_min: 55, age_max: 21 },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.success ? '' : parsed.error.issues[0]?.message).toBe(
      'age_max must be greater than or equal to age_min',
    );
  });
});

describe('audience group tool contracts', () => {
  it('accepts draft, preview, publish, and status actions', () => {
    expect(
      audienceGroupManageInputSchema.parse({ action: 'draft', manifest: validManifest }).action,
    ).toBe('draft');
    expect(
      audienceGroupManageInputSchema.parse({
        action: 'preview',
        group_version_id: '4e7ac4b7-412b-4d76-a2e7-d900c944ea2d',
      }).action,
    ).toBe('preview');
    expect(
      audienceGroupManageInputSchema.parse({
        action: 'publish',
        group_version_id: '4e7ac4b7-412b-4d76-a2e7-d900c944ea2d',
        approval_token: 'audience_approval_token_123',
      }).action,
    ).toBe('publish');
    expect(
      audienceGroupManageInputSchema.parse({
        action: 'status',
        group_version_id: '4e7ac4b7-412b-4d76-a2e7-d900c944ea2d',
      }).action,
    ).toBe('status');
  });

  it('accepts the compiled Meta ad-set targeting payload', () => {
    expect(
      metaAdSetTargetingSpecSchema.parse({
        ...validManifest.targeting,
        custom_audiences: [{ id: 'meta_aud_1' }],
        excluded_custom_audiences: [{ id: 'meta_aud_2' }],
      }),
    ).toMatchObject({
      custom_audiences: [{ id: 'meta_aud_1' }],
      excluded_custom_audiences: [{ id: 'meta_aud_2' }],
    });
  });
});

describe('Meta audience verification contracts', () => {
  it('defaults to a bounded read-only inventory check', () => {
    expect(metaAudienceVerificationInputSchema.parse({})).toEqual({ inventory_limit: 25 });
    expect(() => metaAudienceVerificationInputSchema.parse({ inventory_limit: 101 })).toThrow();
  });

  it('rejects reports that imply the verifier changed Meta assets', () => {
    const report = {
      status: 'verified',
      api_version: 'v25.0',
      verified_at: '2026-07-28T12:00:00.000Z',
      read_only: false,
      checks: [
        { check: 'token_debug', status: 'passed', detail: 'Token is valid.' },
        { check: 'permissions', status: 'passed', detail: 'ads_management is granted.' },
        { check: 'ad_account_access', status: 'passed', detail: 'Ad account is readable.' },
        {
          check: 'audience_inventory',
          status: 'passed',
          detail: 'Audience inventory is readable.',
        },
      ],
      token: null,
      permissions: {
        granted: ['ads_management'],
        declined: [],
        required_for_audience_write: ['ads_management'],
        missing_for_audience_write: [],
      },
      ad_account: null,
      audiences: { returned: 0, has_more: false, items: [], inspected: null },
    };

    expect(metaAudienceVerificationReportSchema.safeParse(report).success).toBe(false);
    expect(
      metaAudienceVerificationReportSchema.parse({ ...report, read_only: true }).read_only,
    ).toBe(true);
  });
});
