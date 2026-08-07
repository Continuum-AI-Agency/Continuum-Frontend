import type { UserIntegrationSummary } from '@/lib/integrations/userIntegrations';

type ProviderKey = 'google' | 'meta' | 'facebook' | 'tiktok' | 'linkedin' | 'x';

function normalizeProviders(provider: ProviderKey): Set<string> {
  if (provider === 'facebook') return new Set(['meta', 'facebook']);
  if (provider === 'tiktok') return new Set(['tiktok']);
  if (provider === 'linkedin') return new Set(['linkedin']);
  if (provider === 'x') return new Set(['x']);
  return new Set([provider]);
}

export type ProviderConnectionSummary = {
  connected: boolean;
  /**
   * Distinct account/channel names already linked for this provider, taken
   * from data we already fetch (no extra schema/RPC work). For Google this
   * is the fastest way to tell a user "you're linked as X" so they know
   * whether a second "connect a different account" pass (see #151) is
   * pointed at the identity they expect.
   */
  accountNames: string[];
};

export function getProviderConnectionSummary(
  summary: UserIntegrationSummary,
  provider: ProviderKey,
): ProviderConnectionSummary {
  const providers = normalizeProviders(provider);
  const accountNames = Array.from(
    new Set(
      Object.values(summary)
        .flatMap((group) => group.accounts.filter((account) => providers.has(account.provider)))
        .map((account) => account.name)
        .filter((name): name is string => Boolean(name)),
    ),
  );
  return { connected: accountNames.length > 0, accountNames };
}

export function hasProviderConnections(
  summary: UserIntegrationSummary,
  provider: ProviderKey,
): boolean {
  return getProviderConnectionSummary(summary, provider).connected;
}

export const GOOGLE_ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export type GoogleIntegrationMetadata = {
  scopes?: unknown;
  ga4_enrichment?: { ok?: boolean; error?: string };
};

/**
 * Whether a Google connection has to be re-consented before GA4 can ever sync.
 *
 * Google freezes a connection's granted scopes at consent time, so one
 * authorized before `analytics.readonly` joined the requested set 403s on every
 * subsequent sync and yields zero properties forever — silently, until this
 * says otherwise. Lives here rather than in the server-only summary module so
 * the decision is testable on its own.
 */
export function needsGoogleAnalyticsReconsent(
  metadata: GoogleIntegrationMetadata,
  syncedGa4PropertyCount: number,
): boolean {
  const enrichment = metadata.ga4_enrichment;

  // The last sync told us outright that the grant is missing the scope.
  if (enrichment?.error === 'scope_not_granted') return true;
  // Or told us outright that it succeeded: zero properties then means the user
  // genuinely has none, which is not something to nag about.
  if (enrichment?.ok === true) return false;

  // Recorded scopes, when non-empty, ARE the granted set. Empty means Google
  // returned no scope string, which is unknown rather than missing.
  const scopes = Array.isArray(metadata.scopes) ? (metadata.scopes as string[]) : [];
  if (scopes.length > 0) return !scopes.includes(GOOGLE_ANALYTICS_SCOPE);

  // Connections predating this bookkeeping: infer from the absence of any
  // synced property. Self-clears as soon as one lands.
  return syncedGa4PropertyCount === 0;
}
