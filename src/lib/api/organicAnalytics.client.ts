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

export async function fetchOrganicAnalytics(request: OrganicAnalyticsRequest) {
  const response = await fetch(`/api/organic-analytics/${request.platform}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
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
}
