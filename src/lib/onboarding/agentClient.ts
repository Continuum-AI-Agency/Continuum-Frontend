import { z } from "zod";
import { getApiBaseUrl } from "@/lib/api/config";
import type { ScrapeResult } from "@/lib/onboarding/scrape";

const CLIENT_BASE_URL_KEYS = [
  "NEXT_PUBLIC_ONBOARDING_AGENT_BASE_URL",
  "NEXT_PUBLIC_CONTINUUM_ONBOARDING_BASE_URL",
  "NEXT_PUBLIC_CONTINUUM_AGENT_BASE_URL",
  "NEXT_PUBLIC_CONTINUUM_API_BASE_URL",
] as const;

const SERVER_BASE_URL_KEYS = [
  "ONBOARDING_AGENT_BASE_URL",
  "CONTINUUM_ONBOARDING_BASE_URL",
  "CONTINUUM_AGENT_BASE_URL",
  "CONTINUUM_API_BASE_URL",
] as const;

function stripTrailingSlash(input: string): string {
  return input.endsWith("/") ? stripTrailingSlash(input.slice(0, -1)) : input;
}

function readEnv(keys: readonly string[]): string | null {
  for (const key of keys) {
    const raw = process.env[key];
    if (raw && raw.trim().length > 0) {
      return stripTrailingSlash(raw.trim());
    }
  }
  return null;
}

let cachedBaseUrl: string | null = null;

export function getOnboardingAgentBaseUrl(): string {
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }
  const isBrowser = typeof window !== "undefined";
  const clientValue = readEnv(CLIENT_BASE_URL_KEYS);
  const serverValue = isBrowser ? null : readEnv(SERVER_BASE_URL_KEYS);
  cachedBaseUrl = clientValue ?? serverValue ?? getApiBaseUrl();
  return cachedBaseUrl;
}

