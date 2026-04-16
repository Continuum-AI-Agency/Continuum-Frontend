import type { OnboardingConnectionState } from "@/lib/onboarding/state";

export type OrganicMetricAccountOption = {
  integrationAccountId: string;
  name: string;
  externalAccountId: string | null;
};

type IntegrationSummaryAccount = {
  integrationAccountId: string;
  name: string;
  externalAccountId: string | null;
};

type IntegrationSummaryPlatform = {
  accounts: IntegrationSummaryAccount[];
};

type MetricIntegrationSummary = {
  instagram: IntegrationSummaryPlatform;
  facebook: IntegrationSummaryPlatform;
  tiktok: IntegrationSummaryPlatform;
};

type OrganicMetricAccountsByPlatform = {
  instagram: OrganicMetricAccountOption[];
  facebook: OrganicMetricAccountOption[];
  tiktok: OrganicMetricAccountOption[];
};

function dedupeByIntegrationAccountId(
  accounts: OrganicMetricAccountOption[]
): OrganicMetricAccountOption[] {
  const seen = new Set<string>();
  return accounts.filter((account) => {
    if (!account.integrationAccountId || seen.has(account.integrationAccountId)) {
      return false;
    }
    seen.add(account.integrationAccountId);
    return true;
  });
}

export function toMetricAccountOptions(
  connection: OnboardingConnectionState,
  fallbackLabel: string
): OrganicMetricAccountOption[] {
  const options = (connection.accounts ?? [])
    .map((account) => {
      const metadata = account.metadata as Record<string, unknown> | undefined;
      return {
        integrationAccountId: account.id,
        name: account.name || fallbackLabel,
        externalAccountId:
          typeof metadata?.externalAccountId === "string" ? metadata.externalAccountId : null,
      };
    })
    .filter((account) => account.integrationAccountId.length > 0);

  if (options.length > 0) return dedupeByIntegrationAccountId(options);
  if (!connection.accountId) return [];

  return [
    {
      integrationAccountId: connection.accountId,
      name: fallbackLabel,
      externalAccountId: null,
    },
  ];
}

function fromIntegrationSummary(
  platform: IntegrationSummaryPlatform,
  fallbackLabel: string
): OrganicMetricAccountOption[] {
  return dedupeByIntegrationAccountId(
    (platform.accounts ?? [])
      .map((account) => ({
        integrationAccountId: account.integrationAccountId,
        name: account.name || fallbackLabel,
        externalAccountId: account.externalAccountId ?? null,
      }))
      .filter((account) => account.integrationAccountId.length > 0)
  );
}

export function deriveMetricAccountsByPlatform(params: {
  integrationSummary: MetricIntegrationSummary | null;
  onboardingConnections: {
    instagram: OnboardingConnectionState;
    facebook: OnboardingConnectionState;
    tiktok?: OnboardingConnectionState;
  };
}): OrganicMetricAccountsByPlatform {
  const summaryInstagram = params.integrationSummary
    ? fromIntegrationSummary(params.integrationSummary.instagram, "Instagram account")
    : [];
  const summaryFacebook = params.integrationSummary
    ? fromIntegrationSummary(params.integrationSummary.facebook, "Facebook Page")
    : [];
  const summaryTikTok = params.integrationSummary
    ? fromIntegrationSummary(params.integrationSummary.tiktok, "TikTok account")
    : [];

  return {
    instagram:
      summaryInstagram.length > 0
        ? summaryInstagram
        : toMetricAccountOptions(params.onboardingConnections.instagram, "Instagram account"),
    facebook:
      summaryFacebook.length > 0
        ? summaryFacebook
        : toMetricAccountOptions(params.onboardingConnections.facebook, "Facebook Page"),
    tiktok:
      summaryTikTok.length > 0
        ? summaryTikTok
        : params.onboardingConnections.tiktok
          ? toMetricAccountOptions(params.onboardingConnections.tiktok, "TikTok account")
          : [],
  };
}
