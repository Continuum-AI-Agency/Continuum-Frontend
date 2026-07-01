import type { UserIntegrationSummary } from "@/lib/integrations/userIntegrations";

type ProviderKey = "google" | "meta" | "facebook" | "tiktok" | "x";

function normalizeProviders(provider: ProviderKey): Set<string> {
  if (provider === "facebook") return new Set(["meta", "facebook"]);
  if (provider === "tiktok") return new Set(["tiktok"]);
  if (provider === "x") return new Set(["x"]);
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
  provider: ProviderKey
): ProviderConnectionSummary {
  const providers = normalizeProviders(provider);
  const accountNames = Array.from(
    new Set(
      Object.values(summary)
        .flatMap(group => group.accounts.filter(account => providers.has(account.provider)))
        .map(account => account.name)
        .filter((name): name is string => Boolean(name))
    )
  );
  return { connected: accountNames.length > 0, accountNames };
}

export function hasProviderConnections(
  summary: UserIntegrationSummary,
  provider: ProviderKey
): boolean {
  return getProviderConnectionSummary(summary, provider).connected;
}

