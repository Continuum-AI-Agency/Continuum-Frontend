'use client';

import {
  currentWeekStartUtc,
  parseFrame,
  type TrendsInsightReadyPayload,
  type TrendsReadFrame,
  trendsInsightReadyPayloadSchema,
  trendsReadFrameSchema,
  trendsSseMessageDataSchema,
  trendsSseSnapshotDataSchema,
} from '@continuum/contracts';
import { getApiBaseUrl } from '@/lib/api/config';
import { assertOk } from '@/lib/api/errors';
import type { RequestOptions } from '@/lib/api/http.types';
import {
  mapBackendGenerationResponse,
  mapBackendInsightsResponse,
  mapBackendStatusMessage,
  mapBackendStatusResponse,
} from '@/lib/brand-insights/backend';
import {
  type BrandInsightsStatusMessage,
  type BrandInsightsStatusResponse,
  brandInsightsGenerateInputSchema,
} from '@/lib/schemas/brandInsights';

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
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
  const resolvedWindowStartDate = input.windowStart
    ? parseIsoTimestamp(input.windowStart, 'windowStart')
    : input.weekStartDate
      ? parseWeekStartDate(input.weekStartDate)
      : currentWeekStartUtc();

  const resolvedWindowEndDate = input.windowEnd
    ? parseIsoTimestamp(input.windowEnd, 'windowEnd')
    : new Date(resolvedWindowStartDate.getTime() + WEEK_IN_MS);

  return {
    weekStartDate: input.weekStartDate ?? toIsoDate(resolvedWindowStartDate),
    windowStart: input.windowStart ?? resolvedWindowStartDate.toISOString(),
    windowEnd: input.windowEnd ?? resolvedWindowEndDate.toISOString(),
  };
}

async function getBrowserAccessToken(): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined;
  try {
    const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? undefined;
  } catch {
    return undefined;
  }
}

async function request<TResponse = unknown>(
  options: RequestOptions<TResponse>,
): Promise<TResponse> {
  const { path, method = 'GET', body, headers = {}, schema, cache, next } = options;
  const baseUrl = getApiBaseUrl();
  const url = /^https?:\/\//i.test(path)
    ? path
    : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const token = await getBrowserAccessToken();
  const finalHeaders: Record<string, string> = {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
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
    path: '/api/trends/jobs/start',
    method: 'POST',
    body: {
      brand_id: parsed.brandId,
      week_start_date: window.weekStartDate,
      window_start: window.windowStart,
      window_end: window.windowEnd,
      platforms: parsed.selectedSocialPlatforms ?? undefined,
      items_per_platform: parsed.maxItemsPerPlatform ?? undefined,
      force_regenerate: parsed.forceRegenerate ?? undefined,
    },
    cache: 'no-store',
  });

  return mapBackendGenerationResponse(response);
}

/** Read the additive collection for one persisted calendar week. */
export async function fetchBrandInsightsWeek(input: { brandId: string; weekStartDate: string }) {
  const response = await request({
    path: '/api/trends/read',
    method: 'POST',
    body: {
      brand_id: input.brandId,
      week_start_date: input.weekStartDate,
    },
    cache: 'no-store',
  });
  return mapBackendInsightsResponse(response);
}

type FetchBrandInsightsStatusOptions = {
  path?: string;
};

