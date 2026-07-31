'use client';

import type { IntegrationErrorCode } from '@continuum/contracts';
import {
  type OrganicAnalyticsScope,
  type OrganicDateRangePreset,
  type OrganicPlatform,
  organicMetricsResponseSchema,
} from '@/lib/schemas/organicMetrics';

export type OrganicAnalyticsRequest = {
  brandId: string;
  integrationAccountId: string;
  platform: Extract<OrganicPlatform, 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'linkedin'>;
  range: {
    preset: OrganicDateRangePreset;
    custom?: { from: string; to: string };
  };
  scope?: OrganicAnalyticsScope;
  selectedPostId?: string;
  postsLimit?: number;
  commentsLimit?: number;
  forceRefresh?: boolean;
};

export type OrganicAnalyticsFetchOptions = {
  /** Aborts the request — pass a component's unmount signal so a stale window fetch cannot resolve into a dead tree. */
  signal?: AbortSignal;
  timeoutMs?: number;
};

// The deep post-gallery windows are the heaviest call in the organic surface and
// have no server-side deadline of their own. Without a client deadline a stalled
// upstream leaves the feed indeterminate forever, which is exactly how
// "Loading previous 30d..." became permanent.
export const ORGANIC_ANALYTICS_TIMEOUT_MS = 45_000;

class OrganicAnalyticsAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrganicAnalyticsAbortError';
  }
}

// One controller that both the caller's signal and the deadline can trip, so the
// underlying fetch is genuinely cancelled either way and the reason survives.
function createDeadline(options: OrganicAnalyticsFetchOptions | undefined) {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? ORGANIC_ANALYTICS_TIMEOUT_MS;
  const state = { timedOut: false, cancelled: false };

  const timer = setTimeout(() => {
    state.timedOut = true;
    controller.abort();
  }, timeoutMs);

  const cancel = () => {
    state.cancelled = true;
    controller.abort();
  };

  const callerSignal = options?.signal;
  if (callerSignal?.aborted) cancel();
  else callerSignal?.addEventListener('abort', cancel, { once: true });

  return {
    signal: controller.signal,
    state,
    timeoutMs,
    release() {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', cancel);
    },
  };
}

export async function fetchOrganicAnalytics(
  request: OrganicAnalyticsRequest,
  options?: OrganicAnalyticsFetchOptions,
) {
  const deadline = createDeadline(options);

  try {
    const response = await fetch(`/api/organic-analytics/${request.platform}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: deadline.signal,
    });

    if (!response.ok) {
      let message = `Unable to load ${request.platform} organic analytics.`;
      let errorCode: IntegrationErrorCode | undefined;
      let retryAfter: number | undefined;
      // The edge names the integration that actually failed, which is not always the
      // platform being viewed — a YouTube panel fails on the `google` integration.
      let errorPlatform: string | undefined;
      try {
        const payload = (await response.json()) as {
          error?: string;
          errorCode?: IntegrationErrorCode;
          retryAfter?: number;
          platform?: string;
        };
        if (payload.error) message = payload.error;
        errorCode = payload.errorCode;
        retryAfter = payload.retryAfter;
        errorPlatform = payload.platform;
      } catch {
        // ignore non-JSON
      }
      throw Object.assign(new Error(message), { errorCode, retryAfter, errorPlatform });
    }

    const json = (await response.json()) as unknown;
    return organicMetricsResponseSchema.parse(json);
  } catch (error) {
    if (deadline.state.cancelled) {
      throw new OrganicAnalyticsAbortError('Request cancelled.');
    }
    if (deadline.state.timedOut) {
      throw new OrganicAnalyticsAbortError(
        `Loading ${request.platform} analytics timed out after ${Math.round(
          deadline.timeoutMs / 1000,
        )}s. Try again.`,
      );
    }
    throw error;
  } finally {
    deadline.release();
  }
}

// True for the "the caller walked away" case, which must never surface as an
// error banner — the user either unmounted the view or asked for something else.
export function isOrganicAnalyticsCancellation(error: unknown): boolean {
  return error instanceof OrganicAnalyticsAbortError && error.message === 'Request cancelled.';
}
