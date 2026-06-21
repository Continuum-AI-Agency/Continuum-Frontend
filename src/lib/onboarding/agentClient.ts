import { z } from "zod";
import {
  readinessDimensionKey as readinessDimensionSchema,
  readinessFindingSchema,
  readinessAnalysisSchema,
  // Canonical onboarding section + profile schemas. The Backend generates and
  // emits against these exact schemas, so the Frontend interpreter must parse
  // against them too — no parallel hand-rolled copies (monorepo §4).
  brandVoiceSchema,
  targetAudienceSchema,
  audienceSegmentSchema,
  websiteSummarySchema,
  businessSummarySchema,
  firstImpressionSchema,
  brandProfileSchema,
  onboardingReportStructuredSchema,
  brandReportSectionSchema,
  brandReportEnrichSectionSchema,
  brandStrategySchema,
  brandGuidelinesSchema,
  type BrandStrategy,
  type BrandGuidelines,
  type ReadinessDimensionKey as ReadinessDimension,
  type ReadinessFinding,
  type ReadinessAnalysis,
  type BrandReportProgressEvent,
  type BrandVoice,
  type TargetAudience,
  type AudienceSegment,
  type WebsiteSummary,
  type BrandPalette,
  type BrandTypography,
  type BusinessSummary,
  type FirstImpression,
  type BrandProfile,
} from "@continuum/contracts";
import { getApiBaseUrl } from "@/lib/api/config";
import type { ScrapeResult } from "@/lib/onboarding/scrape";

// Re-export the canonical contracts schemas under the names the rest of the
// onboarding Frontend already imports, so consumers stay stable while the
// definitions live in @continuum/contracts.
export {
  readinessDimensionSchema,
  readinessFindingSchema,
  readinessAnalysisSchema,
  brandVoiceSchema,
  targetAudienceSchema,
  websiteSummarySchema,
  businessSummarySchema,
  firstImpressionSchema,
};
export type {
  ReadinessDimension,
  ReadinessFinding,
  ReadinessAnalysis,
  BrandVoice,
  TargetAudience,
  WebsiteSummary,
  BusinessSummary,
  FirstImpression,
};
// Legacy Frontend aliases for renamed/equivalent contracts exports.
export const audiencePersonaSchema = audienceSegmentSchema;
export const agentBrandProfileSchema = brandProfileSchema;
export type AudiencePersona = AudienceSegment;
export type AgentBrandProfile = BrandProfile;
export type WebsitePalette = BrandPalette;
export type WebsiteTypography = BrandTypography;

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

// Single-source: the section + enrich-section enums come from @continuum/contracts
// (no parallel hand-rolled copy, monorepo §4). New sections — strategy,
// guidelines — flow in automatically.
export const previewSectionSchema = brandReportSectionSchema;
export type PreviewSection = z.infer<typeof previewSectionSchema>;

const enrichSectionSchema = brandReportEnrichSectionSchema;
export type EnrichSection = z.infer<typeof enrichSectionSchema>;

export const understandingSchema = z
  .object({
    positioning_thesis: z.string().optional(),
    hypothesis_icp: z.string().optional(),
    brand_pillars: z.array(z.string()).optional(),
    tonal_signal: z.string().optional(),
    notable_evidence: z.array(z.string()).optional(),
    content_pillars: z.array(z.string()).nullable().optional(),
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
    strategy: sectionAuditSchema.optional(),
    guidelines: sectionAuditSchema.optional(),
  })
  .passthrough();

export type SectionAudit = z.infer<typeof sectionAuditSchema>;
export type SectionAudits = z.infer<typeof auditsSchema>;
export type UnderstandingBrief = z.infer<typeof understandingSchema>;

