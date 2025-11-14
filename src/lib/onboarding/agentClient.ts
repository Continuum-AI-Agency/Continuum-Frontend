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

const previewStatusSchema = z.object({
  phase: z.string(),
  status: z.string(),
}).passthrough();

const previewErrorSchema = z.object({
  message: z.string(),
}).passthrough();

const previewCompleteSchema = z.object({
  phase: z.string().optional(),
  status: z.string(),
}).passthrough();

export type OnboardingPreviewEvent =
  | { type: "status"; phase: string; status: string; meta?: Record<string, unknown> }
  | { type: "voice"; payload: BrandVoice }
  | { type: "audience"; payload: TargetAudience }
  | { type: "brand_profile"; payload: AgentBrandProfile }
  | { type: "complete"; phase?: string; status: string }
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

export async function runOnboardingPreview(options: PreviewOptions): Promise<{ brandProfile?: AgentBrandProfile }> {
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

  const dispatch = (event: OnboardingPreviewEvent) => {
    options.onEvent?.(event);
  };

  const handleMessage = (eventName: string, data: string) => {
    if (eventName === "ping") {
      dispatch({ type: "ping" });
      return;
    }

    let parsed: unknown = data;
    try {
      parsed = JSON.parse(data);
    } catch {
      // ignore JSON parse failures for plain-text events
    }

    switch (eventName) {
      case "status": {
        const payload = previewStatusSchema.parse(parsed);
        const { phase, status, ...meta } = payload;
        dispatch({
          type: "status",
          phase,
          status,
          meta: Object.keys(meta).length ? meta : undefined,
        });
        break;
      }
      case "voice": {
        const payload = brandVoiceSchema.parse(parsed);
        dispatch({ type: "voice", payload });
        break;
      }
      case "audience": {
        const payload = targetAudienceSchema.parse(parsed);
        dispatch({ type: "audience", payload });
        break;
      }
      case "brand_profile": {
        const payload = agentBrandProfileSchema.parse(parsed);
        latestProfile = payload;
        dispatch({ type: "brand_profile", payload });
        break;
      }
      case "complete": {
        const payload = previewCompleteSchema.parse(parsed);
        dispatch({ type: "complete", phase: payload.phase, status: payload.status });
        break;
      }
      case "error": {
        const payload = previewErrorSchema.parse(parsed);
        dispatch({ type: "error", message: payload.message });
        throw new Error(payload.message);
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
          }
        }
        if (!eventName || dataLines.length === 0) {
          continue;
        }
        handleMessage(eventName, dataLines.join("\n"));
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { brandProfile: latestProfile };
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
