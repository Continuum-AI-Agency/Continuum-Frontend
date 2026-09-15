import { z } from 'zod';

// Installing Continuum into a Slack workspace and connecting that workspace to a brand are
// two steps. Install is public (a Slack admin may have no Continuum account); connect is a
// signed-in brand owner/admin redeeming the single-use claim the install callback minted.

/** Public, top-level navigation — never a fetch: it sets the nonce cookie the callback checks. */
export const SLACK_INSTALL_START_ROUTE = '/api/chat/slack/install/start';
/** GET `?claim=` previews a claim; POST redeems it. Both require a Continuum session. */
export const SLACK_CLAIM_ROUTE = '/api/chat/slack/claim';
/** GET lists the brand's workspaces; DELETE `/<installationId>` disconnects one. */
export const brandSlackWorkspacesRoute = (brandId: string): string =>
  `/api/chat/slack/brands/${encodeURIComponent(brandId)}/workspaces`;

/**
 * Every `?error=` the install callback redirects to `/slack/connect` with, plus every error
 * code the claim routes answer with. The page maps each to copy; an unknown code is a drift.
 */
export const SLACK_CONNECT_ERROR_CODES = [
  // install callback
  'slack_denied',
  'missing_params',
  'invalid_state',
  'expired_state',
  'state_mismatch',
  'exchange_failed',
  'incomplete_grant',
  'not_configured',
  // claim routes
  'invalid_claim',
  'expired_claim',
  'claim_used',
  'installation_revoked',
  'forbidden_brand',
] as const;
export const slackConnectErrorCodeSchema = z.enum(SLACK_CONNECT_ERROR_CODES);
export type SlackConnectErrorCode = z.infer<typeof slackConnectErrorCodeSchema>;

export const brandSlackWorkspaceSchema = z
  .object({
    installationId: z.string().min(1),
    teamId: z.string().min(1),
    teamName: z.string().nullable(),
    // revoked = uninstalled or token revoked in Slack; a reinstall flips it back.
    status: z.enum(['active', 'revoked']),
    linkedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type BrandSlackWorkspace = z.infer<typeof brandSlackWorkspaceSchema>;

export const listBrandSlackWorkspacesResponseSchema = z
  .object({ workspaces: z.array(brandSlackWorkspaceSchema) })
  .strict();
export type ListBrandSlackWorkspacesResponse = z.infer<
  typeof listBrandSlackWorkspacesResponseSchema
>;

export const slackClaimPreviewResponseSchema = z
  .object({
    teamId: z.string().min(1),
    teamName: z.string().nullable(),
    /** The brand the install was started from — a pre-selection, it grants nothing. */
    brandId: z.string().uuid().nullable(),
    returnTo: z.string().nullable(),
    /** Only brands the caller is owner/admin of; empty means they cannot connect it. */
    brands: z.array(z.object({ id: z.string().uuid(), name: z.string() }).strict()),
  })
  .strict();
export type SlackClaimPreviewResponse = z.infer<typeof slackClaimPreviewResponseSchema>;

export const redeemSlackClaimRequestSchema = z
  .object({ claim: z.string().min(1), brandId: z.string().uuid() })
  .strict();
export type RedeemSlackClaimRequest = z.infer<typeof redeemSlackClaimRequestSchema>;

export const redeemSlackClaimResponseSchema = z
  .object({
    brandId: z.string().uuid(),
    teamId: z.string().min(1),
    teamName: z.string().nullable(),
    returnTo: z.string().nullable(),
  })
  .strict();
export type RedeemSlackClaimResponse = z.infer<typeof redeemSlackClaimResponseSchema>;