// Every heavy sub-field is wrapped in `.catch(...)` so a degraded run (a section
// whose structured generation failed and was assembled into a partial/invalid
// slot) never throws when we parse the terminal `complete` frame. A malformed
// field drops to undefined/null and the rest of the report still surfaces; the
// per-section `data` events remain the primary populate path.
export const previewWorkflowResultSchema = z
  .object({
    brand_profile: agentBrandProfileSchema.optional().catch(undefined),
    structured: onboardingReportStructuredSchema.optional().catch(undefined),
    readiness: readinessAnalysisSchema.nullable().optional().catch(null),
    understanding: understandingSchema.optional().catch(undefined),
    audits: auditsSchema.optional().catch(undefined),
    first_impression: firstImpressionSchema.nullable().optional().catch(null),
    citations: z.record(z.string(), z.unknown()).optional().catch(undefined),
    prompt_version: z.number().int().nonnegative().optional().catch(undefined),
  })
  .partial()
  .passthrough();

const seqSchema = z.number().int().nonnegative().optional();

const previewStatusEventSchema = z
  .object({
    kind: z.literal("status"),
    section: previewSectionSchema,
    status: z.enum(["running", "done", "skipped", "error"]),
    error: z.string().optional(),
    seq: seqSchema,
  })
  .passthrough();

const previewStreamEventSchema = z.object({
  kind: z.literal("stream"),
  section: previewSectionSchema,
  delta: z.string(),
  seq: seqSchema,
});

const previewDataEventSchema = z.object({
  kind: z.literal("data"),
  section: previewSectionSchema,
  data: z.unknown(),
  seq: seqSchema,
});

const previewStructuredEventSchema = z.object({
  kind: z.literal("structured"),
  data: onboardingReportStructuredSchema,
  seq: seqSchema,
});

const previewEmbeddingEventSchema = z
  .object({
    kind: z.literal("embedding"),
    target: z.string(),
    status: z.string(),
    error: z.string().optional(),
    seq: seqSchema,
  })
  .passthrough();

const previewPingEventSchema = z
  .object({
    kind: z.literal("ping"),
    ts: z.union([z.string(), z.number()]).optional(),
    seq: seqSchema,
  })
  .passthrough();

const previewSparkEventSchema = z
  .object({
    kind: z.literal("spark"),
    section: previewSectionSchema,
    label: z.string(),
    seq: seqSchema,
  })
  .passthrough();

const previewErrorSchema = z
  .object({
    kind: z.literal("error"),
    message: z.string(),
    seq: seqSchema,
  })
  .passthrough();

const previewRunEventSchema = z
  .object({
    kind: z.literal("run"),
    run_id: z.string(),
    reused: z.boolean().optional().default(false),
    seq: seqSchema,
  })
  .passthrough();

const previewEnrichEventSchema = z
  .object({
    kind: z.literal("enrich"),
    section: enrichSectionSchema,
    data: z.unknown(),
    seq: z.number().int().nonnegative(),
  })
  .passthrough();

const previewCompleteSchema = z
  .object({
    kind: z.literal("complete"),
    phase: z.string().optional(),
    status: z.enum(["ok", "partial", "error"]).catch("error"),
    result: previewWorkflowResultSchema.optional(),
    seq: seqSchema,
  })
  .passthrough();

export type OnboardingReportStructured = z.infer<typeof onboardingReportStructuredSchema>;
export type OnboardingPreviewSection = PreviewSection;
export type OnboardingPreviewWorkflowResult = z.infer<typeof previewWorkflowResultSchema>;

export type SectionStatusValue = "running" | "done" | "skipped" | "error";
export type CompleteStatusValue = "ok" | "partial" | "error";

