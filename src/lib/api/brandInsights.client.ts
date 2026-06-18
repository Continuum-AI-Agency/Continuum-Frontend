"use client";

import {
  mapBackendGenerationResponse,
  mapBackendStatusMessage,
  mapBackendStatusResponse,
} from "@/lib/brand-insights/backend";
import {
  trendsSseMessageDataSchema,
  trendsSseSnapshotDataSchema,
} from "@continuum/contracts";

import { getApiBaseUrl } from "@/lib/api/config";
import { assertOk } from "@/lib/api/errors";
import type { RequestOptions } from "@/lib/api/http.types";
import {
  brandInsightsGenerateInputSchema,
  type BrandInsightsStatusMessage,
  type BrandInsightsStatusResponse,
} from "@/lib/schemas/brandInsights";

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toUtcMidnight(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function getCurrentWeekStartUtc() {
  const now = new Date();
  const day = now.getUTCDay();
  const offsetToMonday = (day + 6) % 7;
  const currentDateAtMidnight = toUtcMidnight(now);
  currentDateAtMidnight.setUTCDate(currentDateAtMidnight.getUTCDate() - offsetToMonday);
  return currentDateAtMidnight;
}

function parseWeekStartDate(weekStartDate: string) {
  const parsed = new Date(`${weekStartDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid weekStartDate: ${weekStartDate}`);
  }
  return parsed;
}

function parseIsoTimestamp(value: string, fieldName: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  return parsed;
}

function resolveRequiredWindow(input: {
  weekStartDate?: string;
  windowStart?: string;
  windowEnd?: string;
}) {
  const resolvedWindowStartDate =
    input.windowStart
      ? parseIsoTimestamp(input.windowStart, "windowStart")
      : input.weekStartDate
        ? parseWeekStartDate(input.weekStartDate)
        : getCurrentWeekStartUtc();

  const resolvedWindowEndDate = input.windowEnd
    ? parseIsoTimestamp(input.windowEnd, "windowEnd")
    : new Date(resolvedWindowStartDate.getTime() + WEEK_IN_MS);

  return {
    weekStartDate: input.weekStartDate ?? toIsoDate(resolvedWindowStartDate),
    windowStart: input.windowStart ?? resolvedWindowStartDate.toISOString(),
    windowEnd: input.windowEnd ?? resolvedWindowEndDate.toISOString(),
  };
}

async function getBrowserAccessToken(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  try {
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? undefined;
  } catch {
    return undefined;
  }
}

async function request<TResponse = unknown>(options: RequestOptions<TResponse>): Promise<TResponse> {
  const { path, method = "GET", body, headers = {}, schema, cache, next } = options;
  const baseUrl = getApiBaseUrl();
  const url = /^https?:\/\//i.test(path)
    ? path
    : `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const token = await getBrowserAccessToken();
  const finalHeaders: Record<string, string> = {
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
    cache,
    next,
  });

  await assertOk(response);
  if (response.status === 204) {
    return undefined as unknown as TResponse;
  }
  const json = (await response.json()) as unknown;
  if (schema) {
    return schema.parse(json) as TResponse;
  }
  return json as TResponse;
}

export async function generateBrandInsights(input: unknown) {
  const parsed = brandInsightsGenerateInputSchema.parse(input);
  const window = resolveRequiredWindow({
    weekStartDate: parsed.weekStartDate,
    windowStart: parsed.windowStart,
    windowEnd: parsed.windowEnd,
  });
  const response = await request({
    path: "/api/trends/jobs/start",
    method: "POST",
    body: {
      brand_id: parsed.brandId,
      week_start_date: window.weekStartDate,
      window_start: window.windowStart,
      window_end: window.windowEnd,
      platforms: parsed.selectedSocialPlatforms ?? undefined,
      items_per_platform: parsed.maxItemsPerPlatform ?? undefined,
      force_regenerate: parsed.forceRegenerate ?? undefined,
    },
    cache: "no-store",
  });

  return mapBackendGenerationResponse(response);
}

type FetchBrandInsightsStatusOptions = {
  path?: string;
};

export async function fetchBrandInsightsStatus(generationId: string, options?: FetchBrandInsightsStatusOptions) {
  const response = await request({
    path: options?.path ?? `/api/trends/jobs/${encodeURIComponent(generationId)}`,
    method: "GET",
    cache: "no-store",
  });

  return mapBackendStatusResponse(response);
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "error", "not_found"]);
const DEFAULT_JOB_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 3;

function parseJsonEventData<T = unknown>(event: MessageEvent<string>): T | null {
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return null;
  }
}

// A malformed frame is a contract drift signal, not something to silently
// swallow. In development we surface it so the mismatch is caught early; in
// production we skip the frame and keep the stream alive.
function warnContractDrift(kind: string, issues: unknown): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[brand-insights] dropped malformed ${kind} frame (contract drift)`, issues);
  }
}

export function isTerminalBrandInsightsStatus(status?: string | null): boolean {
  return status ? TERMINAL_STATUSES.has(status) : false;
}

