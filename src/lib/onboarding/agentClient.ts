import { z } from "zod";

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
  cachedBaseUrl = clientValue ?? serverValue ?? "http://localhost:4000";
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
    website_url: z.union([z.string().url(), z.null()]).optional(),
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
  website_url: z.string().url().optional(),
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
  platform_urls: z.array(z.string().url()).default([]),
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
};

const previewSectionSchema = z.enum(["brand_profile", "voice", "audience", "website", "business"]);
type PreviewSection = z.infer<typeof previewSectionSchema>;

export const previewWorkflowResultSchema = z
  .object({
    brand_profile: agentBrandProfileSchema.optional(),
    structured: onboardingReportStructuredSchema.optional(),
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

type PreviewOptions = {
  payload: AgentRequestPayload;
  signal?: AbortSignal;
  onEvent?: (event: OnboardingPreviewEvent) => void;
};

export type RunOnboardingPreviewResult = {
  brandProfile?: AgentBrandProfile;
  structured?: OnboardingReportStructured;
  complete?: OnboardingPreviewWorkflowResult;
};

export async function runOnboardingPreview(options: PreviewOptions): Promise<RunOnboardingPreviewResult> {
  const response = await fetch(buildUrl("/onboarding/brand-profiles/preview"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      brandProfile: options.payload.brandProfile,
      runContext: options.payload.runContext,
    }),
    cache: "no-store",
    signal: options?.signal,
  });

  await assertOk(response);

  if (!response.body) {
    throw new Error("Preview stream was not available.");
  }

  const reader = response.body.getReader();
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
      try {
        parsedPayload = JSON.parse(parsedPayload);
      } catch {
        // leave as string
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
          return;
        }
        case "error": {
          const parsed = previewErrorSchema.parse(parsedPayload);
          dispatch({ type: "error", message: parsed.message });
          throw new Error(parsed.message);
        }
        default:
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
        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5));
          } else if (line.startsWith(":")) {
            // comment/heartbeat line; ignore
          }
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
};

export async function approveOnboardingBrandProfile(options: ApproveOptions): Promise<InitialPhaseResult> {
  const response = await fetch(buildUrl("/onboarding/brand-profiles/approve"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      brandProfile: options.payload.brandProfile,
      runContext: options.payload.runContext,
    }),
    cache: "no-store",
    signal: options?.signal,
  });
  await assertOk(response);
  const json = await response.json();
  return initialPhaseResultSchema.parse(json);
}