export type OnboardingPreviewEvent =
  | { type: "run"; runId: string; reused: boolean; seq?: number }
  | { type: "status"; section: PreviewSection; status: SectionStatusValue; error?: string; seq?: number }
  | { type: "stream"; section: PreviewSection; delta: string; seq?: number }
  | { type: "voice"; payload: BrandVoice; seq?: number }
  | { type: "audience"; payload: TargetAudience; seq?: number }
  | { type: "brand_profile"; payload: AgentBrandProfile; seq?: number }
  | { type: "website"; payload: WebsiteSummary | null; seq?: number }
  | { type: "business"; payload: BusinessSummary | null; seq?: number }
  | { type: "strategy"; payload: BrandStrategy | null; seq?: number }
  | { type: "guidelines"; payload: BrandGuidelines | null; seq?: number }
  | { type: "readiness"; payload: ReadinessAnalysis; seq?: number }
  | { type: "first_impression"; payload: FirstImpression; seq?: number }
  | { type: "spark"; section: PreviewSection; label: string; seq?: number }
  | { type: "structured"; payload: OnboardingReportStructured; seq?: number }
  | { type: "embedding"; target: string; status: string; error?: string; seq?: number }
  | { type: "enrich"; section: EnrichSection; data: unknown; seq: number }
  | { type: "complete"; phase?: string; status: CompleteStatusValue; result?: OnboardingPreviewWorkflowResult; seq?: number }
  | { type: "ping"; seq?: number }
  | { type: "error"; message: string; seq?: number };

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;
  let detail: string | undefined;
  let issues: string | undefined;
  try {
    const data = (await response.json()) as {
      error?: string;
      message?: string;
      details?: Array<{ path?: Array<string | number>; message?: string }>;
    };
    detail = data?.error ?? data?.message;
    if (Array.isArray(data?.details) && data.details.length > 0) {
      issues = data.details
        .map((issue) => {
          const path = Array.isArray(issue?.path) ? issue.path.join(".") : "";
          const reason = issue?.message ?? "invalid";
          return path ? `${path}: ${reason}` : reason;
        })
        .join("; ");
    }
  } catch {
    try {
      detail = await response.text();
    } catch {
      detail = undefined;
    }
  }
  const base = detail && detail.trim().length > 0 ? detail : `${response.status} ${response.statusText}`;
  const message = issues ? `${base} (${issues})` : base;
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

export const previewStatusSnapshotSchema = z
  .object({
    runId: z.string(),
    status: previewRunStatusSchema,
    lastSeq: z.number().int().nonnegative().nullable().optional(),
    startedAt: z.string().optional(),
    completedAt: z.union([z.string(), z.null()]).optional(),
    result: previewWorkflowResultSchema.nullable().optional(),
    error: z
      .object({ message: z.string() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();
export type PreviewStatusSnapshot = z.infer<typeof previewStatusSnapshotSchema>;

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

async function readRunHandshake(
  body: ReadableStream<Uint8Array>
): Promise<{ runId: string | null; reused: boolean; stream: ReadableStream<Uint8Array> }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const match = buffer.match(/event:\s*run\r?\ndata:\s*(\{[^\n]+\})\r?\n/);
    if (match) {
      let runId: string | null = null;
      let reused = false;
      try {
        const parsed = JSON.parse(match[1]) as { run_id?: string; reused?: boolean };
        runId = parsed.run_id ?? null;
        reused = Boolean(parsed.reused);
      } catch {
        // malformed handshake — proceed without runId
      }
      const remainder = buffer.slice((match.index ?? 0) + match[0].length);
      const remainderBytes = new TextEncoder().encode(remainder);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          if (remainderBytes.length > 0) controller.enqueue(remainderBytes);
        },
        pull(controller) {
          return reader.read().then(({ value: chunk, done: d }) => {
            if (d) controller.close();
            else controller.enqueue(chunk);
          });
        },
        cancel() {
          reader.cancel();
        },
      });
      return { runId, reused, stream };
    }
  }

  return { runId: null, reused: false, stream: new ReadableStream({ start: (c) => c.close() }) };
}

