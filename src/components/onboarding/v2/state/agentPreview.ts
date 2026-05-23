import {
  fetchPreviewStatus,
  previewSectionSchema,
  resumeOnboardingPreview,
  runOnboardingPreview,
  type AgentBrandProfile,
  type BrandVoice,
  type BusinessSummary,
  type FirstImpression,
  type OnboardingPreviewEvent,
  type OnboardingPreviewWorkflowResult,
  type PreviewSection,
  type ReadinessAnalysis,
  type TargetAudience,
  type WebsiteSummary,
} from "@/lib/onboarding/agentClient";
import type { ScrapeResult } from "@/lib/onboarding/scrape";

async function trackPreviewRecovery(runId: string, status: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { trackOnboardingEvent } = await import("@/lib/onboarding/telemetry");
    trackOnboardingEvent("onboarding_preview_recovered_via_status", { runId, status });
  } catch {
    // telemetry is best-effort
  }
}

export type SectionStatus = "idle" | "running" | "done" | "error";

export type AgentPreviewSpark = { section: PreviewSection; label: string };

export type AgentPreviewAudits = {
  voice?: unknown;
  audience?: unknown;
  website?: unknown;
  business?: unknown;
};

export type AgentPreviewBuckets = {
  runId: string | null;
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
  sectionStatus: Record<PreviewSection, SectionStatus>;
  audits: AgentPreviewAudits;
  result: OnboardingPreviewWorkflowResult | null;
};

function makeIdleSectionStatus(): Record<PreviewSection, SectionStatus> {
  const entries = previewSectionSchema.options.map((section) => [section, "idle" as SectionStatus] as const);
  return Object.fromEntries(entries) as Record<PreviewSection, SectionStatus>;
}

