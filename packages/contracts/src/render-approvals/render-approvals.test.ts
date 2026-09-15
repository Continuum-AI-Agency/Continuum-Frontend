import { describe, expect, it } from 'bun:test';

import {
  addDestinationApproverRequestSchema,
  buildRenderApprovalActionValue,
  buildRenderPackageActionValue,
  classifyApprovalReaction,
  destinationApproverSchema,
  parseRenderPackageActionValue,
  renderApprovalFileSchema,
  parseRenderApprovalActionValue,
  renderApprovalDecisionSchema,
  renderApprovalRequestSchema,
  renderApprovalSchema,
  whatsappReactionResponseSchema,
  whatsappReactionSchema,
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

describe('an approval read from an older server', () => {
  it('has no package, no expiry and no named decider', () => {
    const parsed = renderApprovalSchema.parse({
      id: '22222222-2222-4222-8222-222222222222',
      brandId: REQUEST.brandId,
      picinst: 'Six_app',
      environmentKey: null,
      taskUid: 'T-abc123',
      batchId: 'T-abc123__16x9',
      groupKey: null,
      action: 'create',
      campaignId: null,
      adsetId: null,
      adId: null,
      files: [],
      status: 'pending',
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
      decisionReason: null,
      createdAt: '2026-09-15T00:00:00.000Z',
      updatedAt: '2026-09-15T00:00:00.000Z',
    });
    expect([parsed.packageId, parsed.expiresAt, parsed.decidedByDisplayName, parsed.decidedVia]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('the package button value', () => {
  it('round-trips and stays short enough for every adapter', () => {
    const value = buildRenderPackageActionValue('33333333-3333-4333-8333-333333333333', 12);
    expect(value.length).toBeLessThanOrEqual(64);
    expect(parseRenderPackageActionValue(value)).toEqual({
      packageId: '33333333-3333-4333-8333-333333333333',
      jobCount: 12,
    });
  });

  it('reads a missing, zero or non-numeric count as no value at all', () => {
    expect(parseRenderPackageActionValue(null)).toBeNull();
    expect(parseRenderPackageActionValue('33333333-3333-4333-8333-333333333333')).toBeNull();
    expect(parseRenderPackageActionValue('33333333-3333-4333-8333-333333333333|0')).toBeNull();
    expect(parseRenderPackageActionValue('33333333-3333-4333-8333-333333333333|two')).toBeNull();
  });
});

describe('approvers', () => {
  it('are added by exactly one identity', () => {
    expect(addDestinationApproverRequestSchema.safeParse({ platformUserId: 'U0CLIENT' }).success).toBe(true);
    expect(
      addDestinationApproverRequestSchema.safeParse({ userId: '44444444-4444-4444-8444-444444444444' }).success,
    ).toBe(true);
    expect(addDestinationApproverRequestSchema.safeParse({}).success).toBe(false);
    expect(
      addDestinationApproverRequestSchema.safeParse({
        userId: '44444444-4444-4444-8444-444444444444',
        platformUserId: 'U0CLIENT',
      }).success,
    ).toBe(false);
  });

  it('have no status beyond requested, active and revoked', () => {
    const approver = {
      id: '55555555-5555-4555-8555-555555555555',
      brandId: REQUEST.brandId,
      destinationId: '66666666-6666-4666-8666-666666666666',
      userId: null,
      platform: 'whatsapp',
      platformUserId: '1203@lid',
      altPlatformUserId: '5511999999999@s.whatsapp.net',
      displayName: 'Ana',
      status: 'active',
      addedBy: null,
      createdAt: '2026-09-15T00:00:00.000Z',
      updatedAt: '2026-09-15T00:00:00.000Z',
    };
    expect(destinationApproverSchema.parse(approver)).toEqual(approver);
    expect(destinationApproverSchema.safeParse({ ...approver, status: 'pending' }).success).toBe(false);
  });
});

describe('SEAM B — a WhatsApp reaction', () => {
  const REACTION = {
    platform: 'whatsapp',
    channel_id: '120363000000000000@g.us',
    message_id: '3EB0ABCDEF',
    reactor_id: '1203@lid',
    reactor_alt_id: '5511999999999@s.whatsapp.net',
    reactor_name: 'Ana',
    emoji: '👍🏽',
    reacted_at: '2026-09-15T12:00:00.000Z',
  };

  it('parses the exact body the bot sends, and strips a field it adds later instead of refusing', () => {
    // The bot never retries a 4xx: a strict parse would turn a harmless new field into a lost vote.
    expect(whatsappReactionSchema.parse({ ...REACTION, reactor_avatar: 'x' })).toEqual(REACTION);
    expect(whatsappReactionSchema.parse({ ...REACTION, reactor_alt_id: null }).reactor_alt_id).toBeNull();
    expect(whatsappReactionSchema.safeParse({ ...REACTION, platform: 'slack' }).success).toBe(false);
  });

  it('classifies 👍 and 👎 with any skin tone, and nothing else', () => {
    expect(classifyApprovalReaction('👍')).toBe('approve');
    expect(classifyApprovalReaction('👍🏿')).toBe('approve');
    expect(classifyApprovalReaction('👎🏻')).toBe('reject');
    expect(classifyApprovalReaction('❤️')).toBeNull();
    expect(classifyApprovalReaction('✅')).toBeNull();
  });

  it('answers with one of the seven outcomes the bot logs', () => {
    expect(whatsappReactionResponseSchema.parse({ ok: true, outcome: 'unknown_message' }).outcome).toBe(
      'unknown_message',
    );
    expect(whatsappReactionResponseSchema.safeParse({ ok: true, outcome: 'maybe' }).success).toBe(false);
  });
});
