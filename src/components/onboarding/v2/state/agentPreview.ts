import {
  resumeOnboardingPreview,
  runOnboardingPreview,
  type AgentBrandProfile,
  type BrandVoice,
  type BusinessSummary,
  type FirstImpression,
  type OnboardingPreviewEvent,
  type OnboardingPreviewWorkflowResult,
  type ReadinessAnalysis,
  type TargetAudience,
  type WebsiteSummary,
} from "@/lib/onboarding/agentClient";
import type { ScrapeResult } from "@/lib/onboarding/scrape";

export type AgentPreviewSpark = { section: string; label: string };

export type AgentPreviewBuckets = {
  brandProfile: AgentBrandProfile | null;
  voice: BrandVoice | null;
  audience: TargetAudience | null;
  business: BusinessSummary | null;
  website: WebsiteSummary | null;
  readiness: ReadinessAnalysis | null;
  firstImpression: FirstImpression | null;
  latestSpark: AgentPreviewSpark | null;
  voiceStream: string;
  audienceStream: string;
  businessStream: string;
  websiteStream: string;
  result: OnboardingPreviewWorkflowResult | null;
};

export function emptyBuckets(): AgentPreviewBuckets {
  return {
    brandProfile: null,
    voice: null,
    audience: null,
    business: null,
    website: null,
    readiness: null,
    firstImpression: null,
    latestSpark: null,
    voiceStream: "",
    audienceStream: "",
    businessStream: "",
    websiteStream: "",
    result: null,
  };
}

export type AgentPreviewInput = {
  brandId: string;
  userId: string;
  brandName: string;
  websiteUrl: string;
  voiceTags: string[];
  scrape?: ScrapeResult | null;
  resumeRunId?: string | null;
  resumeLastEventId?: number;
  onRunId?: (runId: string | null) => void;
  onUpdate: (next: AgentPreviewBuckets) => void;
};

export type AgentPreviewOutcome = {
  runId: string | null;
  buckets: AgentPreviewBuckets;
};

function makeEventHandler(buckets: AgentPreviewBuckets, dispatch: () => void) {
  return (event: OnboardingPreviewEvent) => {
    switch (event.type) {
      case "brand_profile":
        buckets.brandProfile = event.payload;
        break;
      case "voice":
        buckets.voice = event.payload;
        break;
      case "audience":
        buckets.audience = event.payload;
        break;
      case "business":
        buckets.business = event.payload;
        break;
      case "website":
        buckets.website = event.payload;
        break;
      case "readiness":
        buckets.readiness = event.payload;
        break;
      case "first_impression":
        buckets.firstImpression = event.payload;
        break;
      case "spark":
        buckets.latestSpark = { section: event.section, label: event.label };
        break;
      case "stream":
        if (event.section === "voice") buckets.voiceStream += event.delta;
        if (event.section === "audience") buckets.audienceStream += event.delta;
        if (event.section === "business") buckets.businessStream += event.delta;
        if (event.section === "website") buckets.websiteStream += event.delta;
        break;
      case "complete":
        if (event.result) buckets.result = event.result;
        break;
      default:
        return;
    }
    dispatch();
  };
}

export async function runAgentPreview(
  input: AgentPreviewInput,
  signal: AbortSignal
): Promise<AgentPreviewOutcome> {
  const buckets = emptyBuckets();
  const dispatch = () => input.onUpdate({ ...buckets });
  const handleEvent = makeEventHandler(buckets, dispatch);

  let runId: string | null = null;

  if (input.resumeRunId) {
    runId = input.resumeRunId;
    input.onRunId?.(runId);
    await resumeOnboardingPreview(input.resumeRunId, {
      onEvent: handleEvent,
      signal,
      lastEventId: input.resumeLastEventId,
    });
  } else {
    const result = await runOnboardingPreview({
      payload: {
        brandProfile: {
          id: input.brandId,
          brand_name: input.brandName || "Untitled brand",
          website_url: input.websiteUrl || undefined,
        },
        runContext: {
          user_id: input.userId,
          brand_id: input.brandId,
          brand_name: input.brandName || "Untitled brand",
          created_at: new Date().toISOString(),
          platform_urls: input.websiteUrl ? [input.websiteUrl] : [],
          integrated_platforms: [],
          brand_voice_tags: input.voiceTags,
          integration_account_ids: [],
        },
        scrape: input.scrape ?? null,
      },
      signal,
      onEvent: handleEvent,
      onRunId: (next) => {
        runId = next;
        input.onRunId?.(next);
      },
    });
    if (!runId && result.runId) runId = result.runId;
  }

  if (!hasAnyBucket(buckets)) {
    throw new Error("Brand analysis returned no data. Please retry.");
  }

  return { runId, buckets };
}

function hasAnyBucket(b: AgentPreviewBuckets): boolean {
  return Boolean(
    b.voice ||
      b.audience ||
      b.business ||
      b.website ||
      b.readiness ||
      b.brandProfile ||
      b.firstImpression ||
      b.voiceStream ||
      b.audienceStream ||
      b.businessStream ||
      b.websiteStream
  );
}
