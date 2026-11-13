'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { revalidateBrandInsights } from '@/lib/actions/brandInsights';
import {
  generateBrandInsights,
  isTerminalBrandInsightsStatus,
  subscribeToBrandInsightsJob,
} from '@/lib/api/brandInsights.client';
import { ApiError } from '@/lib/api/errors';
import { claimOncePerSession } from '@/lib/brand-insights/oncePerSession';
import type { BrandInsightsStatusResponse } from '@/lib/schemas/brandInsights';

const FAILED_STATUSES = new Set(['failed', 'error', 'not_found']);

type Options = {
  /** The brand has no completed generation: start the first one once per session. */
  autoStartFirstRun?: boolean;
};

function isBrandContextNotReady(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.payload?.error_code === 'brand_context_not_ready'
  );
}

function failureReason(status: BrandInsightsStatusResponse): string {
  return (
    status.message ?? status.error ?? status.stageMessage ?? 'The trend report could not be built.'
  );
}

/** Resolves with the failure reason, or null when the run completed. */
function waitForRun(run: {
  generationId: string;
  streamChannel?: string;
  fallbackPollUrl?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const stop = subscribeToBrandInsightsJob({
      ...run,
      onStatus: (next) => {
        if (!isTerminalBrandInsightsStatus(next.status)) return;
        stop();
        resolve(FAILED_STATUSES.has(next.status) ? failureReason(next) : null);
      },
      onError: (error) => {
        stop();
        resolve(error.message || 'Lost track of the trend report while it was building.');
      },
    });
  });
}

export function useBrandInsightsRefresh(brandId: string, options: Options = {}) {
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitingForBrandReport, setWaitingForBrandReport] = useState(false);
  const router = useRouter();
  const { show } = useToast();

  const refresh = useCallback(async () => {
    if (!brandId) return;
    setIsFetching(true);
    setError(null);
    setWaitingForBrandReport(false);
    let failure: string | null = null;
    try {
      const result = await generateBrandInsights({ brandId });
      if (result.status === 'processing' && result.generationId) {
        failure = await waitForRun({
          generationId: result.generationId,
          streamChannel: result.stream?.channel,
          fallbackPollUrl: result.fallbackPollUrl,
        });
      }
    } catch (caught) {
      if (isBrandContextNotReady(caught)) setWaitingForBrandReport(true);
      else failure = caught instanceof Error ? caught.message : 'Unable to start trend generation.';
    }

    setIsFetching(false);
    if (failure) {
      setError(failure);
      if (claimOncePerSession('error-toast', brandId)) {
        show({
          title: 'Trend report failed',
          description: failure,
          variant: 'error',
          durationMs: Infinity,
          dedupeKey: `organic-insights-error:${brandId}`,
          action: { label: 'Retry', onClick: () => void refresh() },
        });
      }
    }
    // router.refresh() alone re-renders against the cached /api/trends/read response.
    await revalidateBrandInsights(brandId).catch(() => undefined);
    router.refresh();
  }, [brandId, router, show]);

  const { autoStartFirstRun = false } = options;
  useEffect(() => {
    if (autoStartFirstRun && claimOncePerSession('first-run', brandId)) void refresh();
  }, [autoStartFirstRun, brandId, refresh]);

  return { refresh, isFetching, error, waitingForBrandReport };
}
