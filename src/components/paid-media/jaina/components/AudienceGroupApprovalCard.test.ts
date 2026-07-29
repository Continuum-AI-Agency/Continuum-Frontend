import { describe, expect, it } from 'bun:test';
import type { ToolResultEventData } from '@/lib/jaina/schemas';
import { extractAudienceGroupApproval } from './AudienceGroupApprovalCard';

const preview = {
  status: 'approval_required',
  group_id: '1a56a2bd-32ff-4f3a-9973-7737367e1111',
  group_version_id: '847087de-c8f7-4c80-a5bf-e24e6a0d2222',
  version: 1,
  content_hash: 'a'.repeat(64),
  approval_token: 'audgrp_test_approval_token',
  expires_at: '2026-07-28T09:00:00.000Z',
  manifest: {
    schema_version: 1,
    name: 'High-intent prospects',
    ad_account_id: 'act_123',
    members: [
      {
        key: 'checkout',
        kind: 'website',
        name: 'Checkout visitors',
        pixel_id: 'pixel_1',
        event: 'InitiateCheckout',
        retention_days: 30,
        prefill: true,
      },
    ],
    include_member_keys: ['checkout'],
    exclude_member_keys: [],
    targeting: { geo_locations: { countries: ['US'] } },
    rationale: 'Retarget high-intent visitors.',
    evidence: [],
  },
  estimated_reach: null,
  creates_ad_set: false,
  changes_budget: false,
};

describe('extractAudienceGroupApproval', () => {
  it('extracts the latest durable proposal from the standard tool envelope', () => {
    const result: ToolResultEventData = {
      id: 'tool-1',
      name: 'audience_group_manage',
      ok: true,
      cached: false,
      output: { ok: true, data: preview, meta: { tool: 'audience_group_manage' } },
    };

    expect(extractAudienceGroupApproval([result])).toEqual(
      expect.objectContaining({
        group_version_id: preview.group_version_id,
        creates_ad_set: false,
        changes_budget: false,
      }),
    );
  });

  it('ignores failed, unrelated, and non-proposal tool results', () => {
    expect(
      extractAudienceGroupApproval([
        {
          id: 'tool-2',
          name: 'audience_group_manage',
          ok: true,
          cached: false,
          output: { ok: true, data: { status: 'ready' } },
        },
      ]),
    ).toBeNull();
  });
});
