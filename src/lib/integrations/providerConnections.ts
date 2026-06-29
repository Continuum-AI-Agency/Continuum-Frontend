import type { UserIntegrationSummary } from "@/lib/integrations/userIntegrations";

type ProviderKey = "google" | "meta" | "facebook" | "tiktok" | "x";

function normalizeProviders(provider: ProviderKey): Set<string> {
  if (provider === "facebook") return new Set(["meta", "facebook"]);
  if (provider === "tiktok") return new Set(["tiktok"]);
  if (provider === "x") return new Set(["x"]);
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

