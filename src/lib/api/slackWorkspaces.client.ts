import {
  brandSlackWorkspacesRoute,
  type ListBrandSlackWorkspacesResponse,
  listBrandSlackWorkspacesResponseSchema,
  type RedeemSlackClaimResponse,
  redeemSlackClaimResponseSchema,
  SLACK_CLAIM_ROUTE,
  SLACK_INSTALL_START_ROUTE,
  type SlackClaimPreviewResponse,
  slackClaimPreviewResponseSchema,
} from '@continuum/contracts';
import { getApiUrl } from './config';
import { http } from './http';

export const SLACK_SETTINGS_PATH = '/settings?section=integrations';

/**
 * The Backend URL that installs Continuum into a Slack workspace. Render it as a plain link:
 * the Backend sets the OAuth nonce cookie on this navigation, which a fetch would never carry
 * back through Slack's consent screen.
 */
export function slackInstallStartHref(brandId: string | null): string {
  const query = new URLSearchParams({ returnTo: SLACK_SETTINGS_PATH });
  // The brand only pre-selects the connect step; a bare install (a retry, a forwarded link) has none.
  if (brandId) query.set('brandId', brandId);
  return `${getApiUrl(SLACK_INSTALL_START_ROUTE)}?${query}`;
}

export function listBrandSlackWorkspaces(
  brandId: string,
  signal?: AbortSignal,
): Promise<ListBrandSlackWorkspacesResponse> {
  return http.request({
    path: brandSlackWorkspacesRoute(brandId),
    schema: listBrandSlackWorkspacesResponseSchema,
    signal,
  });
}

export async function disconnectBrandSlackWorkspace(
  brandId: string,
  installationId: string,
): Promise<void> {
  await http.request({
    path: `${brandSlackWorkspacesRoute(brandId)}/${encodeURIComponent(installationId)}`,
    method: 'DELETE',
  });
}

export function previewSlackClaim(claim: string): Promise<SlackClaimPreviewResponse> {
  return http.request({
    path: `${SLACK_CLAIM_ROUTE}?${new URLSearchParams({ claim })}`,
    schema: slackClaimPreviewResponseSchema,
  });
}

export function redeemSlackClaim(
  claim: string,
  brandId: string,
): Promise<RedeemSlackClaimResponse> {
  return http.request({
    path: SLACK_CLAIM_ROUTE,
    method: 'POST',
    body: { claim, brandId },
    schema: redeemSlackClaimResponseSchema,
  });
}
