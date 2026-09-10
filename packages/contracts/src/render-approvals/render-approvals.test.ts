import { describe, expect, it } from 'bun:test';

import {
  buildRenderApprovalActionValue,
  renderApprovalFileSchema,
  parseRenderApprovalActionValue,
  renderApprovalDecisionSchema,
  renderApprovalRequestSchema,
} from './render-approvals';

const REQUEST = {
  picinst: 'Six_app',
  brandId: '11111111-1111-4111-8111-111111111111',
  taskUid: 'T-abc123',
  batchId: 'T-abc123__16x9',
  files: [{ url: 'https://cdn.example/hero_16x9.mp4' }],
};

describe('renderApprovalRequestSchema', () => {
  it('accepts the minimum the plugin can know and defaults the rest', () => {
    const parsed = renderApprovalRequestSchema.parse(REQUEST);
    expect(parsed.action).toBe('create');
    expect(parsed.approvalChannelId).toBeNull();
    expect(parsed.environmentKey).toBeNull();
    expect(parsed.files[0].adCopy).toBeNull();
  });

  it('refuses a batch with no files — there is nothing to look at', () => {
    expect(renderApprovalRequestSchema.safeParse({ ...REQUEST, files: [] }).success).toBe(false);
  });

  it('refuses a Meta access token riding along', () => {
    // .strict() is the guard: the plugin strips the credential, and a future
    // change that stops stripping it must fail here rather than land it in a
    // Slack message and a database row.
    const smuggled = { ...REQUEST, meta: { access_token: 'EAAG...' } };
    expect(renderApprovalRequestSchema.safeParse(smuggled).success).toBe(false);
  });

  it('refuses a batch that names no environment', () => {
    const { picinst: _p, ...noEnv } = REQUEST;
    expect(renderApprovalRequestSchema.safeParse(noEnv).success).toBe(false);
  });
});

describe('the wire contract with the render-delivery plugin', () => {
  it('declares exactly the keys the plugin sends', () => {
    // The other half of this alarm is `test/approval-request.unit.js` in
    // gitlab-repos/plugin-render-delivery, which asserts the same literal list
    // against what buildApprovalRequest actually emits. The two repos cannot
    // import each other, so drift is caught by both restating the list — rename
    // a field on either side and one of these two goes red.
    expect(Object.keys(renderApprovalRequestSchema.shape).sort()).toEqual([
      'action', 'adId', 'adsetId', 'approvalChannelId', 'batchId', 'brandId',
      'campaignId', 'clientKey', 'environmentKey', 'files', 'groupKey',
      'picinst', 'taskUid',
    ]);
    expect(Object.keys(renderApprovalFileSchema.shape).sort()).toEqual([
      'adCopy', 'adStatus', 'landingUrl', 'url',
    ]);
  });
});

describe('the Slack button value', () => {
  it('round-trips and stays short enough for every adapter', () => {
    const value = buildRenderApprovalActionValue(
      '22222222-2222-4222-8222-222222222222',
      'deadbeefcafebabe0123456789abcdef',
    );
    expect(value.length).toBeLessThanOrEqual(64);
    expect(parseRenderApprovalActionValue(value)).toEqual({
      approvalId: '22222222-2222-4222-8222-222222222222',
      fingerprint: 'deadbeef',
    });
  });

  it('reads a malformed or missing value as no decision at all', () => {
    expect(parseRenderApprovalActionValue(null)).toBeNull();
    expect(parseRenderApprovalActionValue('')).toBeNull();
    expect(parseRenderApprovalActionValue('just-an-id')).toBeNull();
  });
});

describe('renderApprovalDecisionSchema', () => {
  it('takes a verdict with an optional reason', () => {
    expect(renderApprovalDecisionSchema.parse({ decision: 'approve' }).reason).toBeNull();
    expect(renderApprovalDecisionSchema.parse({ decision: 'reject', reason: 'old logo' }).reason).toBe('old logo');
  });

  it('has no third answer', () => {
    expect(renderApprovalDecisionSchema.safeParse({ decision: 'maybe' }).success).toBe(false);
  });
});
