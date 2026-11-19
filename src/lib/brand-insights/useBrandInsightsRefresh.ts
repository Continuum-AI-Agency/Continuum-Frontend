'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useRouter } from '@/i18n/navigation';
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

/** Shown when the run gives no reason of its own; the run's own message wins. */
type FallbackReasons = { notBuilt: string; lostTrack: string };

function failureReason(status: BrandInsightsStatusResponse, fallback: string): string {
  return status.message ?? status.error ?? status.stageMessage ?? fallback;
}

/** Resolves with the failure reason, or null when the run completed. */
function waitForRun(
  run: {
    generationId: string;
    streamChannel?: string;
    fallbackPollUrl?: string;
  },
  fallbacks: FallbackReasons,
): Promise<string | null> {
  return new Promise((resolve) => {
    const stop = subscribeToBrandInsightsJob({
      ...run,
      onStatus: (next) => {
        if (!isTerminalBrandInsightsStatus(next.status)) return;
        stop();
        resolve(FAILED_STATUSES.has(next.status) ? failureReason(next, fallbacks.notBuilt) : null);
      },
      onError: (error) => {
        stop();
        resolve(error.message || fallbacks.lostTrack);
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
  const uiText = useTranslations('dashboard');

  const refresh = useCallback(async () => {
    if (!brandId) return;
    setIsFetching(true);
    setError(null);
    setWaitingForBrandReport(false);
    let failure: string | null = null;
    try {
      const result = await generateBrandInsights({ brandId });
      if (result.status === 'processing' && result.generationId) {
        failure = await waitForRun(
          {
            generationId: result.generationId,
            streamChannel: result.stream?.channel,
            fallbackPollUrl: result.fallbackPollUrl,
          },
          {
            notBuilt: uiText('the_trend_report_could_not_be_built_e0bc418'),
            lostTrack: uiText('lost_track_of_the_trend_report_while_it_was_b_fbedcdf'),
          },
        );
      }
    } catch (caught) {
      if (isBrandContextNotReady(caught)) setWaitingForBrandReport(true);
      else
        failure =
          caught instanceof Error
            ? caught.message
            : uiText('unable_to_start_trend_generation_b90f5bf');
    }

    setIsFetching(false);
    if (failure) {
      setError(failure);
      if (claimOncePerSession('error-toast', brandId)) {
        show({
          title: uiText('trend_report_failed_8bcacb7'),
          description: failure,
          variant: 'error',
          durationMs: Infinity,
          dedupeKey: `organic-insights-error:${brandId}`,
          action: { label: uiText('retry_942087c'), onClick: () => void refresh() },
        });
      }
    }
    // router.refresh() alone re-renders against the cached /api/trends/read response.
    await revalidateBrandInsights(brandId).catch(() => undefined);
    router.refresh();
  }, [brandId, router, show, uiText]);

  const { autoStartFirstRun = false } = options;
  useEffect(() => {
    if (autoStartFirstRun && claimOncePerSession('first-run', brandId)) void refresh();
  }, [autoStartFirstRun, brandId, refresh]);

  return { refresh, isFetching, error, waitingForBrandReport };
}
