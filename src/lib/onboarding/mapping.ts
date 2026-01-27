import type { OnboardingState, OnboardingConnectionAccount } from "@/lib/onboarding/state";
import type { 
  AgentRequestPayload, 
  AgentBrandProfile, 
  AgentRunContext,
  IntegrationProvider
} from "@/lib/onboarding/agentClient";
import { PLATFORM_KEYS, type PlatformKey } from "@/components/onboarding/platforms";

const PLATFORM_TO_PROVIDER: Record<string, IntegrationProvider> = {
  youtube: "youtube",
  googleAds: "google-ads",
  google: "google-ads",
  instagram: "meta",
  facebook: "meta",
  threads: "meta",
  meta: "meta",
  linkedin: "linkedin",
  tiktok: "tiktok",
};

export function mapOnboardingStateToAgentPayload(
  brandId: string,
  userId: string,
  state: OnboardingState
): AgentRequestPayload {
  const selectedAccounts = Object.entries(state.connections)
    .flatMap(([_, conn]) => (conn.accounts || []).filter(a => a.selected)) as OnboardingConnectionAccount[];

  const integrationAccountIds = selectedAccounts.map(a => a.id);
  
  const integratedPlatforms = Array.from(
    new Set(
      Object.entries(state.connections)
        .filter(([key, conn]) => {
          const hasSelectedAccounts = (conn.accounts || []).some(a => a.selected);
          return conn.connected && hasSelectedAccounts;
        })
        .map(([key]) => PLATFORM_TO_PROVIDER[key] || (key as any))
        .filter((p): p is IntegrationProvider => !!p)
    )
  );

  const brandProfile: AgentBrandProfile = {
    id: brandId,
    brand_name: state.brand.name || "",
    website_url: state.brand.website || undefined,
    brand_voice: state.brand.brandVoice ? { tone: state.brand.brandVoice } : undefined,
    target_audience: state.brand.targetAudience ? { summary: state.brand.targetAudience } : undefined,
    description: [state.brand.industry, state.brand.name].filter(Boolean).join(" — ") || undefined,
  };

  const runContext: AgentRunContext = {
    user_id: userId,
    brand_id: brandId,
    brand_name: state.brand.name || "",
    created_at: state.completedAt || new Date().toISOString(),
    platform_urls: state.brand.website ? [state.brand.website] : [],
    integrated_platforms: integratedPlatforms,
    brand_voice_tags: (state.brand.brandVoiceTags || []) as string[],
    integration_account_ids: integrationAccountIds,
  };

  return { brandProfile, runContext };
}
