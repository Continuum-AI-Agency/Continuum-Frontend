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
  type UnderstandingBrief,
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

async function trackPreviewReconnect(runId: string, snapshotLastSeq: number, fromSeq: number): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { trackOnboardingEvent } = await import("@/lib/onboarding/telemetry");
    trackOnboardingEvent("onboarding_preview_reconnected_via_status", {
      runId,
      snapshot_last_seq: snapshotLastSeq,
      from_seq: fromSeq,
    });
  } catch {
    // telemetry is best-effort
  }
}

export type SectionStatus = "idle" | "running" | "done" | "skipped" | "error";

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
  understanding: UnderstandingBrief | null;
  latestSpark: AgentPreviewSpark | null;
  voiceStream: string;
  audienceStream: string;
  businessStream: string;
  websiteStream: string;
  sectionStatus: Record<PreviewSection, SectionStatus>;
  audits: AgentPreviewAudits;
  citations: Record<string, unknown>;
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
    understanding: null,
    latestSpark: null,
    voiceStream: "",
    audienceStream: "",
    businessStream: "",
    websiteStream: "",
    sectionStatus: makeIdleSectionStatus(),
    audits: {},
    citations: {},
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

/**
 * THE MERGE RULE — see app/agents-ts/onboarding/src/brand_report/frontend.md §4.
 *
 * `complete` fires when the report is renderable, not when work is done. The
 * `result` snapshot can lag the per-section `data` events we've already merged
 * into buckets, and `result.audits`/`first_impression` may be partial. Trust
 * partial state per-field; let `result` fill only what's missing.
 */
export function mergeCompleteResult(
  buckets: AgentPreviewBuckets,
  result: OnboardingPreviewWorkflowResult
): void {
  buckets.brandProfile ??= result.brand_profile ?? null;
  buckets.readiness ??= result.readiness ?? null;
  buckets.firstImpression ??= result.first_impression ?? null;
  buckets.understanding ??= result.understanding ?? null;

  const structured = result.structured as
    | {
        brand_voice?: BrandVoice;
        target_audience?: TargetAudience;
        business?: BusinessSummary;
        website?: WebsiteSummary | null;
      }
    | undefined;
  buckets.voice ??= structured?.brand_voice ?? null;
  buckets.audience ??= structured?.target_audience ?? null;
  buckets.business ??= structured?.business ?? null;
  if (buckets.website === null && structured?.website !== undefined) {
    buckets.website = structured.website;
  }

  if (result.audits) {
    buckets.audits = { ...result.audits, ...buckets.audits };
  }

  const resultCitations = (result as { citations?: Record<string, unknown> }).citations;
  if (resultCitations) {
    buckets.citations = { ...resultCitations, ...buckets.citations };
  }

  buckets.result = result;
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
        if (event.result) mergeCompleteResult(buckets, event.result);
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
  buckets: AgentPreviewBuckets,
  result: OnboardingPreviewWorkflowResult,
  dispatch: () => void
): void {
  mergeCompleteResult(buckets, result);
  for (const section of previewSectionSchema.options) {
    if (buckets.sectionStatus[section] === "idle" || buckets.sectionStatus[section] === "running") {
      buckets.sectionStatus[section] = "done";
    }
  }
  dispatch();
}

const MAX_RECONNECT_ATTEMPTS = 10;

export async function runAgentPreview(
  input: AgentPreviewInput,
  signal: AbortSignal
): Promise<AgentPreviewOutcome> {
  const buckets = emptyBuckets();
  const dispatch = () => input.onUpdate({ ...buckets });
  const reducer = makeEventHandler(buckets, dispatch);

  let lastEventAt = Date.now();
  let lastSeq = input.resumeLastEventId ?? 0;
  const handleEvent = (event: OnboardingPreviewEvent) => {
    lastEventAt = Date.now();
    reducer(event);
  };
  const onSequence = (n: number) => {
    if (n > lastSeq) lastSeq = n;
  };

  let runId: string | null = input.resumeRunId ?? null;
  let watchdogResolved = false;
  let needsReconnect = false;
  let activeController = new AbortController();
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;

  const onCallerAbort = () => activeController.abort();
  if (signal.aborted) activeController.abort();
  else signal.addEventListener("abort", onCallerAbort, { once: true });

  const tick = async () => {
    if (!runId) return;
    if (buckets.result) return;
    if (Date.now() - lastEventAt < SILENCE_THRESHOLD_MS) return;
    try {
      const snap = await fetchPreviewStatus(runId);
      if (!snap) return;
      if (snap.status !== "running") {
        void trackPreviewRecovery(runId, snap.status);
        if (snap.result) {
          seedBucketsFromResult(buckets, snap.result, dispatch);
        }
        if (snap.error) {
          reducer({ type: "error", message: snap.error.message });
        } else if (snap.status === "failed") {
          reducer({ type: "error", message: "Preview run failed." });
        }
        watchdogResolved = true;
        activeController.abort();
        return;
      }
      if (snap.lastSeq != null && snap.lastSeq > lastSeq) {
        void trackPreviewReconnect(runId, snap.lastSeq, lastSeq);
        needsReconnect = true;
        activeController.abort();
      }
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
    if (runId) {
      input.onRunId?.(runId);
      handleEvent({ type: "run", runId, reused: true });
    }
    startWatchdog();

    let attempt = 0;
    while (true) {
      if (signal.aborted) throw new Error("Preview aborted");
      needsReconnect = false;
      if (activeController.signal.aborted && !watchdogResolved) {
        activeController = new AbortController();
        if (signal.aborted) activeController.abort();
      }

      try {
        if (runId) {
          await resumeOnboardingPreview(runId, {
            onEvent: handleEvent,
            onSequence,
            signal: activeController.signal,
            lastEventId: lastSeq > 0 ? lastSeq : undefined,
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
            signal: activeController.signal,
            onEvent: handleEvent,
            onSequence,
            onRunId: (next) => {
              runId = next;
              input.onRunId?.(next);
            },
          });
          if (!runId && result.runId) runId = result.runId;
        }
        // Consumer returned cleanly — stream is done.
        break;
      } catch (error) {
        if (watchdogResolved) break;
        if (needsReconnect && runId && attempt < MAX_RECONNECT_ATTEMPTS) {
          attempt += 1;
          continue;
        }
        throw error;
      }
    }

    if (!hasAnyBucket(buckets)) {
      throw new Error("Brand analysis returned no data. Please retry.");
    }

    return { runId, buckets };
  } finally {
    if (watchdogTimer) clearInterval(watchdogTimer);
    signal.removeEventListener("abort", onCallerAbort);
    activeController.abort();
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
