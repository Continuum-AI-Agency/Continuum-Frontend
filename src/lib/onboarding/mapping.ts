import type { OnboardingState, OnboardingConnectionAccount } from "@/lib/onboarding/state";
import type { 
  AgentRequestPayload, 
  AgentBrandProfile, 
  AgentRunContext,
  IntegrationProvider
} from "@/lib/onboarding/agentClient";
import { integrationProviderEnum } from "@continuum/contracts";

const VALID_PROVIDERS = new Set<IntegrationProvider>(
  integrationProviderEnum.options as IntegrationProvider[]
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The backend approve schema enforces brand_name (min 1) and z.guid() account
// ids; never let the mapper emit "" or non-uuid values that would 400 the launch.
function deriveBrandName(state: OnboardingState): string {
  const typed = state.brand.name?.trim();
  if (typed) return typed;
  const website = state.brand.website?.trim();
  if (website) {
    try {
      const url = new URL(website.startsWith("http") ? website : `https://${website}`);
      const root = url.hostname.replace(/^www\./, "").split(".")[0];
      if (root) return root.charAt(0).toUpperCase() + root.slice(1);
    } catch {
      // fall through to default
    }
  }
  return "Untitled Brand";
}

// The approve schema's brand_voice.tone caps at 420 and target_audience.summary
// at 1800 (packages/contracts/src/onboarding/{brand-voice,target-audience}.ts).
// The contracts call these "lenient input" bounds meant to absorb verbose Gemini
// output WITHOUT rejecting the section — so clamp a too-long value to fit rather
// than let it 400 the entire launch. Trims to a word boundary, then hard-caps.
const BRAND_VOICE_TONE_MAX = 420;
const AUDIENCE_SUMMARY_MAX = 1800;

export function clampText(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trim();
}

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

  const integrationAccountIds = selectedAccounts
    .map(a => a.id)
    .filter(id => UUID_RE.test(id));

  const integratedPlatforms = Array.from(
    new Set(
      Object.entries(state.connections)
        .filter(([, conn]) => {
          const hasSelectedAccounts = (conn.accounts || []).some(a => a.selected);
          return conn.connected && hasSelectedAccounts;
        })
        .map(([key]) => PLATFORM_TO_PROVIDER[key])
        .filter((p): p is IntegrationProvider => !!p && VALID_PROVIDERS.has(p))
    )
  );

  const brandName = deriveBrandName(state);

  const brandProfile: AgentBrandProfile = {
    id: brandId,
    brand_name: brandName,
    website_url: state.brand.website || undefined,
    brand_voice: state.brand.brandVoice
      ? { tone: clampText(state.brand.brandVoice, BRAND_VOICE_TONE_MAX) }
      : undefined,
    target_audience: state.brand.targetAudience
      ? { summary: clampText(state.brand.targetAudience, AUDIENCE_SUMMARY_MAX) }
      : undefined,
    description: [state.brand.industry, state.brand.name].filter(Boolean).join(" — ") || undefined,
  };

  const runContext: AgentRunContext = {
    user_id: userId,
    brand_id: brandId,
    brand_name: brandName,
    created_at: state.completedAt || new Date().toISOString(),
    platform_urls: state.brand.website ? [state.brand.website] : [],
    integrated_platforms: integratedPlatforms,
    brand_voice_tags: (state.brand.brandVoiceTags || []) as string[],
    integration_account_ids: integrationAccountIds,
  };

  return { brandProfile, runContext };
}