export async function runOnboardingPreview(options: PreviewOptions): Promise<RunOnboardingPreviewResult> {
  const response = await fetch(buildUrl("/onboarding/brand-profiles/preview"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      brandProfile: options.payload.brandProfile,
      runContext: options.payload.runContext,
      scrape: options.payload.scrape ?? null,
      richMode: true,
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

  const { runId, reused, stream } = await readRunHandshake(response.body);
  options.onRunId?.(runId);
  if (runId) options.onEvent?.({ type: "run", runId, reused });

  const result = await consumePreviewStream(stream, {
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

export async function fetchPreviewStatus(
  runId: string,
  options?: { signal?: AbortSignal }
): Promise<PreviewStatusSnapshot | null> {
  const response = await fetch(
    buildUrl(`/onboarding/brand-profiles/preview/${encodeURIComponent(runId)}/status`),
    { method: "GET", cache: "no-store", signal: options?.signal }
  );
  if (response.status === 404) return null;
  await assertOk(response);
  return previewStatusSnapshotSchema.parse(await response.json());
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
  let highWater = 0;

  const dispatch = (event: OnboardingPreviewEvent) => {
    options.onEvent?.(event);
  };

  // A single malformed section must never abort the whole stream — safeParse and
  // skip the offending section, keeping every other section renderable.
  const skipMalformedSection = (section: PreviewSection, error: z.ZodError) => {
    console.warn("[agentClient] Malformed section data ignored", {
      section,
      issues: error.issues.map((i) => i.path.join(".")).join(", "),
    });
  };

  const handleDataEvent = (payload: z.infer<typeof previewDataEventSchema>) => {
    switch (payload.section) {
      case "brand_profile": {
        const parsed = agentBrandProfileSchema.safeParse(payload.data);
        if (!parsed.success) return skipMalformedSection("brand_profile", parsed.error);
        latestProfile = parsed.data;
        dispatch({ type: "brand_profile", payload: parsed.data });
        break;
      }
      case "voice": {
        const parsed = brandVoiceSchema.safeParse(payload.data);
        if (!parsed.success) return skipMalformedSection("voice", parsed.error);
        dispatch({ type: "voice", payload: parsed.data });
        break;
      }
      case "audience": {
        const parsed = targetAudienceSchema.safeParse(payload.data);
        if (!parsed.success) return skipMalformedSection("audience", parsed.error);
        dispatch({ type: "audience", payload: parsed.data });
        break;
      }
      case "website": {
        const parsed = websiteSummarySchema.nullable().safeParse(payload.data);
        if (!parsed.success) return skipMalformedSection("website", parsed.error);
        dispatch({ type: "website", payload: parsed.data });
        break;
      }
      case "business": {
        const parsed = businessSummarySchema.nullable().safeParse(payload.data);
        if (!parsed.success) return skipMalformedSection("business", parsed.error);
        dispatch({ type: "business", payload: parsed.data });
        break;
      }
      case "strategy": {
        const parsed = brandStrategySchema.nullable().safeParse(payload.data);
        if (!parsed.success) return skipMalformedSection("strategy", parsed.error);
        dispatch({ type: "strategy", payload: parsed.data });
        break;
      }
      case "guidelines": {
        const parsed = brandGuidelinesSchema.nullable().safeParse(payload.data);
        if (!parsed.success) return skipMalformedSection("guidelines", parsed.error);
        dispatch({ type: "guidelines", payload: parsed.data });
        break;
      }
      case "readiness": {
        const parsed = readinessAnalysisSchema.safeParse(payload.data);
        if (!parsed.success) return skipMalformedSection("readiness", parsed.error);
        dispatch({ type: "readiness", payload: parsed.data });
        break;
      }
      case "first_impression": {
        const parsed = firstImpressionSchema.safeParse(payload.data);
        if (!parsed.success) return skipMalformedSection("first_impression", parsed.error);
        dispatch({ type: "first_impression", payload: parsed.data });
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
      const typedKind = kind as BrandReportProgressEvent["kind"];
      switch (typedKind) {
        case "ping": {
          previewPingEventSchema.parse(parsedPayload);
          dispatch({ type: "ping" });
          return;
        }
        case "run": {
          try {
            const parsed = previewRunEventSchema.parse(parsedPayload);
            dispatch({ type: "run", runId: parsed.run_id, reused: parsed.reused, seq: parsed.seq });
          } catch (error) {
            if (error instanceof z.ZodError) {
              console.warn("[agentClient] Malformed run event ignored", { eventName });
              return;
            }
            throw error;
          }
          return;
        }
        case "spark": {
          try {
            const parsed = previewSparkEventSchema.parse(parsedPayload);
            dispatch({ type: "spark", section: parsed.section, label: parsed.label, seq: parsed.seq });
          } catch (error) {
            if (error instanceof z.ZodError) {
              console.warn("[agentClient] Malformed spark event ignored", { eventName });
              return;
            }
            throw error;
          }
          return;
        }
        case "status": {
          const parsed = previewStatusEventSchema.parse(parsedPayload);
          dispatch({
            type: "status",
            section: parsed.section,
            status: parsed.status,
            error: parsed.error,
            seq: parsed.seq,
          });
          return;
        }
        case "stream": {
          const parsed = previewStreamEventSchema.parse(parsedPayload);
          dispatch({ type: "stream", section: parsed.section, delta: parsed.delta, seq: parsed.seq });
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
          dispatch({ type: "structured", payload: parsed.data, seq: parsed.seq });
          return;
        }
        case "embedding": {
          const parsed = previewEmbeddingEventSchema.parse(parsedPayload);
          dispatch({
            type: "embedding",
            target: parsed.target,
            status: parsed.status,
            error: parsed.error,
            seq: parsed.seq,
          });
          return;
        }
        case "enrich": {
          try {
            const parsed = previewEnrichEventSchema.parse(parsedPayload);
            dispatch({ type: "enrich", section: parsed.section, data: parsed.data, seq: parsed.seq });
          } catch (error) {
            if (error instanceof z.ZodError) {
              console.warn("[agentClient] Malformed enrich event ignored", { eventName });
              return;
            }
            throw error;
          }
          return;
        }
        case "complete": {
          // `complete` is terminal-ish and must always reach the reducer so the
          // report renders. `previewWorkflowResultSchema` already drops invalid
          // sub-fields (see its `.catch(...)`), so envelope parsing can't throw on
          // a degraded run; safeParse guards a malformed envelope itself.
          const res = previewCompleteSchema.safeParse(parsedPayload);
          if (!res.success) {
            console.warn("[agentClient] Malformed complete event ignored", { eventName });
            return;
          }
          const parsed = res.data;
          if (parsed.result) {
            if (parsed.result.brand_profile) latestProfile = parsed.result.brand_profile;
            if (parsed.result.structured) latestStructured = parsed.result.structured;
            finalResult = parsed.result;
          }
          dispatch({
            type: "complete",
            phase: parsed.phase,
            status: parsed.status,
            result: parsed.result,
            seq: parsed.seq,
          });
          return;
        }
        case "error": {
          // Surface the error to the reducer (flips running sections to error) but
          // do NOT abort the consumer — already-streamed sections must survive. A
          // truly-empty run is caught downstream by `runAgentPreview`'s
          // `hasAnyBucket` gate, which throws the "no data" error there.
          const parsed = previewErrorSchema.parse(parsedPayload);
          dispatch({ type: "error", message: parsed.message, seq: parsed.seq });
          return;
        }
        default: {
          const _exhaustive: never = typedKind;
          void _exhaustive;
          console.warn("[agentClient] Unknown SSE event kind ignored", { kind, eventName });
          return;
        }
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
            seq: parsed.seq,
          });
        } catch {
          // legacy named-event status payload didn't match the contract — ignore
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
        if (sequence !== null) {
          if (sequence <= highWater) {
            continue;
          }
          highWater = sequence;
          options.onSequence?.(sequence);
        }
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