function buildUrl(path: string): string {
  const base = getOnboardingAgentBaseUrl();
  if (!path || path === "/") {
    return base;
  }
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

const integrationProviderSchema = z.enum([
  "youtube",
  "google-ads",
  "meta",
  "linkedin",
  "tiktok",
  "google-drive",
  "sharepoint",
  "canva",
  "figma",
]);

export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;

export const brandVoiceSchema = z.object({
  tone: z.string().min(1).optional(),
  voice_style: z.string().optional(),
  key_messaging: z.array(z.string()).optional(),
  keywords: z.array(z.string().min(1)).optional(),
  emoji_usage: z.string().optional(),
  mission: z.string().optional(),
  vision: z.string().optional(),
  core_values: z.array(z.string()).optional(),
});

export type BrandVoice = z.infer<typeof brandVoiceSchema>;

export const targetAudienceSchema = z.object({
  summary: z.string().optional(),
  demographics: z.array(z.string()).optional(),
  psychographics: z.array(z.string()).optional(),
  behaviors: z.array(z.string()).optional(),
  motivations: z.array(z.string()).optional(),
  pain_points: z.array(z.string()).optional(),
  goals: z.array(z.string()).optional(),
  challenges: z.array(z.string()).optional(),
  solutions: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
  interests: z.array(z.string()).optional(),
  buying_criteria: z.array(z.string()).optional(),
  other: z.array(z.string()).optional(),
});

export type TargetAudience = z.infer<typeof targetAudienceSchema>;

const platformAgentResultSchema = z.object({ provider: z.string().optional() }).passthrough();

const websiteSummarySchema = z
  .object({
    website_url: z.union([z.string().min(1), z.null()]).optional(),
    hero_statement: z.union([z.string(), z.null()]).optional(),
  })
  .passthrough();

const documentsSummarySchema = z
  .object({
    primary_topics: z.array(z.string()).default([]),
    secondary_topics: z.array(z.string()).default([]),
    notes: z.string().optional(),
  })
  .passthrough();

const businessSummarySchema = z
  .object({
    business_name: z.string().optional(),
    business_description: z.string().optional(),
    business_features: z.array(z.string()).optional(),
    business_benefits: z.array(z.string()).optional(),
    business_cta: z.union([z.string(), z.null()]).optional(),
  })
  .passthrough();

const onboardingReportStructuredSchema = z
  .object({
    connected_accounts: z.array(platformAgentResultSchema).default([]),
    website: websiteSummarySchema,
    documents: documentsSummarySchema,
    target_audience: targetAudienceSchema.default({}),
    business: businessSummarySchema.nullable().optional(),
  })
  .passthrough();

export const agentBrandProfileSchema = z.object({
  id: z.string().min(1),
  brand_name: z.string().min(1),
  description: z.string().optional(),
  brand_voice: brandVoiceSchema.optional(),
  target_audience: targetAudienceSchema.optional(),
  website_url: z.string().min(1).optional(),
});

export type AgentBrandProfile = z.infer<typeof agentBrandProfileSchema>;

export const agentRunContextSchema = z.object({
  user_id: z.string().min(1),
  brand_id: z.string().min(1).optional(),
  brand_name: z.string().min(1),
  created_at: z
    .string()
    .datetime()
    .default(() => new Date().toISOString()),
  platform_urls: z.array(z.string().min(1)).default([]),
  integrated_platforms: z.array(integrationProviderSchema).default([]),
  brand_voice_tags: z.array(z.string().min(1)).default([]),
  integration_account_ids: z.array(z.string().uuid()).default([]),
});

export type AgentRunContext = z.infer<typeof agentRunContextSchema>;

const initialPhaseResultSchema = z.object({
  brand_profile: agentBrandProfileSchema,
});

export type InitialPhaseResult = z.infer<typeof initialPhaseResultSchema>;

export type AgentRequestPayload = {
  brandProfile: AgentBrandProfile;
  runContext: AgentRunContext;
  scrape?: ScrapeResult | null;
};

export const readinessDimensionSchema = z.enum([
  "value_proposition",
  "icp_clarity",
  "customer_pains",
  "success_metrics",
  "positioning",
  "messaging_coherence",
  "brand_identity",
]);

export type ReadinessDimension = z.infer<typeof readinessDimensionSchema>;

export const readinessFindingSchema = z.object({
  dimension: readinessDimensionSchema,
  score: z.number().min(0).max(100),
  severity: z.enum(["low", "medium", "high"]),
  headline: z.string().min(1),
  detail: z.string().min(1),
  recommendation: z.string().min(1),
});

export type ReadinessFinding = z.infer<typeof readinessFindingSchema>;

export const readinessAnalysisSchema = z.object({
  overall_score: z.number().min(0).max(100),
  dimensions: z.record(
    readinessDimensionSchema,
    z.object({ score: z.number().min(0).max(100), rationale: z.string() })
  ),
  findings: z.array(readinessFindingSchema).default([]),
  generated_at: z.string(),
});

export type ReadinessAnalysis = z.infer<typeof readinessAnalysisSchema>;

const previewSectionSchema = z.enum([
  "brand_profile",
  "voice",
  "audience",
  "website",
  "business",
  "readiness",
  "first_impression",
]);
type PreviewSection = z.infer<typeof previewSectionSchema>;

export const firstImpressionSchema = z.object({
  headline: z.string().min(1),
});
export type FirstImpression = z.infer<typeof firstImpressionSchema>;

export const understandingSchema = z
  .object({
    positioning_thesis: z.string().optional(),
    hypothesis_icp: z.string().optional(),
    brand_pillars: z.array(z.string()).optional(),
    tonal_signal: z.string().optional(),
    notable_evidence: z.array(z.string()).optional(),
  })
  .passthrough();

const sectionAuditSchema = z
  .object({
    score: z.number().min(0).max(100).optional(),
    severity: z.enum(["low", "medium", "high"]).optional(),
    findings: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const auditsSchema = z
  .object({
    voice: sectionAuditSchema.optional(),
    audience: sectionAuditSchema.optional(),
    website: sectionAuditSchema.optional(),
    business: sectionAuditSchema.optional(),
  })
  .passthrough();

export type SectionAudit = z.infer<typeof sectionAuditSchema>;
export type SectionAudits = z.infer<typeof auditsSchema>;
export type UnderstandingBrief = z.infer<typeof understandingSchema>;

export const previewWorkflowResultSchema = z
  .object({
    brand_profile: agentBrandProfileSchema.optional(),
    structured: onboardingReportStructuredSchema.optional(),
    readiness: readinessAnalysisSchema.nullable().optional(),
    understanding: understandingSchema.optional(),
    audits: auditsSchema.optional(),
    first_impression: firstImpressionSchema.nullable().optional(),
    prompt_version: z.number().int().nonnegative().optional(),
  })
  .partial()
  .passthrough();

const previewStatusEventSchema = z
  .object({
    kind: z.literal("status"),
    section: previewSectionSchema,
    status: z.string(),
    error: z.string().optional(),
  })
  .passthrough();

const previewStreamEventSchema = z.object({
  kind: z.literal("stream"),
  section: previewSectionSchema,
  delta: z.string(),
});

const previewDataEventSchema = z.object({
  kind: z.literal("data"),
  section: previewSectionSchema,
  data: z.unknown(),
});

const previewStructuredEventSchema = z.object({
  kind: z.literal("structured"),
  data: onboardingReportStructuredSchema,
});

const previewEmbeddingEventSchema = z
  .object({
    kind: z.literal("embedding"),
    target: z.string(),
    status: z.string(),
    error: z.string().optional(),
  })
  .passthrough();

const previewPingEventSchema = z
  .object({
    kind: z.literal("ping"),
    ts: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const previewSparkEventSchema = z
  .object({
    kind: z.literal("spark"),
    section: z.string(),
    label: z.string(),
  })
  .passthrough();

const previewErrorSchema = z
  .object({
    kind: z.literal("error"),
    message: z.string(),
  })
  .passthrough();

const previewCompleteSchema = z.object({
  kind: z.literal("complete"),
  phase: z.string().optional(),
  status: z.string(),
  result: previewWorkflowResultSchema.optional(),
}).passthrough();

export type PlatformAgentResult = z.infer<typeof platformAgentResultSchema>;
export type WebsiteSummary = z.infer<typeof websiteSummarySchema>;
export type DocumentsSummary = z.infer<typeof documentsSummarySchema>;
export type BusinessSummary = z.infer<typeof businessSummarySchema>;
export type OnboardingReportStructured = z.infer<typeof onboardingReportStructuredSchema>;
export type OnboardingPreviewSection = PreviewSection;
export type OnboardingPreviewWorkflowResult = z.infer<typeof previewWorkflowResultSchema>;

export type OnboardingPreviewEvent =
  | { type: "status"; section: PreviewSection; status: string; error?: string }
  | { type: "stream"; section: PreviewSection; delta: string }
  | { type: "voice"; payload: BrandVoice }
  | { type: "audience"; payload: TargetAudience }
  | { type: "brand_profile"; payload: AgentBrandProfile }
  | { type: "website"; payload: WebsiteSummary | null }
  | { type: "business"; payload: BusinessSummary | null }
  | { type: "readiness"; payload: ReadinessAnalysis }
  | { type: "first_impression"; payload: FirstImpression }
  | { type: "spark"; section: string; label: string }
  | { type: "structured"; payload: OnboardingReportStructured }
  | { type: "embedding"; target: string; status: string; error?: string }
  | { type: "complete"; phase?: string; status: string; result?: OnboardingPreviewWorkflowResult }
  | { type: "ping" }
  | { type: "error"; message: string };

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;
  let detail: string | undefined;
  try {
    const data = (await response.json()) as { error?: string; message?: string };
    detail = data?.error ?? data?.message;
  } catch {
    try {
      detail = await response.text();
    } catch {
      detail = undefined;
    }
  }
  const message = detail && detail.trim().length > 0 ? detail : `${response.status} ${response.statusText}`;
  throw new Error(message);
}

export async function checkOnboardingAgentHealth(options?: { signal?: AbortSignal }): Promise<void> {
  const response = await fetch(buildUrl("/healthz"), {
    method: "GET",
    cache: "no-store",
    signal: options?.signal,
  });
  await assertOk(response);
  let payload: { status?: string } | null = null;
  try {
    payload = (await response.json()) as { status?: string };
  } catch {
    payload = null;
  }
  if (payload?.status !== "ok") {
    throw new Error("Onboarding agent service is unhealthy.");
  }
}

const TERMINAL_OK_STATUSES = new Set(["ok", "success", "done", "completed", "complete"]);

export const PREVIEW_PROMPT_VERSION = 1;

export class PreviewRateLimitedError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`Preview rate limited; retry after ${retryAfterSeconds}s`);
    this.name = "PreviewRateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const previewRunStatusSchema = z.enum(["running", "completed", "partial", "failed"]);
export type PreviewRunStatus = z.infer<typeof previewRunStatusSchema>;

export const previewLatestSchema = z
  .object({
    run_id: z.string(),
    brand_id: z.string(),
    status: previewRunStatusSchema,
    prompt_version: z.number().int().nonnegative(),
    started_at: z.string(),
    completed_at: z.union([z.string(), z.null()]).optional(),
    input_hash: z.string(),
  })
  .passthrough();
export type PreviewLatest = z.infer<typeof previewLatestSchema>;

export const previewSnapshotSchema = z
  .object({
    run_id: z.string(),
    brand_id: z.string(),
    status: previewRunStatusSchema,
    prompt_version: z.number().int().nonnegative(),
    started_at: z.string(),
    completed_at: z.union([z.string(), z.null()]).optional(),
    result: previewWorkflowResultSchema.nullable().optional(),
    error: z
      .object({ message: z.string() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();
export type PreviewSnapshot = z.infer<typeof previewSnapshotSchema>;

type PreviewOptions = {
  payload: AgentRequestPayload;
  signal?: AbortSignal;
  onEvent?: (event: OnboardingPreviewEvent) => void;
  onRunId?: (runId: string | null) => void;
  onSequence?: (sequence: number) => void;
};

export type RunOnboardingPreviewResult = {
  runId: string | null;
  brandProfile?: AgentBrandProfile;
  structured?: OnboardingReportStructured;
  complete?: OnboardingPreviewWorkflowResult;
};

type ConsumerResult = {
  brandProfile?: AgentBrandProfile;
  structured?: OnboardingReportStructured;
  complete?: OnboardingPreviewWorkflowResult;
};

export async function runOnboardingPreview(options: PreviewOptions): Promise<RunOnboardingPreviewResult> {
  const previewHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "X-Onboarding-UX": "rich",
  };

  const response = await fetch(buildUrl("/onboarding/brand-profiles/preview"), {
    method: "POST",
    headers: previewHeaders,
    body: JSON.stringify({
      brandProfile: options.payload.brandProfile,
      runContext: options.payload.runContext,
      scrape: options.payload.scrape ?? null,
    }),
    cache: "no-store",
    signal: options?.signal,
  });

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After") ?? "10");
    throw new PreviewRateLimitedError(Number.isFinite(retryAfter) ? retryAfter : 10);
  }
  await assertOk(response);

  if (!response.body) {
    throw new Error("Preview stream was not available.");
  }

  const runId = response.headers.get("X-Preview-Run-Id");
  options.onRunId?.(runId);

  const result = await consumePreviewStream(response.body, {
    onEvent: options.onEvent,
    onSequence: options.onSequence,
  });
  return { runId, ...result };
}

export async function resumeOnboardingPreview(
  runId: string,
  options: {
    onEvent?: (event: OnboardingPreviewEvent) => void;
    onSequence?: (sequence: number) => void;
    signal?: AbortSignal;
    lastEventId?: number;
    rich?: boolean;
  } = {}
): Promise<ConsumerResult> {
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  if (options.rich !== false) headers["X-Onboarding-UX"] = "rich";
  if (typeof options.lastEventId === "number" && options.lastEventId > 0) {
    headers["Last-Event-ID"] = String(options.lastEventId);
  }

  const response = await fetch(
    buildUrl(`/onboarding/brand-profiles/preview/${encodeURIComponent(runId)}/events`),
    { method: "GET", headers, cache: "no-store", signal: options.signal }
  );
  if (response.status === 404) throw new Error(`Preview run ${runId} not found`);
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After") ?? "10");
    throw new PreviewRateLimitedError(Number.isFinite(retryAfter) ? retryAfter : 10);
  }
  await assertOk(response);
  if (!response.body) throw new Error("Preview resume stream was not available.");
  return await consumePreviewStream(response.body, options);
}

export async function fetchPreviewLatest(
  brandId: string,
  options?: { signal?: AbortSignal }
): Promise<PreviewLatest | null> {
  const response = await fetch(
    buildUrl(`/onboarding/brand-profiles/${encodeURIComponent(brandId)}/preview/latest`),
    { method: "GET", cache: "no-store", signal: options?.signal }
  );
  if (response.status === 404) return null;
  await assertOk(response);
  return previewLatestSchema.parse(await response.json());
}

export async function fetchPreviewSnapshot(
  runId: string,
  options?: { signal?: AbortSignal; events?: boolean }
): Promise<PreviewSnapshot | null> {
  const path = `/onboarding/brand-profiles/preview/${encodeURIComponent(runId)}${
    options?.events ? "?events=true" : ""
  }`;
  const response = await fetch(buildUrl(path), {
    method: "GET",
    cache: "no-store",
    signal: options?.signal,
  });
  if (response.status === 404) return null;
  await assertOk(response);
  return previewSnapshotSchema.parse(await response.json());
}

function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`)
      .join(",")}}`;
  }
  return "null";
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export async function computePreviewInputHash(input: {
  payload: AgentRequestPayload;
  rich?: boolean;
  promptVersion?: number;
}): Promise<string> {
  const canonical = canonicalStringify({
    brandProfile: input.payload.brandProfile,
    runContext: input.payload.runContext,
    scrape: input.payload.scrape ?? null,
    rich: input.rich ?? true,
    promptVersion: input.promptVersion ?? PREVIEW_PROMPT_VERSION,
  });
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("SubtleCrypto is required to compute preview input hash");
  }
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

async function consumePreviewStream(
  body: ReadableStream<Uint8Array>,
  options: {
    onEvent?: (event: OnboardingPreviewEvent) => void;
    onSequence?: (sequence: number) => void;
  }
): Promise<ConsumerResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let latestProfile: AgentBrandProfile | undefined;
  let latestStructured: OnboardingReportStructured | undefined;
  let finalResult: OnboardingPreviewWorkflowResult | undefined;

  const dispatch = (event: OnboardingPreviewEvent) => {
    options.onEvent?.(event);
  };

  const handleDataEvent = (payload: z.infer<typeof previewDataEventSchema>) => {
    switch (payload.section) {
      case "brand_profile": {
        const parsed = agentBrandProfileSchema.parse(payload.data);
        latestProfile = parsed;
        dispatch({ type: "brand_profile", payload: parsed });
        break;
      }
      case "voice": {
        const parsed = brandVoiceSchema.parse(payload.data);
        dispatch({ type: "voice", payload: parsed });
        break;
      }
      case "audience": {
        const parsed = targetAudienceSchema.parse(payload.data);
        dispatch({ type: "audience", payload: parsed });
        break;
      }
      case "website": {
        const parsed = websiteSummarySchema.nullable().parse(payload.data);
        dispatch({ type: "website", payload: parsed });
        break;
      }
      case "business": {
        const parsed = businessSummarySchema.nullable().parse(payload.data);
        dispatch({ type: "business", payload: parsed });
        break;
      }
      case "readiness": {
        const parsed = readinessAnalysisSchema.parse(payload.data);
        dispatch({ type: "readiness", payload: parsed });
        break;
      }
      case "first_impression": {
        const parsed = firstImpressionSchema.parse(payload.data);
        dispatch({ type: "first_impression", payload: parsed });
        break;
      }
      default:
        break;
    }
  };

  const handleParsedPayload = (payload: unknown, eventName?: string | null) => {
    if (payload === undefined || payload === null) {
      return;
    }

    let parsedPayload: unknown = payload;
    if (typeof parsedPayload === "string") {
      const original = parsedPayload;
      try {
        parsedPayload = JSON.parse(original);
      } catch (parseError) {
        console.warn(
          "[agentClient] SSE payload was not valid JSON; treating as string.",
          { preview: original.slice(0, 200), eventName, error: parseError instanceof Error ? parseError.message : parseError }
        );
      }
    }

    const kind =
      typeof parsedPayload === "object" && parsedPayload !== null && "kind" in (parsedPayload as Record<string, unknown>)
        ? (parsedPayload as Record<string, unknown>).kind
        : null;

    if (kind) {
      switch (kind) {
        case "ping": {
          previewPingEventSchema.parse(parsedPayload);
          dispatch({ type: "ping" });
          return;
        }
        case "spark": {
          const parsed = previewSparkEventSchema.parse(parsedPayload);
          dispatch({ type: "spark", section: parsed.section, label: parsed.label });
          return;
        }
        case "status": {
          const parsed = previewStatusEventSchema.parse(parsedPayload);
          dispatch({
            type: "status",
            section: parsed.section,
            status: parsed.status,
            error: parsed.error,
          });
          return;
        }
        case "stream": {
          const parsed = previewStreamEventSchema.parse(parsedPayload);
          dispatch({ type: "stream", section: parsed.section, delta: parsed.delta });
          return;
        }
        case "data": {
          const parsed = previewDataEventSchema.parse(parsedPayload);
          handleDataEvent(parsed);
          return;
        }
        case "structured": {
          const parsed = previewStructuredEventSchema.parse(parsedPayload);
          latestStructured = parsed.data;
          dispatch({ type: "structured", payload: parsed.data });
          return;
        }
        case "embedding": {
          const parsed = previewEmbeddingEventSchema.parse(parsedPayload);
          dispatch({ type: "embedding", target: parsed.target, status: parsed.status, error: parsed.error });
          return;
        }
        case "complete": {
          const parsed = previewCompleteSchema.parse(parsedPayload);
          if (parsed.result) {
            if (parsed.result.brand_profile) {
              latestProfile = agentBrandProfileSchema.parse(parsed.result.brand_profile);
            }
            if (parsed.result.structured) {
              latestStructured = onboardingReportStructuredSchema.parse(parsed.result.structured);
            }
            finalResult = parsed.result;
          }
          dispatch({
            type: "complete",
            phase: parsed.phase,
            status: parsed.status,
            result: parsed.result,
          });
          const status = parsed.status?.toLowerCase() ?? "";
          if (status && !TERMINAL_OK_STATUSES.has(status)) {
            throw new Error(`Onboarding preview did not finish cleanly (status: ${parsed.status}).`);
          }
          return;
        }
        case "error": {
          const parsed = previewErrorSchema.parse(parsedPayload);
          dispatch({ type: "error", message: parsed.message });
          throw new Error(parsed.message);
        }
        default:
          console.warn("[agentClient] Unknown SSE event kind ignored", { kind, eventName });
          return;
      }
    }

    if (eventName === "ping") {
      dispatch({ type: "ping" });
      return;
    }

    if (!eventName) {
      return;
    }

    switch (eventName) {
      case "voice":
        handleDataEvent({ kind: "data", section: "voice", data: parsedPayload } as z.infer<typeof previewDataEventSchema>);
        break;
      case "audience":
        handleDataEvent({ kind: "data", section: "audience", data: parsedPayload } as z.infer<typeof previewDataEventSchema>);
        break;
      case "brand_profile":
        handleDataEvent({ kind: "data", section: "brand_profile", data: parsedPayload } as z.infer<typeof previewDataEventSchema>);
        break;
      case "website":
        handleDataEvent({ kind: "data", section: "website", data: parsedPayload } as z.infer<typeof previewDataEventSchema>);
        break;
      case "business":
        handleDataEvent({ kind: "data", section: "business", data: parsedPayload } as z.infer<typeof previewDataEventSchema>);
        break;
      case "status":
        try {
          const parsed = previewStatusEventSchema.parse({
            kind: "status",
            ...(parsedPayload as Record<string, unknown>),
          });
          dispatch({
            type: "status",
            section: parsed.section,
            status: parsed.status,
            error: parsed.error,
          });
        } catch {
          dispatch({ type: "status", section: "brand_profile", status: "pending" });
        }
        break;
      case "structured": {
        try {
          const parsed = onboardingReportStructuredSchema.parse(parsedPayload);
          latestStructured = parsed;
          dispatch({ type: "structured", payload: parsed });
        } catch {
          // ignore malformed legacy payloads
        }
        break;
      }
      case "complete": {
        try {
          const parsed = previewCompleteSchema.parse(parsedPayload);
          if (parsed.result) {
            if (parsed.result.brand_profile) {
              latestProfile = agentBrandProfileSchema.parse(parsed.result.brand_profile);
            }
            if (parsed.result.structured) {
              latestStructured = onboardingReportStructuredSchema.parse(parsed.result.structured);
            }
            finalResult = parsed.result;
          }
          dispatch({
            type: "complete",
            phase: parsed.phase,
            status: parsed.status,
            result: parsed.result,
          });
        } catch {
          // ignore malformed legacy payloads
        }
        break;
      }
      default:
        break;
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex: number;
      while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        if (!rawEvent.trim()) {
          continue;
        }
        const lines = rawEvent.split(/\r?\n/);
        let eventName: string | null = null;
        const dataLines: string[] = [];
        let sequence: number | null = null;
        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5));
          } else if (line.startsWith("id:")) {
            const raw = Number(line.slice(3).trim());
            if (Number.isFinite(raw) && raw > 0) sequence = raw;
          } else if (line.startsWith(":")) {
            // comment/heartbeat line; ignore
          }
        }
        if (sequence !== null) options.onSequence?.(sequence);
        if (dataLines.length === 0) {
          continue;
        }
        const payload = dataLines.join("\n");
        handleParsedPayload(payload, eventName);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { brandProfile: latestProfile, structured: latestStructured, complete: finalResult };
}

type ApproveOptions = {
  payload: AgentRequestPayload;
  signal?: AbortSignal;
  idempotencyKey?: string;
};

export async function approveOnboardingBrandProfile(options: ApproveOptions): Promise<InitialPhaseResult> {
  const approveHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.idempotencyKey) approveHeaders["X-Idempotency-Key"] = options.idempotencyKey;

  const response = await fetch(buildUrl("/onboarding/brand-profiles/approve"), {
    method: "POST",
    headers: approveHeaders,
    body: JSON.stringify({
      brandProfile: options.payload.brandProfile,
      runContext: options.payload.runContext,
    }),
    cache: "no-store",
    signal: options?.signal,
  });
  await assertOk(response);
  const json = await response.json();
  const parsed = initialPhaseResultSchema.parse(json);
  if (!parsed.brand_profile?.id || !parsed.brand_profile.brand_name) {
    throw new Error("Brand profile approve returned an empty result.");
  }
  if (parsed.brand_profile.id !== options.payload.brandProfile.id) {
    throw new Error(
      `Brand profile id mismatch (expected ${options.payload.brandProfile.id}, got ${parsed.brand_profile.id}).`
    );
  }
  return parsed;
}
