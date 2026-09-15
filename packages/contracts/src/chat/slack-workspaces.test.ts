import { describe, expect, it } from 'bun:test';
import {
  brandSlackWorkspacesRoute,
  listBrandSlackWorkspacesResponseSchema,
  redeemSlackClaimRequestSchema,
  redeemSlackClaimResponseSchema,
  SLACK_CONNECT_ERROR_CODES,
  slackClaimPreviewResponseSchema,
  slackConnectErrorCodeSchema,
} from './index';

const brandId = '33333333-3333-4333-a333-333333333333';

describe('Slack workspace contracts', () => {
  it('parses a brand workspace list and refuses a leaked bot token', () => {
    const workspace = {
      installationId: 'T123',
      teamId: 'T123',
      teamName: 'Acme',
      status: 'revoked',
      linkedAt: '2026-09-15T10:00:00.000Z',
    };
    expect(
      listBrandSlackWorkspacesResponseSchema.parse({ workspaces: [workspace] }).workspaces[0]
        ?.status,
    ).toBe('revoked');
    expect(
      listBrandSlackWorkspacesResponseSchema.safeParse({
        workspaces: [{ ...workspace, botToken: 'xoxb-1' }],
      }).success,
    ).toBe(false);
  });

  it('parses the claim preview and the redeem round trip', () => {
    const preview = slackClaimPreviewResponseSchema.parse({
      teamId: 'T123',
      teamName: null,
      brandId: null,
      returnTo: null,
      brands: [{ id: brandId, name: 'StarCraft' }],
    });
    expect(preview.brands).toHaveLength(1);
    expect(redeemSlackClaimRequestSchema.safeParse({ claim: 'a.b', brandId }).success).toBe(true);
    expect(redeemSlackClaimRequestSchema.safeParse({ claim: 'a.b', brandId: 'nope' }).success).toBe(
      false,
    );
    expect(
      redeemSlackClaimResponseSchema.parse({
        brandId,
        teamId: 'T123',
        teamName: 'Acme',
        returnTo: '/settings?section=integrations',
      }).teamName,
    ).toBe('Acme');
  });

  it('names every connect error code and encodes the brand route', () => {
    expect(SLACK_CONNECT_ERROR_CODES).toContain('state_mismatch');
    expect(slackConnectErrorCodeSchema.safeParse('claim_used').success).toBe(true);
    expect(slackConnectErrorCodeSchema.safeParse('teapot').success).toBe(false);
    expect(brandSlackWorkspacesRoute(brandId)).toBe(
      `/api/chat/slack/brands/${brandId}/workspaces`,
    );
  });
});
