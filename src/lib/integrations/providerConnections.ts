import type { UserIntegrationSummary } from "@/lib/integrations/userIntegrations";

type ProviderKey = "google" | "meta" | "facebook";

function normalizeProviders(provider: ProviderKey): Set<string> {
  if (provider === "facebook") return new Set(["meta", "facebook"]);
  return new Set([provider]);
}

export function hasProviderConnections(
  summary: UserIntegrationSummary,
  provider: ProviderKey
): boolean {
  const providers = normalizeProviders(provider);
  return Object.values(summary).some(group =>
    group.accounts.some(account => providers.has(account.provider))
  );
}

