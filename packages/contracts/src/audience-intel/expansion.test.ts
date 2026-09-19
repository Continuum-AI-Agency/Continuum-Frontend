import { describe, expect, it } from 'bun:test';
import {
  audienceExpansionOptionSchema,
  audienceExpansionProposalSchema,
  executableOptions,
} from './expansion';

describe('audience expansion', () => {
  it('rejects a net-new interest without a platform id or without verification', () => {
    expect(
      audienceExpansionOptionSchema.safeParse({
        bucket: 'net_new_verified',
        kind: 'interest',
        name: 'Posgrados',
        verified: true,
      }).success,
    ).toBe(false);
    expect(
      audienceExpansionOptionSchema.safeParse({
        bucket: 'net_new_verified',
        kind: 'interest',
        id: '6003',
        name: 'Posgrados',
      }).success,
    ).toBe(false);
    expect(
      audienceExpansionOptionSchema.safeParse({
        bucket: 'net_new_verified',
        kind: 'interest',
        id: '6003',
        name: 'Posgrados',
        verified: true,
      }).success,
    ).toBe(true);
  });

  it('keeps only options a person could create right now', () => {
    const proposal = audienceExpansionProposalSchema.parse({
      adset_id: 'a',
      ad_account_id: 'act_1',
      diagnosis: 'frequency 5.4, reach +8% over 14d, CPA +39%',
      options: [
        { bucket: 'currently_live', kind: 'interest', id: '1', name: 'Educación' },
        { bucket: 'existing_inventory', kind: 'lookalike', id: 'la1', name: 'LAL 1% leads' },
        {
          bucket: 'net_new_verified',
          kind: 'interest',
          id: '6003',
          name: 'Posgrados',
          verified: true,
        },
        {
          bucket: 'net_new_verified',
          kind: 'interest',
          id: '6004',
          name: 'Salud',
          verified: true,
          blocked_by: 'brand rule: no health-first interests',
        },
        {
          bucket: 'existing_inventory',
          kind: 'demographic',
          name: 'widen age to 25–44',
          spec: { age_max: 44 },
        },
        { bucket: 'existing_inventory', kind: 'geo', name: 'add Zapopan' },
      ],
    });
    expect(executableOptions(proposal).map((o) => o.name)).toEqual([
      'LAL 1% leads',
      'Posgrados',
      'widen age to 25–44',
    ]);
    expect(proposal.disclosure).toContain('re-verify in Ads Manager');
  });
});