export function emptyBuckets(): AgentPreviewBuckets {
  return {
    runId: null,
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
    sectionStatus: makeIdleSectionStatus(),
    audits: {},
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

function flipRunningToError(buckets: AgentPreviewBuckets): void {
  for (const section of previewSectionSchema.options) {
    if (buckets.sectionStatus[section] === "running") {
      buckets.sectionStatus[section] = "error";
    }
  }
}

function applyEnrichProseSection(buckets: AgentPreviewBuckets, section: PreviewSection, data: unknown): void {
  switch (section) {
    case "brand_profile":
      buckets.brandProfile = data as AgentBrandProfile;
      break;
    case "voice":
      buckets.voice = data as BrandVoice;
      break;
    case "audience":
      buckets.audience = data as TargetAudience;
      break;
    case "website":
      buckets.website = data as WebsiteSummary | null;
      break;
    case "business":
      buckets.business = data as BusinessSummary | null;
      break;
    case "readiness":
      buckets.readiness = data as ReadinessAnalysis;
      break;
    case "first_impression":
      buckets.firstImpression = data as FirstImpression;
      break;
  }
}

export function makeEventHandler(buckets: AgentPreviewBuckets, dispatch: () => void) {
  return (event: OnboardingPreviewEvent) => {
    switch (event.type) {
      case "run":
        buckets.runId = event.runId;
        break;
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
      case "status":
        buckets.sectionStatus[event.section] = event.status;
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
      case "enrich":
        if (event.section.startsWith("audit.")) {
          const key = event.section.slice("audit.".length) as keyof AgentPreviewAudits;
          buckets.audits = { ...buckets.audits, [key]: event.data };
        } else {
          applyEnrichProseSection(buckets, event.section as PreviewSection, event.data);
        }
        break;
      case "complete":
        if (event.result) buckets.result = event.result;
        if (event.status === "error") flipRunningToError(buckets);
        break;
      case "error":
        flipRunningToError(buckets);
        break;
      default:
        return;
    }
    dispatch();
  };
}

const SILENCE_THRESHOLD_MS = 30_000;
const WATCHDOG_INTERVAL_MS = 5_000;

function seedBucketsFromResult(
  reducer: (event: OnboardingPreviewEvent) => void,
  buckets: AgentPreviewBuckets,
  result: OnboardingPreviewWorkflowResult
): void {
  if (result.brand_profile) reducer({ type: "brand_profile", payload: result.brand_profile });
  if (result.first_impression) reducer({ type: "first_impression", payload: result.first_impression });
  if (result.readiness) reducer({ type: "readiness", payload: result.readiness });
  const structured = result.structured as
    | {
        brand_voice?: BrandVoice;
        target_audience?: TargetAudience;
        business?: BusinessSummary;
        website?: WebsiteSummary | null;
      }
    | undefined;
  if (structured?.brand_voice) reducer({ type: "voice", payload: structured.brand_voice });
  if (structured?.target_audience) reducer({ type: "audience", payload: structured.target_audience });
  if (structured?.business) reducer({ type: "business", payload: structured.business });
  if (structured?.website !== undefined) reducer({ type: "website", payload: structured.website });
  if (result.audits) {
    buckets.audits = {
      ...buckets.audits,
      ...(result.audits.voice !== undefined ? { voice: result.audits.voice } : {}),
      ...(result.audits.audience !== undefined ? { audience: result.audits.audience } : {}),
      ...(result.audits.website !== undefined ? { website: result.audits.website } : {}),
      ...(result.audits.business !== undefined ? { business: result.audits.business } : {}),
    };
  }
  for (const section of ["brand_profile", "voice", "audience", "website", "business", "readiness", "first_impression"] as const) {
    if (buckets.sectionStatus[section] !== "error") {
      reducer({ type: "status", section, status: "done" });
    }
  }
  reducer({ type: "complete", status: "ok", result });
}

export async function runAgentPreview(
  input: AgentPreviewInput,
  signal: AbortSignal
): Promise<AgentPreviewOutcome> {
  const buckets = emptyBuckets();
  const dispatch = () => input.onUpdate({ ...buckets });
  const reducer = makeEventHandler(buckets, dispatch);

  let lastEventAt = Date.now();
  const handleEvent = (event: OnboardingPreviewEvent) => {
    lastEventAt = Date.now();
    reducer(event);
  };

  const watchdogController = new AbortController();
  let watchdogResolved = false;
  const onCallerAbort = () => watchdogController.abort();
  if (signal.aborted) watchdogController.abort();
  else signal.addEventListener("abort", onCallerAbort, { once: true });

  let runId: string | null = null;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;

  const tick = async () => {
    if (!runId) return;
    if (buckets.result) return;
    if (Date.now() - lastEventAt < SILENCE_THRESHOLD_MS) return;
    try {
      const snap = await fetchPreviewStatus(runId, { signal: watchdogController.signal });
      if (!snap || snap.status === "running") return;
      void trackPreviewRecovery(runId, snap.status);
      if (snap.result) {
        seedBucketsFromResult(reducer, buckets, snap.result);
      }
      if (snap.error) {
        reducer({ type: "error", message: snap.error.message });
      } else if (snap.status === "failed") {
        reducer({ type: "error", message: "Preview run failed." });
      }
      watchdogResolved = true;
      watchdogController.abort();
    } catch {
      // ignore — retry next tick or settle when SSE closes
    }
  };

  const startWatchdog = () => {
    if (watchdogTimer) return;
    watchdogTimer = setInterval(() => {
      void tick();
    }, WATCHDOG_INTERVAL_MS);
  };

  try {
    if (input.resumeRunId) {
      runId = input.resumeRunId;
      input.onRunId?.(runId);
      handleEvent({ type: "run", runId, reused: true });
      startWatchdog();
      try {
        await resumeOnboardingPreview(input.resumeRunId, {
          onEvent: handleEvent,
          signal: watchdogController.signal,
          lastEventId: input.resumeLastEventId,
        });
      } catch (error) {
        if (!watchdogResolved) throw error;
      }
    } else {
      try {
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
          signal: watchdogController.signal,
          onEvent: handleEvent,
          onRunId: (next) => {
            runId = next;
            input.onRunId?.(next);
            if (next) startWatchdog();
          },
        });
        if (!runId && result.runId) runId = result.runId;
      } catch (error) {
        if (!watchdogResolved) throw error;
      }
    }

    if (!hasAnyBucket(buckets)) {
      throw new Error("Brand analysis returned no data. Please retry.");
    }

    return { runId, buckets };
  } finally {
    if (watchdogTimer) clearInterval(watchdogTimer);
    signal.removeEventListener("abort", onCallerAbort);
  }
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