export function resolveBrandInsightsEventsUrl(channel: string, afterMessageId?: number): string {
  const baseUrl = getApiBaseUrl();
  const resolved = new URL(channel, `${baseUrl.replace(/\/$/, "")}/`);
  if (typeof afterMessageId === "number" && Number.isFinite(afterMessageId)) {
    resolved.searchParams.set("after", String(afterMessageId));
  }
  return resolved.toString();
}

type BrandInsightsJobTrackerOptions = {
  generationId: string;
  streamChannel?: string;
  fallbackPollUrl?: string;
  pollIntervalMs?: number;
  maxReconnectAttempts?: number;
  onStatus: (status: BrandInsightsStatusResponse) => void;
  onMessage?: (message: BrandInsightsStatusMessage) => void;
  onError?: (error: Error) => void;
};

function shouldUseEventSource(streamChannel?: string) {
  if (!streamChannel || typeof window === "undefined") return false;
  try {
    const streamUrl = resolveBrandInsightsEventsUrl(streamChannel);
    return new URL(streamUrl).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function subscribeToBrandInsightsJob(options: BrandInsightsJobTrackerOptions): () => void {
  let stopped = false;
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectAttempts = 0;
  let lastMessageId: number | undefined;

  const closeEventSource = () => {
    if (!eventSource) return;
    eventSource.close();
    eventSource = null;
  };

  const clearReconnectTimer = () => {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const clearPollTimer = () => {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
  };

  const stop = () => {
    stopped = true;
    closeEventSource();
    clearReconnectTimer();
    clearPollTimer();
  };

  const pollOnce = async () => {
    const status = await fetchBrandInsightsStatus(options.generationId, {
      path: options.fallbackPollUrl,
    });
    if (status.stream && typeof status.stream.latestMessageId === "number") {
      lastMessageId = status.stream.latestMessageId;
    }
    options.onStatus(status);
    if (isTerminalBrandInsightsStatus(status.status)) {
      stop();
    }
  };

  const startPollingFallback = () => {
    if (pollTimer) return;

    pollOnce().catch((error) => {
      if (!stopped) {
        options.onError?.(error instanceof Error ? error : new Error("Unable to poll brand insights status."));
      }
    });

    pollTimer = setInterval(() => {
      pollOnce().catch((error) => {
        if (!stopped) {
          options.onError?.(error instanceof Error ? error : new Error("Unable to poll brand insights status."));
        }
      });
    }, options.pollIntervalMs ?? DEFAULT_JOB_POLL_INTERVAL_MS);
  };

  const connectEventStream = () => {
    if (stopped || !options.streamChannel) {
      startPollingFallback();
      return;
    }

    closeEventSource();

    const streamUrl = resolveBrandInsightsEventsUrl(options.streamChannel, lastMessageId);
    const source = new EventSource(streamUrl, { withCredentials: true });
    eventSource = source;

    source.addEventListener("snapshot", (event) => {
      if (stopped) return;
      const payload = parseJsonEventData(event as MessageEvent<string>);
      if (!payload) return;

      const validated = trendsSseSnapshotDataSchema.safeParse(payload);
      if (!validated.success) {
        warnContractDrift("snapshot", validated.error.issues);
        return;
      }

      try {
        const status = mapBackendStatusResponse({ status: "success", data: validated.data });
        if (status.stream && typeof status.stream.latestMessageId === "number") {
          lastMessageId = status.stream.latestMessageId;
        }
        options.onStatus(status);
        if (isTerminalBrandInsightsStatus(status.status)) {
          stop();
        }
      } catch {
        // Mapping failed on an otherwise valid frame; skip and keep streaming.
      }
    });

    source.addEventListener("message", (event) => {
      if (stopped) return;
      const payload = parseJsonEventData(event as MessageEvent<string>);
      if (!payload) return;

      const validated = trendsSseMessageDataSchema.safeParse(payload);
      if (!validated.success) {
        warnContractDrift("message", validated.error.issues);
        return;
      }

      try {
        const message = mapBackendStatusMessage(validated.data);
        if (typeof message.messageId === "number") {
          lastMessageId = message.messageId;
        }
        options.onMessage?.(message);
      } catch {
        // Mapping failed on an otherwise valid frame; skip and keep streaming.
      }
    });

    source.addEventListener("ping", () => undefined);

    source.addEventListener("done", () => {
      closeEventSource();
      pollOnce()
        .catch(() => undefined)
        .finally(stop);
    });

    source.onerror = () => {
      if (stopped) return;
      closeEventSource();

      if (reconnectAttempts >= (options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS)) {
        startPollingFallback();
        return;
      }

      reconnectAttempts += 1;
      clearReconnectTimer();
      reconnectTimer = setTimeout(connectEventStream, reconnectAttempts * 1000);
    };

    source.onopen = () => {
      reconnectAttempts = 0;
    };
  };

  if (options.streamChannel) {
    if (!shouldUseEventSource(options.streamChannel)) {
      startPollingFallback();
      return stop;
    }
    connectEventStream();
  } else {
    startPollingFallback();
  }

  return stop;
}