export async function fetchBrandInsightsStatus(
  generationId: string,
  options?: FetchBrandInsightsStatusOptions,
) {
  const response = await request({
    path: options?.path ?? `/api/trends/jobs/${encodeURIComponent(generationId)}`,
    method: 'GET',
    cache: 'no-store',
  });

  return mapBackendStatusResponse(response);
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'error', 'not_found']);
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
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[brand-insights] dropped malformed ${kind} frame (contract drift)`, issues);
  }
}

export function isTerminalBrandInsightsStatus(status?: string | null): boolean {
  return status ? TERMINAL_STATUSES.has(status) : false;
}

export function resolveBrandInsightsEventsUrl(channel: string, afterMessageId?: number): string {
  const baseUrl = getApiBaseUrl();
  const resolved = new URL(channel, `${baseUrl.replace(/\/$/, '')}/`);
  if (typeof afterMessageId === 'number' && Number.isFinite(afterMessageId)) {
    resolved.searchParams.set('after', String(afterMessageId));
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
  /**
   * A lane's synthesized items streamed the moment it settles (~a lane before
   * completion). Provisional preview — the authoritative persisted set arrives
   * via the post-completion read stream.
   */
  onInsightPreview?: (preview: TrendsInsightReadyPayload) => void;
  onError?: (error: Error) => void;
};

function shouldUseEventSource(streamChannel?: string) {
  if (!streamChannel || typeof window === 'undefined') return false;
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
    if (status.stream && typeof status.stream.latestMessageId === 'number') {
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
        options.onError?.(
          error instanceof Error ? error : new Error('Unable to poll brand insights status.'),
        );
      }
    });

    pollTimer = setInterval(() => {
      pollOnce().catch((error) => {
        if (!stopped) {
          options.onError?.(
            error instanceof Error ? error : new Error('Unable to poll brand insights status.'),
          );
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

    source.addEventListener('snapshot', (event) => {
      if (stopped) return;
      const payload = parseJsonEventData(event as MessageEvent<string>);
      if (!payload) return;

      const validated = trendsSseSnapshotDataSchema.safeParse(payload);
      if (!validated.success) {
        warnContractDrift('snapshot', validated.error.issues);
        return;
      }

      try {
        const status = mapBackendStatusResponse({ status: 'success', data: validated.data });
        if (status.stream && typeof status.stream.latestMessageId === 'number') {
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

    source.addEventListener('message', (event) => {
      if (stopped) return;
      const payload = parseJsonEventData(event as MessageEvent<string>);
      if (!payload) return;

      const validated = trendsSseMessageDataSchema.safeParse(payload);
      if (!validated.success) {
        warnContractDrift('message', validated.error.issues);
        return;
      }

      if (typeof validated.data.message_id === 'number') {
        lastMessageId = validated.data.message_id;
      }

      // Progressive preview: surface a lane's provisional items and keep streaming
      // (this is not a status transition, so it never reaches onMessage).
      if (validated.data.event_type === 'insight_ready') {
        const preview = trendsInsightReadyPayloadSchema.safeParse(validated.data.payload);
        if (preview.success) {
          options.onInsightPreview?.(preview.data);
        } else {
          warnContractDrift('insight_ready', preview.error.issues);
        }
        return;
      }

      try {
        const message = mapBackendStatusMessage(validated.data);
        options.onMessage?.(message);
      } catch {
        // Mapping failed on an otherwise valid frame; skip and keep streaming.
      }
    });

    source.addEventListener('ping', () => undefined);

    source.addEventListener('done', () => {
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

/**
 * Read a persisted, completed Trends generation progressively. This uses
 * `fetch` rather than EventSource so the browser can attach the Supabase bearer
 * token. Callers receive sections as their independent server queries settle;
 * no in-flight generation content crosses this boundary.
 */
export async function streamCompletedBrandInsightsRead(input: {
  brandId: string;
  generationId?: string;
  onFrame: (frame: TrendsReadFrame) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const token = await getBrowserAccessToken();
  if (!token) throw new Error('Missing access token for Trends read stream.');

  const url = new URL('/api/trends/read/stream', getApiBaseUrl());
  url.searchParams.set('brand_id', input.brandId);
  if (input.generationId) url.searchParams.set('generation_id', input.generationId);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: input.signal,
  });
  await assertOk(response);
  if (!response.body) throw new Error('Trends read stream returned no body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    buffered += decoder.decode(result.value, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const frame = parseFrame(line, trendsReadFrameSchema);
      if (!frame) {
        warnContractDrift('trends read', line);
        continue;
      }
      input.onFrame(frame);
    }
  }
}
